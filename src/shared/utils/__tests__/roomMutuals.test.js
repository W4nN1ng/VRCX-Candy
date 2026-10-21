import { describe, expect, test } from 'vitest';

import {
    ROOM_MUTUAL_CACHE_TTL_MS,
    ROOM_MUTUAL_DENIED_TTL_MS,
    ROOM_MUTUAL_MAX_PLAYERS
} from '../../constants/roomMutuals';
import {
    ROOM_MUTUAL_STATE,
    buildRoomMutualRows,
    isCacheFresh,
    mutualNamesFromJson,
    planRoomMutualFetch,
    summarizeRoomMutuals
} from '../roomMutuals';

const ME = 'usr_me';
const NOW = Date.parse('2026-10-05T12:00:00.000Z');

function player(id, overrides = {}) {
    return { userId: `usr_${id}`, displayName: id, joinTime: NOW - 1000, ...overrides };
}

function build(overrides = {}) {
    return buildRoomMutualRows({ selfId: ME, now: NOW, ...overrides });
}

describe('buildRoomMutualRows', () => {
    test('leaves yourself out and drops junk ids', () => {
        const rows = build({
            players: [
                player('me', { userId: ME }),
                player('a'),
                { userId: '', displayName: 'nobody' },
                null,
                { displayName: 'no id' }
            ]
        });
        expect(rows.map((row) => row.userId)).toEqual(['usr_a']);
    });

    test('keeps one row per player and the earlier arrival time', () => {
        const rows = build({
            players: [player('a', { joinTime: NOW - 500 }), player('a', { joinTime: NOW - 900 })]
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].joinTime).toBe(NOW - 900);
    });

    test('falls back to the id when a name is missing', () => {
        const [row] = build({ players: [{ userId: 'usr_a', displayName: '   ' }] });
        expect(row.displayName).toBe('usr_a');
    });

    test('marks your own friends without looking them up', () => {
        const rows = build({ players: [player('a')], friendIds: new Set(['usr_a']) });
        expect(rows[0].state).toBe(ROOM_MUTUAL_STATE.Friend);
        expect(planRoomMutualFetch(rows)).toEqual([]);
    });

    test('omits hidden friends entirely, consistent with everywhere else', () => {
        const rows = build({ players: [player('a'), player('b')], hiddenIds: new Set(['usr_a']) });
        expect(rows.map((row) => row.userId)).toEqual(['usr_b']);
    });

    test('reads a fresh cache entry into mutual or none', () => {
        const cache = new Map([
            ['usr_a', { friends: 3, groups: 1, at: NOW - 1000 }],
            ['usr_b', { friends: 0, groups: 0, at: NOW - 1000 }]
        ]);
        const rows = build({ players: [player('b'), player('a')], cache });
        expect(rows.map((row) => [row.userId, row.state, row.mutualCount])).toEqual([
            ['usr_a', ROOM_MUTUAL_STATE.Mutual, 3],
            ['usr_b', ROOM_MUTUAL_STATE.None, 0]
        ]);
    });

    test('accepts a plain object as the cache', () => {
        const rows = build({ players: [player('a')], cache: { usr_a: { friends: 2, at: NOW - 1000 } } });
        expect(rows[0].state).toBe(ROOM_MUTUAL_STATE.Mutual);
    });

    test('a refusal is its own state, never a zero', () => {
        const rows = build({ players: [player('a')], cache: new Map([['usr_a', { denied: true, at: NOW - 1000 }]]) });
        expect(rows[0].state).toBe(ROOM_MUTUAL_STATE.Denied);
        expect(rows[0].mutualCount).toBeNull();
    });

    test('an expired answer is asked again', () => {
        const rows = build({
            players: [player('a'), player('b')],
            cache: new Map([
                ['usr_a', { friends: 4, at: NOW - ROOM_MUTUAL_CACHE_TTL_MS - 1 }],
                ['usr_b', { denied: true, at: NOW - ROOM_MUTUAL_DENIED_TTL_MS - 1 }]
            ])
        });
        expect(rows.map((row) => row.state)).toEqual([ROOM_MUTUAL_STATE.Pending, ROOM_MUTUAL_STATE.Pending]);
    });

    test('a refusal is held longer than a success', () => {
        const at = NOW - ROOM_MUTUAL_CACHE_TTL_MS - 1;
        expect(isCacheFresh({ friends: 1, at }, NOW)).toBe(false);
        expect(isCacheFresh({ denied: true, at }, NOW)).toBe(true);
    });

    test('spends the ceiling on whoever arrived first and marks the rest skipped', () => {
        const players = Array.from({ length: 5 }, (_, index) => player(`p${index}`, { joinTime: NOW + index * 1000 }));
        const rows = build({ players, limit: 2 });
        const pending = rows.filter((row) => row.state === ROOM_MUTUAL_STATE.Pending).map((row) => row.userId);
        expect(pending).toEqual(['usr_p0', 'usr_p1']);
        expect(rows.filter((row) => row.state === ROOM_MUTUAL_STATE.Skipped)).toHaveLength(3);
    });

    test('friends do not eat the ceiling', () => {
        const players = [player('f1'), player('a', { joinTime: NOW + 1000 }), player('b', { joinTime: NOW + 2000 })];
        const rows = build({ players, friendIds: new Set(['usr_f1']), limit: 2 });
        expect(rows.filter((row) => row.state === ROOM_MUTUAL_STATE.Pending)).toHaveLength(2);
        expect(rows.find((row) => row.userId === 'usr_f1').state).toBe(ROOM_MUTUAL_STATE.Friend);
    });

    test('defaults to the documented ceiling', () => {
        const players = Array.from({ length: ROOM_MUTUAL_MAX_PLAYERS + 3 }, (_, index) => player(`p${index}`));
        const rows = build({ players });
        expect(rows.filter((row) => row.state === ROOM_MUTUAL_STATE.Pending)).toHaveLength(ROOM_MUTUAL_MAX_PLAYERS);
        expect(rows.filter((row) => row.state === ROOM_MUTUAL_STATE.Skipped)).toHaveLength(3);
    });

    test('sorts by shared friends first, then by what can actually be said', () => {
        const rows = build({
            players: [player('none'), player('two'), player('five'), player('me2'), player('bad')],
            friendIds: new Set(['usr_me2']),
            cache: new Map([
                ['usr_two', { friends: 2, at: NOW - 1 }],
                ['usr_five', { friends: 5, at: NOW - 1 }],
                ['usr_none', { friends: 0, at: NOW - 1 }],
                ['usr_bad', { denied: true, at: NOW - 1 }]
            ])
        });
        expect(rows.map((row) => row.userId)).toEqual(['usr_five', 'usr_two', 'usr_none', 'usr_me2', 'usr_bad']);
        // The point of the ordering, stated directly as well.
        expect(rows[0].mutualCount).toBe(5);
        expect(rows[1].mutualCount).toBe(2);
        expect(rows[2].state).toBe(ROOM_MUTUAL_STATE.None);
        expect(rows[3].state).toBe(ROOM_MUTUAL_STATE.Friend);
        expect(rows.at(-1).state).toBe(ROOM_MUTUAL_STATE.Denied);
    });

    test('ties inside the same count read alphabetically', () => {
        const rows = build({
            players: [player('zoe', { joinTime: NOW }), player('amy', { joinTime: NOW })],
            cache: new Map([
                ['usr_zoe', { friends: 1, at: NOW - 1 }],
                ['usr_amy', { friends: 1, at: NOW - 1 }]
            ])
        });
        expect(rows.map((row) => row.displayName)).toEqual(['amy', 'zoe']);
    });

    test('survives being called with nothing', () => {
        expect(build({})).toEqual([]);
        expect(build({ players: null })).toEqual([]);
    });
});

describe('planRoomMutualFetch', () => {
    test('asks only about the players still unknown', () => {
        const rows = build({
            players: [player('a'), player('b'), player('c')],
            friendIds: new Set(['usr_b']),
            cache: new Map([['usr_c', { friends: 1, at: NOW - 1 }]])
        });
        expect(planRoomMutualFetch(rows)).toEqual(['usr_a']);
    });

    test('is null safe', () => {
        expect(planRoomMutualFetch(null)).toEqual([]);
    });
});

describe('summarizeRoomMutuals', () => {
    test('counts each thing once', () => {
        const rows = build({
            players: [player('a'), player('b'), player('c'), player('d'), player('e')],
            friendIds: new Set(['usr_b']),
            cache: new Map([
                ['usr_a', { friends: 2, at: NOW - 1 }],
                ['usr_c', { friends: 0, at: NOW - 1 }],
                ['usr_d', { denied: true, at: NOW - 1 }]
            ]),
            limit: 4
        });
        // a mutual, b friend (exempt from the ceiling), c none, d refused, e still
        // queued - so "unknown" counts the refusal only, and nothing is skipped here.
        expect(summarizeRoomMutuals(rows)).toEqual({ players: 5, withMutuals: 1, friends: 1, unknown: 1, pending: 1 });
    });

    test('is zero rather than undefined for an empty room', () => {
        expect(summarizeRoomMutuals([])).toEqual({ players: 0, withMutuals: 0, friends: 0, unknown: 0, pending: 0 });
    });
});

describe('mutualNamesFromJson', () => {
    test('reads a plain array of users', () => {
        expect(
            mutualNamesFromJson([
                { id: 'usr_a', displayName: 'Ann' },
                { id: 'usr_b', displayName: 'Bob' }
            ])
        ).toEqual([
            { userId: 'usr_a', displayName: 'Ann' },
            { userId: 'usr_b', displayName: 'Bob' }
        ]);
    });

    test('reads a wrapped list', () => {
        expect(mutualNamesFromJson({ data: [{ id: 'usr_a', displayName: 'Ann' }] })).toHaveLength(1);
    });

    test('dedupes and keeps a nameless row readable', () => {
        expect(
            mutualNamesFromJson([
                { id: 'usr_a' },
                { id: 'usr_a', displayName: 'Ann' },
                { id: 'usr_b', displayName: ' ' }
            ])
        ).toEqual([
            { userId: 'usr_a', displayName: 'usr_a' },
            { userId: 'usr_b', displayName: 'usr_b' }
        ]);
    });

    test('drops rows with no id and junk payloads', () => {
        expect(mutualNamesFromJson(null)).toEqual([]);
        expect(mutualNamesFromJson('nope')).toEqual([]);
        expect(mutualNamesFromJson([{}, null, { userId: 'usr_c', displayName: 'Cee' }])).toEqual([
            { userId: 'usr_c', displayName: 'Cee' }
        ]);
    });
});
