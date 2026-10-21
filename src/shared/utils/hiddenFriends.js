/**
 * The list of friends the user has hidden.
 *
 * Hidden means "do not show me anything about this person", not "stop recording
 * them". That distinction is the whole design: the SQLite writes, the API polling and
 * the in-memory friend roster all keep working exactly as before, and the filter is
 * applied only where something is about to be *displayed*. Un-hiding a person
 * therefore brings back everything that happened while they were hidden, which makes
 * the feature safe to use - hiding is a pair of sunglasses, not a delete key.
 *
 * The one thing every filter site must not do is return early before the database
 * write. This module exists so the shape of the stored list is decided once.
 */

import { HIDDEN_FRIENDS_MAX } from '../constants/hiddenFriends';

const MAX_ID = 80;
const MAX_NAME = 80;

/** How many hidden entries the stored list will hold before it stops growing. */
export const MAX_HIDDEN_FRIENDS = HIDDEN_FRIENDS_MAX;

/**
 * @param {unknown} entry
 * @returns {{ userId: string; displayName: string; at: number } | null}
 */
function toHiddenFriend(entry) {
    if (!entry || (typeof entry !== 'object' && typeof entry !== 'string')) {
        return null;
    }
    // Plain strings are accepted so a list written by an earlier shape, or by hand,
    // still loads - the name is then resolved from the friend roster at display time.
    const record = typeof entry === 'string' ? { userId: entry } : entry;
    const userId = String(record.userId ?? '')
        .trim()
        .slice(0, MAX_ID);
    if (!userId.startsWith('usr_')) {
        return null;
    }
    return {
        userId,
        displayName: String(record.displayName ?? '')
            .trim()
            .slice(0, MAX_NAME),
        at: Number(record.at) || 0
    };
}

/**
 * @param {unknown} raw - A JSON string or an already parsed array
 * @returns {{ userId: string; displayName: string; at: number }[]} Newest first, no duplicates
 */
function parseHiddenFriends(raw) {
    let value = raw;
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set();
    const list = [];
    for (const entry of value) {
        const friend = toHiddenFriend(entry);
        if (!friend || seen.has(friend.userId)) {
            continue;
        }
        seen.add(friend.userId);
        list.push(friend);
        if (list.length >= HIDDEN_FRIENDS_MAX) {
            break;
        }
    }
    return list;
}

/**
 * @param {Iterable<unknown>} entries
 * @returns {object[]}
 */
function normalizeHiddenFriends(entries) {
    return parseHiddenFriends([...(entries || [])]);
}

/**
 * @param {object[]} friends
 * @returns {Set<string>}
 */
function hiddenIdSet(friends) {
    return new Set((friends || []).map((friend) => friend.userId));
}

/**
 * Filter a list through the hidden set.
 *
 * The id extractor is a parameter because the row shapes differ everywhere - a friend
 * entry keys on `id`, a feed row on `userId`, a notification on `senderUserId` - while
 * the rule is the same.
 *
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} getId
 * @param {Set<string>} hidden
 * @returns {T[]}
 */
function filterHiddenRows(rows, getId, hidden) {
    const list = rows || [];
    if (!hidden || hidden.size === 0) {
        return list;
    }
    return list.filter((row) => !hidden.has(String(getId(row) ?? '')));
}

export { hiddenIdSet, filterHiddenRows, normalizeHiddenFriends, parseHiddenFriends };
