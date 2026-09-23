import { describe, expect, test } from 'vitest';

import {
    buildFootprintVisits,
    footprintByDay,
    footprintGroupStats,
    footprintHeatmap,
    footprintTimeline,
    summarizeFootprint,
    topFootprintWorlds
} from '../friendFootprints';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Local-time timestamp so the tests do not depend on the machine timezone.
 *
 * @param {number} offsetMs
 * @returns {string}
 */
function at(offsetMs) {
    return new Date(Date.UTC(2026, 7, 20, 10, 0, 0) + offsetMs).toISOString();
}

function row(location, offsetMs, extra = {}) {
    return {
        created_at: at(offsetMs),
        location,
        previous_location: '',
        world_name: extra.worldName || '',
        group_name: extra.groupName || '',
        time: extra.time || 0
    };
}

const WORLD_A = 'wrld_aaaaaaaa-0000-0000-0000-000000000000:12345~region=jp';
const WORLD_A_OTHER = 'wrld_aaaaaaaa-0000-0000-0000-000000000000:67890~region=jp';
const WORLD_B = 'wrld_bbbbbbbb-0000-0000-0000-000000000000:11111~region=use';

describe('buildFootprintVisits', () => {
    test('folds consecutive rows of the same world into one visit', () => {
        const visits = buildFootprintVisits([
            row(WORLD_A, 0, { worldName: 'Alpha' }),
            row(WORLD_A_OTHER, 10 * MINUTE, { worldName: 'Alpha' }),
            row(WORLD_B, 30 * MINUTE, { worldName: 'Beta' })
        ]);

        expect(visits).toHaveLength(2);
        expect(visits[0]).toMatchObject({
            worldId: 'wrld_aaaaaaaa-0000-0000-0000-000000000000',
            name: 'Alpha',
            instanceHops: 2,
            durationMs: 30 * MINUTE,
            durationKnown: true
        });
        expect(visits[0].leftAt).toBe(Date.parse(at(30 * MINUTE)));
    });

    test('marks the final visit as ongoing with no duration', () => {
        const visits = buildFootprintVisits([row(WORLD_A, 0, { worldName: 'Alpha' })]);

        expect(visits[0].leftAt).toBeNull();
        expect(visits[0].durationMs).toBe(0);
        expect(visits[0].durationKnown).toBe(false);
    });

    test('drops dwell time across an offline gap', () => {
        const visits = buildFootprintVisits([
            row(WORLD_A, 0, { worldName: 'Alpha' }),
            row(WORLD_B, 3 * 24 * HOUR, { worldName: 'Beta' })
        ]);

        expect(visits[0].durationMs).toBe(0);
        expect(visits[0].durationKnown).toBe(false);
    });

    test('skips offline and traveling rows', () => {
        const visits = buildFootprintVisits([
            row('offline', 0),
            row('traveling', MINUTE),
            row(WORLD_A, 2 * MINUTE, { worldName: 'Alpha' })
        ]);

        expect(visits).toHaveLength(1);
        expect(visits[0].kind).toBe('world');
    });

    test('classifies private rooms separately from worlds', () => {
        const visits = buildFootprintVisits([
            row('private:private', 0),
            row(WORLD_A, 5 * MINUTE, { worldName: 'Alpha' })
        ]);

        expect(visits[0]).toMatchObject({ kind: 'private', worldId: '' });
        expect(visits[1].kind).toBe('world');
    });

    test('tolerates junk input', () => {
        expect(buildFootprintVisits([])).toEqual([]);
        expect(buildFootprintVisits(null)).toEqual([]);
        expect(buildFootprintVisits([{ created_at: 'not-a-date', location: WORLD_A }])).toEqual([]);
    });
});

describe('summarizeFootprint', () => {
    test('counts visits, distinct worlds and active days', () => {
        const visits = buildFootprintVisits([
            row(WORLD_A, 0, { worldName: 'Alpha' }),
            row(WORLD_B, HOUR, { worldName: 'Beta' }),
            row(WORLD_A, 2 * HOUR, { worldName: 'Alpha' })
        ]);
        const summary = summarizeFootprint(visits, Date.parse(at(3 * HOUR)));

        expect(summary.visits).toBe(3);
        expect(summary.worlds).toBe(2);
        expect(summary.firstAt).toBe(Date.parse(at(0)));
        expect(summary.lastAt).toBe(Date.parse(at(2 * HOUR)));
        expect(summary.daysSinceLastSeen).toBe(0);
        expect(summary.activeDays).toBeGreaterThanOrEqual(1);
    });

    test('handles an empty history', () => {
        const summary = summarizeFootprint([]);

        expect(summary.visits).toBe(0);
        expect(summary.worlds).toBe(0);
        expect(summary.daysSinceLastSeen).toBeNull();
    });
});

describe('topFootprintWorlds', () => {
    test('ranks by visit count and reports the share', () => {
        const visits = buildFootprintVisits([
            row(WORLD_A, 0, { worldName: 'Alpha' }),
            row(WORLD_B, HOUR, { worldName: 'Beta' }),
            row(WORLD_A, 2 * HOUR, { worldName: 'Alpha' }),
            row(WORLD_B, 3 * HOUR, { worldName: 'Beta' }),
            row(WORLD_A, 4 * HOUR, { worldName: 'Alpha' })
        ]);
        const top = topFootprintWorlds(visits);

        expect(top[0]).toMatchObject({ rank: 1, name: 'Alpha', visits: 3 });
        expect(top[1]).toMatchObject({ rank: 2, name: 'Beta', visits: 2 });
        expect(top[0].share).toBeCloseTo(0.6, 5);
    });

    test('leaves private rooms out of the world ranking by default', () => {
        const visits = buildFootprintVisits([
            row('private:private', 0),
            row('private:private', 10 * MINUTE),
            row(WORLD_A, 20 * MINUTE, { worldName: 'Alpha' }),
            row(WORLD_B, 30 * MINUTE, { worldName: 'Beta' }),
            row(WORLD_A, 40 * MINUTE, { worldName: 'Alpha' })
        ]);

        const worldsOnly = topFootprintWorlds(visits);
        expect(worldsOnly.map((world) => world.name)).toEqual(['Alpha', 'Beta']);

        // the two adjacent private rows fold into one visit, so Alpha leads the ranking
        const withPrivate = topFootprintWorlds(visits, 10, { includeNonWorld: true });
        expect(withPrivate).toHaveLength(3);
        expect(withPrivate[0]).toMatchObject({ name: 'Alpha', visits: 2 });
        expect(withPrivate.some((world) => world.kind === 'private' && world.visits === 1)).toBe(true);
    });

    test('respects the limit', () => {
        const visits = buildFootprintVisits([
            row(WORLD_A, 0, { worldName: 'Alpha' }),
            row(WORLD_B, HOUR, { worldName: 'Beta' })
        ]);

        expect(topFootprintWorlds(visits, 1)).toHaveLength(1);
    });
});

describe('footprintHeatmap', () => {
    test('buckets visits by local weekday and hour', () => {
        // built from local date parts so the expectation holds in any timezone
        const localNoon = new Date(2026, 8, 15, 12, 30).toISOString();
        const visits = buildFootprintVisits([
            { created_at: localNoon, location: WORLD_A, world_name: 'Alpha', group_name: '', time: 0 }
        ]);
        const { counts, peak } = footprintHeatmap(visits);

        expect(counts[2][12]).toBe(1);
        expect(peak).toMatchObject({ day: 2, hour: 12, visits: 1 });
    });

    test('returns an all-zero grid for no visits', () => {
        const { counts, peak, max } = footprintHeatmap([]);

        expect(counts).toHaveLength(7);
        expect(counts[0]).toHaveLength(24);
        expect(peak).toBeNull();
        expect(max).toBe(1);
    });
});

describe('footprintGroupStats', () => {
    test('separates group instances from plain ones', () => {
        const visits = buildFootprintVisits([
            row(WORLD_A, 0, { worldName: 'Alpha', groupName: '中文游戏社区' }),
            row(WORLD_B, HOUR, { worldName: 'Beta', groupName: '中文游戏社区' }),
            row(WORLD_A, 2 * HOUR, { worldName: 'Alpha' })
        ]);
        const stats = footprintGroupStats(visits);

        expect(stats[0]).toMatchObject({ groupName: '中文游戏社区', visits: 2, worlds: 2 });
        expect(stats[1]).toMatchObject({ groupName: '', visits: 1 });
    });
});

describe('footprintTimeline and footprintByDay', () => {
    test('timeline is newest first', () => {
        const visits = buildFootprintVisits([
            row(WORLD_A, 0, { worldName: 'Alpha' }),
            row(WORLD_B, HOUR, { worldName: 'Beta' })
        ]);

        expect(footprintTimeline(visits, 1)[0].name).toBe('Beta');
    });

    test('groups visits under day buckets, newest day first', () => {
        const visits = buildFootprintVisits([
            row(WORLD_A, 0, { worldName: 'Alpha' }),
            row(WORLD_B, 26 * HOUR, { worldName: 'Beta' })
        ]);
        const days = footprintByDay(visits);

        expect(days.length).toBeGreaterThanOrEqual(2);
        expect(days[0].timestamp).toBeGreaterThan(days[1].timestamp);
        expect(days[0].visits[0].name).toBe('Beta');
    });
});
