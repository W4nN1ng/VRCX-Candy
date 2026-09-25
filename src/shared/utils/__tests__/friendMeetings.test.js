import { describe, expect, test } from 'vitest';

import {
    buildFriendStays,
    buildMeetings,
    buildOutings,
    chooseBucketUnit,
    friendWorldBoard,
    meetingFrequency,
    meetingGaps,
    meetingHeatmap,
    meetingRanking,
    meetingWorldBoard,
    summarizeMeetings
} from '../friendMeetings';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Local time, so the bucket and heatmap tests do not depend on the machine timezone.
 * `month` is zero based, as Date expects: 8 is September.
 */
function local(year, month, day, hour = 0, minute = 0) {
    return new Date(year, month, day, hour, minute, 0, 0).getTime();
}

function iso(at) {
    return new Date(at).toISOString();
}

const FRIENDS = new Set(['usr_a', 'usr_b']);
const WORLD = 'wrld_1111:100~region(jp)';
const OTHER = 'wrld_2222:200~region(jp)';

function join(at, userId, location = WORLD, name = userId) {
    return { created_at: iso(at), type: 'OnPlayerJoined', user_id: userId, location, display_name: name };
}

function leave(at, userId, location = WORLD, name = userId) {
    return { created_at: iso(at), type: 'OnPlayerLeft', user_id: userId, location, display_name: name };
}

describe('buildFriendStays', () => {
    test('pairs a join with its leave into one stay', () => {
        const stays = buildFriendStays([join(1000, 'usr_a'), leave(60000 + 1000, 'usr_a')], FRIENDS, {
            now: 9 * 60000
        });

        expect(stays).toHaveLength(1);
        expect(stays[0]).toMatchObject({
            userId: 'usr_a',
            location: WORLD,
            startAt: 1000,
            endAt: 61000,
            worldId: 'wrld_1111'
        });
    });

    test('drops everyone who is not on the friend roster', () => {
        const rows = [
            join(1000, 'usr_stranger'),
            leave(60000, 'usr_stranger'),
            join(1000, 'usr_a'),
            leave(60000, 'usr_a')
        ];

        expect(buildFriendStays(rows, FRIENDS, { now: 90000 }).map((stay) => stay.userId)).toEqual(['usr_a']);
    });

    test('treats a join with no leave as still running, capped', () => {
        const started = 1000;
        const stays = buildFriendStays([join(started, 'usr_a')], FRIENDS, { now: started + 3 * HOUR, maxOpenMs: HOUR });

        expect(stays[0]).toMatchObject({ startAt: started, endAt: started + HOUR, open: true });
    });

    test('closes an earlier join when a second one arrives without a leave', () => {
        const rows = [join(1000, 'usr_a'), join(5000, 'usr_a'), leave(9000, 'usr_a')];
        const stays = buildFriendStays(rows, FRIENDS, { now: 10000 });

        expect(stays.map((stay) => [stay.startAt, stay.endAt])).toEqual([
            [1000, 5000],
            [5000, 9000]
        ]);
    });

    test('ignores a leave whose join is not in the log, and rows that are unusable', () => {
        const rows = [
            leave(5000, 'usr_a'),
            { created_at: 'not-a-date', type: 'OnPlayerJoined', user_id: 'usr_a', location: WORLD },
            { created_at: iso(6000), type: 'OnPlayerJoined', user_id: '', location: WORLD },
            { created_at: iso(6000), type: 'OnPlayerJoined', user_id: 'usr_a', location: '' },
            { created_at: iso(6000), type: 'SomeOtherThing', user_id: 'usr_a', location: WORLD }
        ];

        expect(buildFriendStays(rows, FRIENDS, { now: 9000 })).toEqual([]);
    });

    test('keeps stays ordered oldest first', () => {
        const rows = [join(5000, 'usr_b'), leave(7000, 'usr_b'), join(1000, 'usr_a'), leave(2000, 'usr_a')];

        expect(buildFriendStays(rows, FRIENDS, { now: 8000 }).map((stay) => stay.startAt)).toEqual([1000, 5000]);
    });
});

describe('buildMeetings', () => {
    test('clips the overlap to whichever of you arrived later and left earlier', () => {
        const mine = [{ location: WORLD, startAt: 10 * MINUTE, endAt: 50 * MINUTE }];
        const stays = [
            { userId: 'usr_a', displayName: 'A', location: WORLD, worldId: 'wrld_1111', startAt: 0, endAt: 30 * MINUTE }
        ];

        expect(buildMeetings(mine, stays)).toEqual([
            {
                userId: 'usr_a',
                displayName: 'A',
                location: WORLD,
                worldId: 'wrld_1111',
                worldName: '',
                groupName: '',
                startAt: 10 * MINUTE,
                endAt: 30 * MINUTE,
                durationMs: 20 * MINUTE,
                bounces: 1
            }
        ]);
    });

    test('a different instance in the same world is not the same room', () => {
        const mine = [{ location: `${WORLD}`, startAt: 0, endAt: HOUR }];
        const stays = [
            { userId: 'usr_a', location: 'wrld_1111:101~region(jp)', worldId: 'wrld_1111', startAt: 0, endAt: HOUR }
        ];

        expect(buildMeetings(mine, stays)).toEqual([]);
    });

    test('overlaps shorter than a minute are noise', () => {
        const mine = [{ location: WORLD, startAt: 0, endAt: MINUTE }];
        const stays = [{ userId: 'usr_a', location: WORLD, startAt: 30 * 1000, endAt: MINUTE }];

        expect(buildMeetings(mine, stays)).toEqual([]);
        expect(buildMeetings(mine, stays, { minMeetingMs: 10 * 1000 })).toHaveLength(1);
    });

    test('ignores my own stays that are not a real world', () => {
        const stays = [{ userId: 'usr_a', location: 'offline', startAt: 0, endAt: HOUR }];
        const mine = [
            { location: 'offline', startAt: 0, endAt: HOUR },
            { location: 'traveling:traveling', startAt: 0, endAt: HOUR },
            { location: 'local:local', startAt: 0, endAt: HOUR }
        ];

        expect(buildMeetings(mine, [{ ...stays[0], location: 'offline' }])).toEqual([]);
        expect(buildMeetings(mine, stays)).toEqual([]);
    });

    test('counts every friend who was in the room', () => {
        const mine = [{ location: WORLD, startAt: 0, endAt: HOUR, worldName: 'Cafe' }];
        const stays = [
            { userId: 'usr_a', displayName: 'A', location: WORLD, worldId: 'wrld_1111', startAt: 0, endAt: HOUR },
            {
                userId: 'usr_b',
                displayName: 'B',
                location: WORLD,
                worldId: 'wrld_1111',
                startAt: 10 * MINUTE,
                endAt: 20 * MINUTE
            }
        ];
        const meetings = buildMeetings(mine, stays);

        expect(meetings.map((meeting) => meeting.userId)).toEqual(['usr_a', 'usr_b']);
        expect(meetings[0].worldName).toBe('Cafe');
        expect(meetings[1].durationMs).toBe(10 * MINUTE);
    });
});

describe('buildMeetings bounce merge', () => {
    const stay = (startAt, endAt, location = WORLD, userId = 'usr_a') => ({
        userId,
        displayName: userId,
        location,
        worldId: 'wrld_1111',
        startAt,
        endAt
    });

    test('joins two stretches of the same room split by a few seconds of log churn', () => {
        // the game log re-emits a join/leave pair when a connection bounces, which is
        // not somebody leaving and coming back
        const mine = [
            { location: WORLD, startAt: 0, endAt: 10 * MINUTE },
            { location: WORLD, startAt: 10 * MINUTE + 12000, endAt: 20 * MINUTE }
        ];
        const meetings = buildMeetings(mine, [stay(0, 30 * MINUTE)]);

        expect(meetings).toHaveLength(1);
        expect(meetings[0]).toMatchObject({ startAt: 0, endAt: 20 * MINUTE, durationMs: 20 * MINUTE, bounces: 2 });
    });

    test('keeps two visits apart when the gap is longer than the merge window', () => {
        const mine = [
            { location: WORLD, startAt: 0, endAt: 10 * MINUTE },
            { location: WORLD, startAt: 15 * MINUTE, endAt: 25 * MINUTE }
        ];
        const meetings = buildMeetings(mine, [stay(0, 60 * MINUTE)]);

        expect(meetings).toHaveLength(2);
        expect(meetings.every((meeting) => meeting.bounces === 1)).toBe(true);
    });

    test('honours a custom merge window', () => {
        const mine = [
            { location: WORLD, startAt: 0, endAt: 10 * MINUTE },
            { location: WORLD, startAt: 15 * MINUTE, endAt: 25 * MINUTE }
        ];
        const meetings = buildMeetings(mine, [stay(0, 60 * MINUTE)], { mergeGapMs: 10 * MINUTE });

        expect(meetings).toHaveLength(1);
        expect(meetings[0]).toMatchObject({ startAt: 0, endAt: 25 * MINUTE, bounces: 2 });
    });

    test('never joins two different rooms, however close they are', () => {
        const mine = [
            { location: WORLD, startAt: 0, endAt: 10 * MINUTE },
            { location: OTHER, startAt: 10 * MINUTE + 1000, endAt: 20 * MINUTE }
        ];
        const meetings = buildMeetings(mine, [stay(0, 30 * MINUTE), stay(0, 30 * MINUTE, OTHER)]);

        expect(meetings.map((meeting) => meeting.location)).toEqual([WORLD, OTHER]);
    });

    test('never merges two friends into one meeting', () => {
        const mine = [{ location: WORLD, startAt: 0, endAt: HOUR }];
        const meetings = buildMeetings(mine, [stay(0, HOUR, WORLD, 'usr_a'), stay(0, HOUR, WORLD, 'usr_b')]);

        expect(meetings).toHaveLength(2);
        expect(meetings.map((meeting) => meeting.userId).sort()).toEqual(['usr_a', 'usr_b']);
    });
});

describe('buildOutings', () => {
    function meeting(userId, startAt, durationMs, location = WORLD, worldId = 'wrld_1111') {
        return {
            userId,
            displayName: userId,
            location,
            worldId,
            worldName: '',
            startAt,
            endAt: startAt + durationMs,
            durationMs
        };
    }

    test('merges instance hops into one outing', () => {
        const meetings = [
            meeting('usr_a', 0, 10 * MINUTE, WORLD, 'wrld_1111'),
            meeting('usr_a', 12 * MINUTE, 10 * MINUTE, OTHER, 'wrld_2222')
        ];
        const outings = buildOutings(meetings);

        expect(outings).toHaveLength(1);
        expect(outings[0]).toMatchObject({
            meetings: 2,
            startAt: 0,
            endAt: 22 * MINUTE,
            durationMs: 22 * MINUTE,
            meetingMs: 20 * MINUTE
        });
        expect(outings[0].worldIds.size).toBe(2);
    });

    test('splits when the gap is longer than an outing gap, even on the same day', () => {
        const meetings = [meeting('usr_a', 0, 10 * MINUTE), meeting('usr_a', 3 * HOUR, 10 * MINUTE)];

        expect(buildOutings(meetings)).toHaveLength(2);
        expect(buildOutings(meetings, { outingGapMs: 4 * HOUR })).toHaveLength(1);
    });

    test('never merges two different friends into one outing', () => {
        const meetings = [meeting('usr_a', 0, 10 * MINUTE), meeting('usr_b', 1 * MINUTE, 10 * MINUTE)];
        const outings = buildOutings(meetings);

        expect(outings.map((outing) => outing.userId).sort()).toEqual(['usr_a', 'usr_b']);
    });

    test('collects the distinct days an outing covered', () => {
        const meetings = [
            meeting('usr_a', local(2026, 8, 20, 23, 30), 40 * MINUTE),
            meeting('usr_a', local(2026, 8, 21, 0, 20), 30 * MINUTE)
        ];
        const outings = buildOutings(meetings);

        expect(outings).toHaveLength(1);
        expect(outings[0].dayKeys.size).toBe(2);
    });
});

describe('summarizeMeetings', () => {
    test('adds up overall and per friend numbers', () => {
        const meetings = [
            { userId: 'usr_a', displayName: 'A', worldId: 'wrld_1', startAt: local(2026, 8, 20, 10), durationMs: HOUR },
            {
                userId: 'usr_a',
                displayName: 'A',
                worldId: 'wrld_2',
                startAt: local(2026, 8, 21, 10),
                durationMs: 2 * HOUR
            },
            {
                userId: 'usr_b',
                displayName: 'B',
                worldId: 'wrld_1',
                startAt: local(2026, 8, 20, 12),
                durationMs: 30 * MINUTE
            }
        ];
        const outings = buildOutings(meetings);
        const summary = summarizeMeetings(meetings, outings);

        expect(summary).toMatchObject({ meetings: 3, meetingMs: 3 * HOUR + 30 * MINUTE, partners: 2 });
        expect(summary.friends.usr_a).toMatchObject({
            meetings: 2,
            meetingMs: 3 * HOUR,
            dayCount: 2,
            worldCount: 2,
            outings: 2
        });
        expect(summary.friends.usr_b.outings).toBe(1);
    });

    test('handles no meetings at all', () => {
        const summary = summarizeMeetings([], []);

        expect(summary).toMatchObject({ meetings: 0, meetingMs: 0, outings: 0, partners: 0 });
        expect(summary.friends).toEqual({});
    });
});

describe('chooseBucketUnit', () => {
    test('picks a readable bucket for every offered range', () => {
        expect(chooseBucketUnit(7, 7)).toBe('day');
        expect(chooseBucketUnit(30, 30)).toBe('day');
        expect(chooseBucketUnit(90, 90)).toBe('week');
        expect(chooseBucketUnit(365, 365)).toBe('week');
        expect(chooseBucketUnit(730, 730)).toBe('month');
    });

    test('falls back to the real span when the range is everything', () => {
        expect(chooseBucketUnit(0, 12)).toBe('day');
        expect(chooseBucketUnit(0, 200)).toBe('week');
        expect(chooseBucketUnit(0, 900)).toBe('month');
    });
});

describe('meetingFrequency', () => {
    const NOW = local(2026, 8, 25, 12);

    function outing(userId, startAt) {
        return {
            userId,
            startAt,
            endAt: startAt + HOUR,
            meetingMs: HOUR,
            meetings: 1,
            dayKeys: new Set([new Date(startAt).toLocaleDateString('sv')])
        };
    }

    test('keeps empty buckets so the gaps stay visible', () => {
        const outings = [outing('usr_a', local(2026, 8, 21, 10)), outing('usr_a', local(2026, 8, 24, 10))];
        const series = meetingFrequency(outings, { rangeDays: 7, unit: 'day', now: NOW });

        expect(series.unit).toBe('day');
        expect(series.points.length).toBeGreaterThanOrEqual(6);
        expect(series.points.reduce((sum, point) => sum + point.value, 0)).toBe(2);
        expect(series.points.filter((point) => point.value === 0).length).toBeGreaterThan(0);
    });

    test('cuts off outside the requested range', () => {
        const outings = [outing('usr_a', NOW - 3 * DAY), outing('usr_a', NOW - 40 * DAY)];
        const series = meetingFrequency(outings, { rangeDays: 7, unit: 'day', now: NOW });

        expect(series.total).toBe(1);
    });

    test('switches what a point counts without changing the buckets', () => {
        const meetings = [
            {
                userId: 'usr_a',
                displayName: 'A',
                worldId: 'wrld_1',
                startAt: local(2026, 8, 21, 10),
                durationMs: 2 * HOUR
            },
            { userId: 'usr_a', displayName: 'A', worldId: 'wrld_2', startAt: local(2026, 8, 21, 14), durationMs: HOUR }
        ];
        // a two hour gap between the two rooms is longer than an outing gap, so these
        // stay two separate occasions even though they happened on one day
        const outings = buildOutings(meetings);
        expect(outings).toHaveLength(2);

        const byOutings = meetingFrequency(outings, { rangeDays: 7, unit: 'day', now: NOW });
        const byMeetings = meetingFrequency(outings, { rangeDays: 7, unit: 'day', metric: 'meetings', now: NOW });
        const byHours = meetingFrequency(outings, { rangeDays: 7, unit: 'day', metric: 'meetingMs', now: NOW });
        const byDays = meetingFrequency(outings, { rangeDays: 7, unit: 'day', metric: 'days', now: NOW });

        expect(byOutings.total).toBe(2);
        expect(byMeetings.total).toBe(2);
        expect(byHours.total).toBe(3);
        expect(byDays.total).toBe(1);
    });

    test('reports the busiest bucket and nothing for an empty log', () => {
        const empty = meetingFrequency([], { rangeDays: 30, now: NOW });
        expect(empty.points.every((point) => point.value === 0)).toBe(true);
        expect(empty.peak).toBeNull();

        const busy = meetingFrequency(
            [outing('usr_a', local(2026, 8, 21, 1)), outing('usr_b', local(2026, 8, 21, 5))],
            {
                rangeDays: 7,
                unit: 'day',
                now: NOW
            }
        );
        expect(busy.peak.value).toBe(2);
    });
});

describe('meetingWorldBoard and friendWorldBoard', () => {
    const meetings = [
        {
            userId: 'usr_a',
            displayName: 'A',
            worldId: 'wrld_1',
            worldName: 'Cafe',
            startAt: local(2026, 8, 20, 10),
            durationMs: HOUR
        },
        {
            userId: 'usr_b',
            displayName: 'B',
            worldId: 'wrld_1',
            worldName: 'Cafe',
            startAt: local(2026, 8, 21, 10),
            durationMs: 2 * HOUR
        },
        {
            userId: 'usr_a',
            displayName: 'A',
            worldId: 'wrld_2',
            worldName: 'Club',
            startAt: local(2026, 8, 22, 10),
            durationMs: 30 * MINUTE
        }
    ];

    test('groups by world and lists who was there', () => {
        const board = meetingWorldBoard(meetings);

        expect(board[0]).toMatchObject({
            worldId: 'wrld_1',
            worldName: 'Cafe',
            meetings: 2,
            meetingMs: 3 * HOUR,
            dayCount: 2
        });
        expect(board[0].partners.map((partner) => partner.userId).sort()).toEqual(['usr_a', 'usr_b']);
    });

    test('narrows to one friend and honours the limit', () => {
        expect(friendWorldBoard(meetings, 'usr_b')).toHaveLength(1);
        expect(meetingWorldBoard(meetings, { limit: 1 })).toHaveLength(1);
    });
});

describe('meetingHeatmap', () => {
    // 2026-09-20 is a Sunday and 2026-09-22 a Tuesday; the grid starts on Monday.
    test('buckets minutes into local weekday and hour, Monday first', () => {
        const sunday = local(2026, 8, 20, 20);
        const tuesday = local(2026, 8, 22, 9);
        const meetings = [
            { userId: 'usr_a', startAt: sunday, endAt: sunday + 2 * HOUR, durationMs: 2 * HOUR },
            { userId: 'usr_a', startAt: tuesday, endAt: tuesday + 30 * MINUTE, durationMs: 30 * MINUTE }
        ];
        const heat = meetingHeatmap(meetings);

        // the two hour meeting is spread over the two hours it actually covered
        expect(heat.grid[6][20]).toBe(60);
        expect(heat.grid[6][21]).toBe(60);
        expect(heat.grid[1][9]).toBe(30);
        expect(heat.maxMinutes).toBe(60);
        expect(heat.peak).toEqual({ day: 6, hour: 20, value: 60 });
    });

    test('splits a meeting that crosses midnight', () => {
        const start = local(2026, 8, 20, 23, 30);
        const heat = meetingHeatmap([{ userId: 'usr_a', startAt: start, endAt: start + HOUR, durationMs: HOUR }]);

        expect(heat.grid[6][23]).toBe(30);
        expect(heat.grid[0][0]).toBe(30);
    });

    test('returns an all zero grid for nothing', () => {
        expect(meetingHeatmap([]).maxMinutes).toBe(0);
    });
});

describe('meetingGaps', () => {
    const NOW = local(2026, 8, 25, 12);

    test('sorts by how long it has been and separates never-met', () => {
        const meetings = [
            { userId: 'usr_a', displayName: 'A', worldId: 'w1', startAt: NOW - 2 * DAY, durationMs: HOUR },
            { userId: 'usr_b', displayName: 'B', worldId: 'w1', startAt: NOW - 20 * DAY, durationMs: HOUR }
        ];
        const summary = summarizeMeetings(meetings, buildOutings(meetings));
        const gaps = meetingGaps(summary, new Set(['usr_a', 'usr_b', 'usr_c']), { now: NOW });

        expect(gaps.stale.map((row) => row.userId)).toEqual(['usr_b', 'usr_a']);
        expect(gaps.stale[0].daysAgo).toBeGreaterThanOrEqual(19);
        expect(gaps.neverMet).toEqual([{ userId: 'usr_c' }]);
    });
});

describe('meetingRanking', () => {
    const meetings = [
        { userId: 'usr_a', displayName: 'A', worldId: 'w1', startAt: local(2026, 8, 20, 10), durationMs: 3 * HOUR },
        { userId: 'usr_b', displayName: 'B', worldId: 'w1', startAt: local(2026, 8, 20, 11), durationMs: HOUR },
        { userId: 'usr_b', displayName: 'B', worldId: 'w2', startAt: local(2026, 8, 21, 11), durationMs: HOUR }
    ];
    const summary = summarizeMeetings(meetings, buildOutings(meetings));

    test('ranks by time together and the shares add up', () => {
        const rows = meetingRanking(summary);

        expect(rows.map((row) => row.userId)).toEqual(['usr_a', 'usr_b']);
        expect(rows.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1, 10);
    });

    test('ranks by whichever measure is asked for', () => {
        expect(meetingRanking(summary, { metric: 'meetings' }).map((row) => row.userId)).toEqual(['usr_b', 'usr_a']);
        expect(meetingRanking(summary, { metric: 'worlds' }).map((row) => row.userId)).toEqual(['usr_b', 'usr_a']);
        expect(meetingRanking(summary, { metric: 'days' })[0].value).toBe(2);
    });

    test('returns nothing for nothing', () => {
        expect(meetingRanking(summarizeMeetings([], []))).toEqual([]);
    });
});
