/**
 * Decision engine behind "let these friends into my room without asking me".
 *
 * Pure on purpose. What it does in the real world is send an invite on your behalf,
 * which is the most consequential thing this fork does: it opens a private room to
 * somebody while you are unconscious. So every reason it can say "no" to lives here,
 * in a function that takes plain facts and returns one labelled answer, and every one
 * of those reasons has a test.
 *
 * The guards that are *not* configurable are deliberate. A switch that lets you
 * auto-admit strangers to a group room you are standing in would be a footgun nobody
 * reads the label of at midnight, so the room always has to be your own, and the
 * requester always has to be somebody you added by hand.
 */

import {
    AUTO_INVITE_DEFAULT_DAILY_LIMIT,
    AUTO_INVITE_FRIEND_COOLDOWN_MS,
    AUTO_INVITE_MAX_DAILY_LIMIT
} from '../constants/autoInvite';
import { parseLocation } from './locationParser';

const MAX_ID = 80;
const MAX_NAME = 60;

/**
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function clampText(text, max) {
    return String(text ?? '')
        .trim()
        .slice(0, max);
}

/**
 * @param {object} input
 * @param {number} index
 * @returns {object | null} Null when the row is unusable
 */
function normalizeAutoInviteRule(input, index = 0) {
    if (!input || typeof input !== 'object') {
        return null;
    }
    const userId = clampText(input.userId, MAX_ID);
    if (!userId.startsWith('usr_')) {
        return null;
    }
    return {
        id: clampText(input.id, MAX_ID) || `invite-${index}-${userId}`,
        enabled: input.enabled !== false,
        userId,
        displayName: clampText(input.displayName, MAX_NAME)
    };
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampInt(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

/**
 * @param {object} input
 * @returns {object} Settings with every field present and inside its bounds.
 */
function normalizeAutoInviteSettings(input) {
    // A default parameter only covers `undefined`, and a settings blob read back from
    // storage can genuinely be null - so the guard has to be here, not in the
    // signature.
    const source = input && typeof input === 'object' ? input : {};
    const window = source.window && typeof source.window === 'object' ? source.window : {};
    return {
        // Off until it is switched on. Nobody gets let in by a feature they never
        // turned on, however sensible the defaults look.
        enabled: source.enabled === true,
        askMeOnly: source.askMeOnly === true,
        notify: source.notify !== false,
        dailyLimit: clampInt(source.dailyLimit, AUTO_INVITE_DEFAULT_DAILY_LIMIT, 1, AUTO_INVITE_MAX_DAILY_LIMIT),
        window: {
            enabled: window.enabled === true,
            // Minutes since local midnight. An end before the start means the
            // window runs through midnight, which is the case this exists for.
            fromMinute: clampInt(window.fromMinute, 0, 0, 1439),
            toMinute: clampInt(window.toMinute, 1439, 0, 1439)
        }
    };
}

/**
 * Is this minute of the day inside the configured window?
 *
 * @param {number} minuteOfDay
 * @param {number} fromMinute
 * @param {number} toMinute
 * @returns {boolean}
 */
function insideWindow(minuteOfDay, fromMinute, toMinute) {
    if (fromMinute === toMinute) {
        return true;
    }
    if (fromMinute < toMinute) {
        return minuteOfDay >= fromMinute && minuteOfDay < toMinute;
    }
    return minuteOfDay >= fromMinute || minuteOfDay < toMinute;
}

/**
 * @param {number} at - Epoch ms
 * @returns {number} Minutes since local midnight
 */
function minuteOfDayOf(at) {
    const date = new Date(at);
    return date.getHours() * 60 + date.getMinutes();
}

/**
 * The one room shape this feature may ever act on: somewhere you are standing right
 * now, that is yours, and where an invite is actually what keeps people out.
 *
 * Public and group instances are excluded because letting somebody into a group room
 * you are only a guest in is not your call to make - and a public room needs no
 * invite in the first place, so a request for it is not this feature's problem.
 *
 * @param {string} locationTag
 * @param {string} currentUserId
 * @returns {boolean}
 */
function isOwnInviteRoom(locationTag, currentUserId) {
    if (!locationTag || !currentUserId) {
        return false;
    }
    const parsed = parseLocation(locationTag);
    if (!parsed.isRealInstance || !parsed.worldId) {
        return false;
    }
    if (parsed.accessType === 'public' || parsed.accessType === 'group') {
        return false;
    }
    return parsed.userId === currentUserId;
}

/**
 * One answer for one incoming notification.
 *
 * `context` is the plain facts the coordinator collected: where you are, what light
 * you are wearing, and what this feature has already done recently. Nothing in here
 * reads a store or calls the API, so the whole policy can be read and tested at once.
 *
 * @param {{
 *     notification: { id?: string; type?: string; senderUserId?: string; expired?: boolean };
 *     settings: object;
 *     rules: object[];
 *     context: {
 *         currentUserId?: string;
 *         locationTag?: string;
 *         status?: string;
 *         todayCount?: number;
 *         lastAcceptAt?: number;
 *     };
 *     now?: number;
 *     cooldownMs?: number;
 * }} input
 * @returns {{ action: 'accept' | 'skip' | 'none'; reason: string; rule: object | null }}
 */
function decideAutoInvite(input = {}) {
    const notification = input.notification || {};
    const now = Number(input.now) || Date.now();
    const cooldownMs = Number.isFinite(Number(input.cooldownMs))
        ? Number(input.cooldownMs)
        : AUTO_INVITE_FRIEND_COOLDOWN_MS;
    const settings = normalizeAutoInviteSettings(input.settings);
    const context = input.context || {};

    const skip = (reason) => ({ action: 'skip', reason, rule: null });

    if (notification.type !== 'requestInvite') {
        // Anything else - a plain invite, a friend request, a response - is not a
        // knock on your own door.
        return { action: 'none', reason: 'not-request', rule: null };
    }
    if (notification.expired) {
        return skip('already-handled');
    }
    if (!settings.enabled) {
        return skip('disabled');
    }
    const sender = clampText(notification.senderUserId, MAX_ID);
    if (!sender) {
        return skip('not-listed');
    }
    const rule = (input.rules || []).find((entry) => entry && entry.enabled !== false && entry.userId === sender);
    if (!rule) {
        return skip('not-listed');
    }
    if (!isOwnInviteRoom(context.locationTag, context.currentUserId)) {
        return skip('not-own-instance');
    }
    if (settings.askMeOnly && context.status !== 'ask me') {
        return skip('status-gate');
    }
    if (
        settings.window.enabled &&
        !insideWindow(minuteOfDayOf(now), settings.window.fromMinute, settings.window.toMinute)
    ) {
        return skip('outside-window');
    }
    if (Number(context.todayCount) >= settings.dailyLimit) {
        return skip('daily-limit');
    }
    const last = Number(context.lastAcceptAt) || 0;
    if (last && now - last < cooldownMs) {
        return skip('cooldown');
    }
    return { action: 'accept', reason: 'accepted', rule };
}

/**
 * @param {object} input
 * @returns {object}
 */
function normalizeAutoInviteState(input) {
    const source = input && typeof input === 'object' ? input : {};
    const rules = [];
    for (const [index, entry] of Array.isArray(source.rules) ? source.rules.entries() : []) {
        const rule = normalizeAutoInviteRule(entry, index);
        if (rule) {
            rules.push(rule);
        }
    }
    return { settings: normalizeAutoInviteSettings(source.settings), rules };
}

export {
    clampInt,
    decideAutoInvite,
    insideWindow,
    isOwnInviteRoom,
    minuteOfDayOf,
    normalizeAutoInviteRule,
    normalizeAutoInviteSettings,
    normalizeAutoInviteState
};
