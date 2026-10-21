/**
 * Turning "who is in this room" into "who in this room do I share friends with".
 *
 * Pure on purpose, like the other decision layers in this fork: the coordinator feeds it
 * the roster and whatever lookups have come back so far, and gets an ordered list plus
 * the one question it still needs to ask. That is what makes the interesting parts
 * testable - the ceiling, who is exempt from being asked at all, and what a lookup that
 * was refused looks like on screen.
 *
 * Two things about the shape of the answer matter more than the rest:
 *
 * - A player who _is_ your friend is never looked up. The count would be a number about somebody you already know, and it
 *   would cost a request for nothing.
 * - "Nothing came back" is not the same as "zero mutual friends". VRChat lets a player hide their connections, and the
 *   endpoint answers 403. Showing that as 0 would tell you something untrue about a stranger, so it is its own state
 *   and reads differently.
 */

import { ROOM_MUTUAL_CACHE_TTL_MS, ROOM_MUTUAL_DENIED_TTL_MS, ROOM_MUTUAL_MAX_PLAYERS } from '../constants/roomMutuals';

/**
 * What the page is allowed to say about one player.
 */
export const ROOM_MUTUAL_STATE = {
    Mutual: 'mutual',
    None: 'none',
    Friend: 'friend',
    Pending: 'pending',
    Skipped: 'skipped',
    Denied: 'denied'
};

// Lower sorts first, after the mutual count. Somebody you can actually talk to about a
// shared friend is more useful at the top than somebody whose profile you have to open.
const STATE_ORDER = {
    [ROOM_MUTUAL_STATE.Mutual]: 0,
    [ROOM_MUTUAL_STATE.None]: 1,
    [ROOM_MUTUAL_STATE.Friend]: 2,
    [ROOM_MUTUAL_STATE.Pending]: 3,
    [ROOM_MUTUAL_STATE.Skipped]: 4,
    [ROOM_MUTUAL_STATE.Denied]: 5
};

/**
 * @param {unknown} value
 * @returns {number}
 */
function toTime(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * @param {object | null | undefined} entry
 * @param {number} now
 * @returns {boolean}
 */
function isCacheFresh(entry, now) {
    if (!entry || !Number.isFinite(Number(entry.at))) {
        return false;
    }
    // A refusal is held longer than a success: an answer that was "no" is not going to
    // change inside the next few minutes, and re-asking it on every room hop is the one
    // way this feature could turn into a stream of wasted requests.
    const ttl = entry.denied ? ROOM_MUTUAL_DENIED_TTL_MS : ROOM_MUTUAL_CACHE_TTL_MS;
    return now - Number(entry.at) < ttl;
}

/**
 * @param {{ userId: string; displayName?: string; joinTime?: number }[]} players
 * @param {string} selfId
 * @returns {{ userId: string; displayName: string; joinTime: number }[]}
 */
function normalisePlayers(players, selfId) {
    const byId = new Map();
    for (const player of players || []) {
        const userId = String(player?.userId ?? '');
        if (!userId || userId === selfId) {
            continue;
        }
        const joinTime = toTime(player?.joinTime);
        const existing = byId.get(userId);
        if (existing) {
            // The game log can report the same player twice across a re-entry; the
            // earlier arrival is the one that is true.
            if (joinTime && (!existing.joinTime || joinTime < existing.joinTime)) {
                existing.joinTime = joinTime;
            }
            continue;
        }
        byId.set(userId, {
            userId,
            displayName: String(player?.displayName ?? '').trim() || userId,
            joinTime
        });
    }
    return [...byId.values()];
}

/**
 * @param {object} input
 * @param {{ userId: string; displayName?: string; joinTime?: number }[]} input.players - The room roster
 * @param {string} input.selfId - Never listed as somebody to look up
 * @param {Set<string>} [input.friendIds] - Your own friends, exempt from being asked about
 * @param {Set<string>} [input.hiddenIds] - Hidden friends, left out of the list entirely
 * @param {Map<string, object> | object} [input.cache] - UserId -> { friends, groups, at, denied }
 * @param {number} [input.now]
 * @param {number} [input.limit]
 * @returns {object[]} Ordered rows, most useful first
 */
function buildRoomMutualRows({ players = [], selfId = '', friendIds, hiddenIds, cache, now, limit }) {
    const currentTime = toTime(now) || Date.now();
    const ceiling = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : ROOM_MUTUAL_MAX_PLAYERS;
    const friends = friendIds instanceof Set ? friendIds : new Set(friendIds || []);
    const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds || []);
    const cacheMap = cache instanceof Map ? cache : new Map(Object.entries(cache || {}));

    const roster = normalisePlayers(players, String(selfId ?? '')).filter((player) => !hidden.has(player.userId));

    // The ceiling is spent on whoever has been in the room longest, not on whoever the
    // game log happened to mention first.
    const byArrival = [...roster].sort((a, b) => (a.joinTime || Infinity) - (b.joinTime || Infinity));
    const lookups = new Set();
    for (const player of byArrival) {
        if (friends.has(player.userId)) {
            continue;
        }
        if (lookups.size >= ceiling) {
            break;
        }
        lookups.add(player.userId);
    }

    const rows = roster.map((player) => {
        if (friends.has(player.userId)) {
            return { ...player, state: ROOM_MUTUAL_STATE.Friend, mutualCount: null, mutualGroups: null };
        }
        const entry = cacheMap.get(player.userId);
        if (entry && isCacheFresh(entry, currentTime)) {
            if (entry.denied) {
                return { ...player, state: ROOM_MUTUAL_STATE.Denied, mutualCount: null, mutualGroups: null };
            }
            const count = Number(entry.friends);
            const safeCount = Number.isFinite(count) && count > 0 ? count : 0;
            return {
                ...player,
                state: safeCount > 0 ? ROOM_MUTUAL_STATE.Mutual : ROOM_MUTUAL_STATE.None,
                mutualCount: safeCount,
                mutualGroups: Number.isFinite(Number(entry.groups)) ? Number(entry.groups) : 0
            };
        }
        return {
            ...player,
            state: lookups.has(player.userId) ? ROOM_MUTUAL_STATE.Pending : ROOM_MUTUAL_STATE.Skipped,
            mutualCount: null,
            mutualGroups: null
        };
    });

    rows.sort((a, b) => {
        const left = a.mutualCount ?? -1;
        const right = b.mutualCount ?? -1;
        if (left !== right) {
            return right - left;
        }
        const order = (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9);
        if (order !== 0) {
            return order;
        }
        return String(a.displayName).localeCompare(String(b.displayName));
    });
    return rows;
}

/**
 * Who still has to be asked.
 *
 * @param {object[]} rows - As produced by buildRoomMutualRows
 * @returns {string[]} UserIds, in the order they should be requested
 */
function planRoomMutualFetch(rows) {
    return (rows || []).filter((row) => row.state === ROOM_MUTUAL_STATE.Pending).map((row) => row.userId);
}

/**
 * The one-line summary the page header shows.
 *
 * @param {object[]} rows
 * @returns {{ players: number; withMutuals: number; friends: number; unknown: number; pending: number }}
 */
function summarizeRoomMutuals(rows) {
    const summary = { players: 0, withMutuals: 0, friends: 0, unknown: 0, pending: 0 };
    for (const row of rows || []) {
        summary.players += 1;
        if (row.state === ROOM_MUTUAL_STATE.Mutual) {
            summary.withMutuals += 1;
        } else if (row.state === ROOM_MUTUAL_STATE.Friend) {
            summary.friends += 1;
        } else if (row.state === ROOM_MUTUAL_STATE.Pending) {
            summary.pending += 1;
        } else if (row.state === ROOM_MUTUAL_STATE.Denied || row.state === ROOM_MUTUAL_STATE.Skipped) {
            summary.unknown += 1;
        }
    }
    return summary;
}

/**
 * Pull the shared names out of a `users/{id}/mutuals/friends` response.
 *
 * Kept deliberately forgiving: the endpoint returns plain user objects, and a row with no
 * id is dropped rather than rendered as a blank line.
 *
 * @param {unknown} json
 * @returns {{ userId: string; displayName: string }[]}
 */
function mutualNamesFromJson(json) {
    const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    const names = [];
    const seen = new Set();
    for (const entry of list) {
        const userId = String(entry?.id ?? entry?.userId ?? '');
        if (!userId || seen.has(userId)) {
            continue;
        }
        seen.add(userId);
        names.push({ userId, displayName: String(entry?.displayName ?? '').trim() || userId });
    }
    return names;
}

export { buildRoomMutualRows, isCacheFresh, mutualNamesFromJson, planRoomMutualFetch, summarizeRoomMutuals };
