/**
 * Rule engine behind "automatically change my status".
 *
 * Kept free of stores and API calls on purpose - the coordinator feeds it plain
 * facts and gets back one decision, which is what makes the priority rules testable
 * at all. There is also a harder reason for it living here rather than inline: VRCX
 * already had one writer of the status field (the alone/company auto change), and a
 * second writer added alongside it would flip the status back and forth every few
 * seconds against the same unthrottled PUT. So every candidate - the new rules and
 * the old behaviour - is collected here and resolved into exactly one answer.
 */

/**
 * Highest priority first. busy being on top is not arbitrary: the point of the red
 * light is "do not come looking for me", so a red rule has to be able to beat a blue
 * one, never the other way round.
 */
export const STATUS_PRIORITY = ['busy', 'ask me', 'active', 'join me'];

export const RULE_TYPE = {
    Friend: 'friend',
    World: 'world'
};

/**
 * How a friend rule decides you are "together".
 *
 * Same instance works for anybody, because the game log lists everyone in the room.
 * Same world but a different instance only works for friends - a stranger's location
 * is never sent to us, so there is nothing to compare and the rule must not pretend
 * otherwise.
 */
export const FRIEND_SCOPE = {
    Instance: 'instance',
    World: 'world'
};

const MAX_NAME = 60;
const MAX_ID = 80;
// VRChat caps the status description at 32 characters; the dialog enforces it too,
// but a hand edited config blob should not be able to push a longer one through.
const MAX_DESCRIPTION = 32;

function clampText(value, max) {
    return String(value ?? '')
        .slice(0, max)
        .trim();
}

/**
 * @param {string} status
 * @returns {boolean} Whether it is one of the four lights we are allowed to set
 */
export function isKnownStatus(status) {
    return STATUS_PRIORITY.includes(status);
}

/**
 * @param {string} higher
 * @param {string} lower
 * @returns {boolean} True when `higher` should win a conflict against `lower`
 */
// Deliberately a table rather than a call to friend.js's sortStatus: that one is a
// comparator for sorting the friend list, its return convention reads back-to-front
// for this purpose, and getting it wrong here would invert the whole feature in a way
// the user would only discover by getting caught out. STATUS_PRIORITY above is the
// rule, stated once, in the order the request asked for.
const STATUS_RANK = STATUS_PRIORITY.reduce((acc, status, i) => {
    acc[status] = i;
    return acc;
}, {});

export function outranks(a, b) {
    if (!isKnownStatus(a)) {
        return false;
    }
    if (!isKnownStatus(b)) {
        return true;
    }
    return STATUS_RANK[a] < STATUS_RANK[b];
}

/**
 * Turn one entry of a stored blob into a usable rule, or drop it.
 *
 * Anything unrecognised is discarded rather than repaired: a rule that half parsed
 * would change the user's status based on a condition nobody ever chose, which is
 * worse than the rule silently not existing.
 *
 * @param {object} input
 * @param {number} index - Position in the list, used for the tie-break order
 * @returns {object | null}
 */
export function normalizeAutoStatusRule(input, index = 0) {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const type = input.type === RULE_TYPE.World ? RULE_TYPE.World : RULE_TYPE.Friend;
    const targetId = clampText(input.targetId, MAX_ID);
    if (!targetId || !isKnownStatus(input.status)) {
        return null;
    }
    const description = clampText(input.description, MAX_DESCRIPTION);
    return {
        id: clampText(input.id, MAX_ID) || `rule-${index}-${targetId}`,
        enabled: input.enabled !== false,
        name: clampText(input.name, MAX_NAME),
        type,
        targetId,
        targetName: clampText(input.targetName, MAX_NAME),
        status: input.status,
        // Derived from the text, never stored separately. An earlier version took a
        // `descriptionEnabled` flag from the input as well, and the two fought each
        // other: the field was only shown when the flag was on, while the flag was
        // forced off whenever the text was empty - which is every new rule - so the
        // box could never appear and the signature was unreachable. One source of
        // truth removes the whole class of problem, and "empty means leave it alone"
        // is the rule the UI states anyway.
        descriptionEnabled: description.length > 0,
        description,
        // Pinning is how a person says "this one wins even though it is a blue light".
        pin: input.pin === true,
        friendScope: input.friendScope === FRIEND_SCOPE.World ? FRIEND_SCOPE.World : FRIEND_SCOPE.Instance
    };
}

/**
 * @param {object} rules - Array of normalized rules
 * @param {string} json - Raw stored value
 * @returns {object[]} Sanitized rules
 */
export function parseAutoStatusRules(json) {
    if (!json) {
        return [];
    }
    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch {
        return [];
    }
    // An envelope rather than a bare array so the blob can grow a version later
    // without every stored rule becoming unreadable.
    const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rules) ? parsed.rules : [];
    return source.map((entry, i) => normalizeAutoStatusRule(entry, i)).filter(Boolean);
}

/**
 * Split the world/instance identity out of a VRChat location tag.
 *
 * Compared as whole tags, `wrld_x~instance~region=jp` and the same room in `~region=us`
 * would not match, and neither would a tag that carries the host's name. Rules are
 * pinned to ids for that reason.
 *
 * @param {string} tag
 * @returns {{ worldId: string; instanceId: string }}
 */
export function splitLocationTag(tag) {
    const raw = String(tag || '');
    const tilde = raw.indexOf('~');
    const head = tilde === -1 ? raw : raw.slice(0, tilde);
    if (!head) {
        return { worldId: '', instanceId: '' };
    }
    const parts = head.split(':');
    return {
        worldId: parts[0] || '',
        instanceId: parts.length > 1 ? parts.slice(1).join(':') : '0'
    };
}

/**
 * @param {object} rule - Normalized rule
 * @param {object} context - { myTag, occupants: Map<userId,displayName>, friendTags: Map<userId,tag> }
 * @returns {boolean}
 */
export function ruleMatches(rule, context) {
    if (!rule || !rule.enabled) {
        return false;
    }
    const my = splitLocationTag(context?.myTag);
    if (!my.worldId) {
        return false;
    }

    if (rule.type === RULE_TYPE.World) {
        return rule.targetId === my.worldId;
    }

    const occupants = context.occupants;
    if (occupants?.has?.(rule.targetId)) {
        // The game log sometimes yields an entry with no id at all, only a name, so
        // matching on the id alone silently misses the person the rule was made for.
        return true;
    }
    const byName = context.occupantNames;
    const targetName = rule.targetName || rule.name;
    if (targetName && byName?.has?.(targetName)) {
        return true;
    }

    if (rule.friendScope === FRIEND_SCOPE.World) {
        const tag = context.friendTags?.get?.(rule.targetId);
        if (tag) {
            return splitLocationTag(tag).worldId === my.worldId;
        }
    }
    return false;
}

/**
 * What to do when nothing matches any more.
 *
 * The engine used to simply stop acting - it bailed out whenever the game was closed -
 * which meant a rule that set the status to red left it red after the user logged out,
 * with nothing ever putting it back. This is the missing half.
 *
 * Three modes, because "put it back" can mean different things and the intrusive
 * reading is the wrong default:
 *
 * Restore  - only undo what this feature itself did. Needs the baseline that was
 * captured just before the first rule-driven change. Never overwrites a
 * status the person chose by hand.
 * fixed    - always settle to the configured light while nothing matches, including
 * over a manual choice. Some people want exactly this; it is a real
 * trade and it is spelled out in the UI.
 * off      - leave the status alone.
 *
 * @param {object} input
 * @param {object | null} input.decision - The rule/legacy decision, if any matched
 * @param {string} input.mode
 * @param {{ status: string; description: string | null } | null} input.baseline
 * @param {{ status: string; description: string | null } | null} [input.fallback]
 * @param {string} input.currentStatus
 * @returns {{ status: string; description: string | null; source: string } | null}
 */
export function decideFallbackStatus({ decision, mode, baseline, fallback, currentStatus }) {
    // Something matched; that decision stands and there is nothing to fall back to.
    if (decision) {
        return null;
    }
    if (mode === 'off') {
        return null;
    }

    let candidate = null;
    if (mode === 'fixed') {
        // Settles outside a room too - that is the whole point of a fixed light.
        candidate = fallback;
    } else if (baseline) {
        // 'restore': only ever undo our own change. Inside a room and outside both.
        candidate = baseline;
    }

    if (!candidate || !isKnownStatus(candidate.status)) {
        return null;
    }
    // Already there. Returning null rather than a no-op decision keeps the caller from
    // firing a PUT every three seconds against an endpoint that is not throttled.
    if (candidate.status === currentStatus && !candidate.description) {
        return null;
    }

    return {
        status: candidate.status,
        description: candidate.description ? String(candidate.description).slice(0, MAX_DESCRIPTION) : null,
        source: mode === 'fixed' ? 'fallback' : 'restore'
    };
}

/**
 * Whether a baseline should be recorded right now.
 *
 * Only a rule-driven change is undoable this way. The old alone/company behaviour is
 * upstream's feature and has always written the status without keeping a record; making
 * this feature responsible for undoing it would surprise its users.
 *
 * @param {object | null} decision
 * @param {object | null} baseline
 * @returns {boolean}
 */
export function shouldCaptureBaseline(decision, baseline) {
    return decision?.source === 'rule' && !baseline;
}

/**
 * Pick the single rule that should win.
 *
 * Pinned rules are considered first as a group - that is the whole point of pinning.
 * Inside a group, the higher light wins, and equal lights fall back to list order so
 * the result does not depend on how the object happened to be keyed.
 *
 * @param {object[]} rules
 * @param {object} context
 * @returns {object | null}
 */
export function pickWinningRule(rules, context) {
    const matched = (Array.isArray(rules) ? rules : []).filter((rule) => ruleMatches(rule, context));
    if (!matched.length) {
        return null;
    }
    const best = matched.reduce((current, candidate) => {
        const currentPinned = current.pin === true;
        const candidatePinned = candidate.pin === true;
        if (candidatePinned !== currentPinned) {
            return candidatePinned ? candidate : current;
        }
        return outranks(candidate.status, current.status) ? candidate : current;
    }, matched[0]);
    return best;
}

/**
 * The one decision the coordinator is allowed to act on.
 *
 * @param {object} input
 * @param {object[]} input.rules - Normalized rules
 * @param {object} input.context - What ruleMatches needs
 * @param {{ status: string; description?: string } | null} [input.legacy] - The old
 *   alone/company result, passed through so there is still exactly one writer
 * @param {boolean} [input.blendLegacy] - When true the old behaviour joins the same
 *   priority contest instead of always losing to a matching rule
 * @returns {{ status: string; description: string | null; source: string; label: string } | null}
 */
export function decideAutoStatus({ rules, context, legacy = null, blendLegacy = false }) {
    const winner = pickWinningRule(rules, context);

    if (winner && !blendLegacy) {
        return {
            status: winner.status,
            description: winner.descriptionEnabled ? winner.description : null,
            source: 'rule',
            label: winner.name || winner.targetName || winner.targetId
        };
    }

    if (legacy && isKnownStatus(legacy.status)) {
        if (!winner) {
            return {
                status: legacy.status,
                description: legacy.description ? String(legacy.description).slice(0, MAX_DESCRIPTION) : null,
                source: 'legacy',
                label: ''
            };
        }
        // Blending is what the priority list says it should be: the stronger light wins
        // no matter which feature it came from.
        const legacyAsRule = { status: legacy.status, pin: false };
        const chosen = outranks(legacyAsRule.status, winner.status) ? legacyAsRule : winner;
        const fromLegacy = chosen === legacyAsRule;
        return {
            status: chosen.status,
            description: fromLegacy
                ? legacy.description
                    ? String(legacy.description).slice(0, MAX_DESCRIPTION)
                    : null
                : winner.descriptionEnabled
                  ? winner.description
                  : null,
            source: fromLegacy ? 'legacy' : 'rule',
            label: fromLegacy ? '' : winner.name || winner.targetName || winner.targetId
        };
    }

    if (winner) {
        return {
            status: winner.status,
            description: winner.descriptionEnabled ? winner.description : null,
            source: 'rule',
            label: winner.name || winner.targetName || winner.targetId
        };
    }
    return null;
}
