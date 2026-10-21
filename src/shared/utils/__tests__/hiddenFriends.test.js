import { describe, expect, test } from 'vitest';

import {
    MAX_HIDDEN_FRIENDS,
    filterHiddenRows,
    hiddenIdSet,
    normalizeHiddenFriends,
    parseHiddenFriends
} from '../hiddenFriends';

describe('parseHiddenFriends', () => {
    test('reads the stored JSON blob', () => {
        const raw = JSON.stringify([{ userId: 'usr_a', displayName: 'Alice', at: 12 }]);
        expect(parseHiddenFriends(raw)).toEqual([{ userId: 'usr_a', displayName: 'Alice', at: 12 }]);
    });

    test('accepts an already parsed array', () => {
        expect(parseHiddenFriends([{ userId: 'usr_a' }])).toEqual([{ userId: 'usr_a', displayName: '', at: 0 }]);
    });

    test('accepts bare ids, so a hand written or older list still loads', () => {
        expect(parseHiddenFriends(['usr_a', 'usr_b'])).toEqual([
            { userId: 'usr_a', displayName: '', at: 0 },
            { userId: 'usr_b', displayName: '', at: 0 }
        ]);
    });

    test.each([null, undefined, '', 'not json', '{}', '[]', 42, true])('returns nothing for %s', (raw) => {
        expect(parseHiddenFriends(raw)).toEqual([]);
    });

    test('drops entries that are not a user id', () => {
        const list = parseHiddenFriends([
            { userId: 'usr_keep' },
            { userId: 'world_1' },
            { userId: '' },
            { userId: '   ' },
            null,
            42,
            ['usr_nested'],
            'usr_plain_string'
        ]);
        expect(list.map((entry) => entry.userId)).toEqual(['usr_keep', 'usr_plain_string']);
    });

    test('keeps the first of a repeated id', () => {
        const list = parseHiddenFriends([
            { userId: 'usr_a', displayName: 'First' },
            { userId: 'usr_a', displayName: 'Second' }
        ]);
        expect(list).toHaveLength(1);
        expect(list[0].displayName).toBe('First');
    });

    test('trims and clamps the fields', () => {
        const [entry] = parseHiddenFriends([
            {
                userId: `  usr_${'a'.repeat(200)}  `,
                displayName: `${'n'.repeat(200)}  `,
                at: '1234'
            }
        ]);
        expect(entry.userId).toBe(`usr_${'a'.repeat(200)}`.slice(0, 80));
        expect(entry.displayName).toBe('n'.repeat(80));
        expect(entry.at).toBe(1234);
    });

    test('treats a non-numeric timestamp as no timestamp', () => {
        expect(parseHiddenFriends([{ userId: 'usr_a', at: 'later' }])[0].at).toBe(0);
    });

    test('stops at the documented ceiling', () => {
        const entries = Array.from({ length: MAX_HIDDEN_FRIENDS + 50 }, (_, i) => ({ userId: `usr_${i}` }));
        expect(parseHiddenFriends(entries)).toHaveLength(MAX_HIDDEN_FRIENDS);
    });
});

describe('normalizeHiddenFriends', () => {
    test('goes through the same rules as the string form', () => {
        expect(normalizeHiddenFriends([{ userId: 'usr_a' }, 'usr_b', { userId: 'nope' }])).toEqual([
            { userId: 'usr_a', displayName: '', at: 0 },
            { userId: 'usr_b', displayName: '', at: 0 }
        ]);
    });

    test('is null safe', () => {
        expect(normalizeHiddenFriends(null)).toEqual([]);
    });
});

describe('hiddenIdSet', () => {
    test('projects the ids', () => {
        const set = hiddenIdSet([{ userId: 'usr_a' }, { userId: 'usr_b' }]);
        expect([...set]).toEqual(['usr_a', 'usr_b']);
    });

    test('is empty rather than undefined for a missing list', () => {
        expect(hiddenIdSet(null).size).toBe(0);
    });
});

describe('filterHiddenRows', () => {
    const hidden = new Set(['usr_a']);

    test.each([
        ['friend entry', [{ id: 'usr_a' }, { id: 'usr_b' }], (row) => row.id, ['usr_b']],
        ['feed row', [{ userId: 'usr_a' }, { userId: 'usr_b' }], (row) => row.userId, ['usr_b']],
        ['notification', [{ senderUserId: 'usr_a' }, { senderUserId: 'usr_b' }], (row) => row.senderUserId, ['usr_b']]
    ])('drops the hidden row out of a %s list', (_label, rows, getId, expected) => {
        expect(filterHiddenRows(rows, getId, hidden).map(getId)).toEqual(expected);
    });

    test('hands back the same array when nothing is hidden', () => {
        // The sidebar and the feed rebuild on every friend update, so this has to be a
        // pass-through rather than a fresh array: a new reference every time would make
        // every downstream computed re-run and re-render for no reason.
        const rows = [{ id: 'usr_a' }];
        expect(filterHiddenRows(rows, (row) => row.id, new Set())).toBe(rows);
        expect(filterHiddenRows(rows, (row) => row.id, null)).toBe(rows);
    });

    test('is null safe', () => {
        expect(filterHiddenRows(null, (row) => row.id, hidden)).toEqual([]);
    });

    test('keeps a row it cannot identify', () => {
        // Only a match is dropped. An absent id is not treated as a hidden one, or a
        // malformed row would silently disappear from the feed.
        expect(filterHiddenRows([{}, { id: 'usr_b' }], (row) => row.id, hidden)).toHaveLength(2);
    });

    test('compares as text, so a non-string id still matches', () => {
        expect(filterHiddenRows([{ id: 'usr_a' }], (row) => row.id, new Set(['usr_a']))).toEqual([]);
    });
});
