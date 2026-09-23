import { describe, expect, test } from 'vitest';

import {
    buildPresenceWindows,
    buildTogetherEvents,
    findTogetherEvents,
    groupRowsByUser,
    markSelfPresence,
    summarizeTogether,
    togetherByDay,
    topTogetherGroups,
    topTogetherWorlds
} from '../friendTogether';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const BASE = Date.UTC(2026, 8, 15, 10, 0, 0);

const WORLD_A = 'wrld_aaaaaaaa-0000-0000-0000-000000000000:12345~region=jp';
const WORLD_A_OTHER_INSTANCE = 'wrld_aaaaaaaa-0000-0000-0000-000000000000:67890~region=jp';
const WORLD_B = 'wrld_bbbbbbbb-0000-0000-0000-000000000000:11111~region=jp';

/**
 * @param {number} offsetMs
 * @returns {string}
 */
function iso(offsetMs) {
    return new Date(BASE + offsetMs).toISOString();
}

/**
 * @param {string} userId
 * @param {string} name
 * @param {string} location
 * @param {number} offsetMs
 * @param {string} [worldName]
 * @returns {object} A feed_gps shaped row
 */
function gps(userId, name, location, offsetMs, worldName = '') {
    return {
        created_at: iso(offsetMs),
        user_id: userId,
        display_name: name,
        location,
        world_name: worldName
    };
}

describe('groupRowsByUser', () => {
    test('buckets rows by friend and skips rows without an id', () => {
        const grouped = groupRowsByUser([
            gps('usr_1', 'A', WORLD_A, 0),
            gps('usr_2', 'B', WORLD_A, 0),
            gps('usr_1', 'A', WORLD_B, MINUTE),
            { created_at: iso(0), location: WORLD_A }
        ]);

        expect([...grouped.keys()]).toEqual(['usr_1', 'usr_2']);
        expect(grouped.get('usr_1')).toHaveLength(2);
        expect(groupRowsByUser(null).size).toBe(0);
    });
});

describe('buildPresenceWindows', () => {
    test('runs a stay from the row to that friend next row', () => {
        const windows = buildPresenceWindows([
            gps('usr_1', 'A', WORLD_A, 0, 'Alpha'),
            gps('usr_1', 'A', WORLD_B, HOUR, 'Beta')
        ]);

        expect(windows).toEqual([
            {
                location: WORLD_A,
                worldId: 'wrld_aaaaaaaa-0000-0000-0000-000000000000',
                worldName: 'Alpha',
                userId: 'usr_1',
                displayName: 'A',
                startAt: BASE,
                endAt: BASE + HOUR
            }
        ]);
    });

    test('folds rows that re-observe the same instance into one stay', () => {
        const windows = buildPresenceWindows([
            gps('usr_1', 'A', WORLD_A, 0, 'Alpha'),
            gps('usr_1', 'A', WORLD_A, 20 * MINUTE),
            gps('usr_1', 'A', WORLD_A, 40 * MINUTE),
            gps('usr_1', 'A', WORLD_B, HOUR)
        ]);

        expect(windows).toHaveLength(1);
        expect(windows[0].startAt).toBe(BASE);
        expect(windows[0].endAt).toBe(BASE + HOUR);
    });

    test('ignores rows that are not a real world instance', () => {
        const windows = buildPresenceWindows([
            gps('usr_1', 'A', 'offline', 0),
            gps('usr_1', 'A', 'traveling', MINUTE),
            gps('usr_1', 'A', 'private', 2 * MINUTE),
            gps('usr_1', 'A', WORLD_A, 3 * MINUTE, 'Alpha'),
            gps('usr_1', 'A', WORLD_B, HOUR)
        ]);

        expect(windows).toHaveLength(1);
        expect(windows[0].location).toBe(WORLD_A);
    });

    test('drops a stay that no later row closes', () => {
        const windows = buildPresenceWindows([gps('usr_1', 'A', WORLD_A, 0, 'Alpha')]);

        expect(windows).toEqual([]);
    });

    test('drops a stay longer than the gap limit, since VRCX may have been closed', () => {
        const windows = buildPresenceWindows([
            gps('usr_1', 'A', WORLD_A, 0, 'Alpha'),
            gps('usr_1', 'A', WORLD_B, 20 * HOUR)
        ]);

        expect(windows).toEqual([]);
    });

    test('honours a custom gap limit', () => {
        const windows = buildPresenceWindows(
            [gps('usr_1', 'A', WORLD_A, 0, 'Alpha'), gps('usr_1', 'A', WORLD_B, 2 * HOUR)],
            { maxGapMs: HOUR }
        );

        expect(windows).toEqual([]);
    });

    test('tolerates junk', () => {
        expect(buildPresenceWindows([])).toEqual([]);
        expect(buildPresenceWindows(null)).toEqual([]);
        expect(buildPresenceWindows([{ created_at: 'nope', location: WORLD_A }])).toEqual([]);
    });
});

describe('findTogetherEvents', () => {
    /**
     * @param {string} userId
     * @param {string} name
     * @param {number} arriveAt
     * @param {number} leaveAt
     * @param {string} [location]
     * @returns {object[]} Two rows that make one stay
     */
    function stay(userId, name, arriveAt, leaveAt, location = WORLD_A) {
        return [gps(userId, name, location, arriveAt, 'Alpha'), gps(userId, name, `${WORLD_B}~end`, leaveAt)];
    }

    /**
     * @param {object[][]} stays
     * @returns {object[]}
     */
    function windowsOf(stays) {
        const windows = [];
        for (const rows of stays) {
            windows.push(...buildPresenceWindows(rows));
        }
        return windows;
    }

    test('reports one event when two friends overlap in an instance', () => {
        const windows = windowsOf([stay('usr_1', 'A', 0, HOUR), stay('usr_2', 'B', 20 * MINUTE, 50 * MINUTE)]);
        const events = findTogetherEvents(windows);

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            location: WORLD_A,
            worldName: 'Alpha',
            startAt: BASE + 20 * MINUTE,
            endAt: BASE + 50 * MINUTE,
            durationMs: 30 * MINUTE
        });
    });

    test('lists everyone who was there, not just whoever stayed to the end', () => {
        // The count is snapshotted before the departure is applied. Counting after it
        // is removed leaves one person in the list and the event is lost, which is how
        // every single event disappeared the first time this was written.
        const windows = windowsOf([stay('usr_1', 'A', 0, HOUR), stay('usr_2', 'B', 20 * MINUTE, 50 * MINUTE)]);
        const events = findTogetherEvents(windows);

        expect(events[0].participants.map((p) => p.displayName)).toEqual(['A', 'B']);
        expect(new Set(events[0].participants.map((p) => p.userId)).size).toBe(2);
    });

    test('keeps a group together when someone leaves early', () => {
        const windows = windowsOf([
            stay('usr_1', 'A', 0, 100 * MINUTE),
            stay('usr_2', 'B', 10 * MINUTE, 90 * MINUTE),
            stay('usr_3', 'C', 20 * MINUTE, 30 * MINUTE)
        ]);
        const events = findTogetherEvents(windows);

        expect(events).toHaveLength(1);
        expect(events[0].participants.map((p) => p.displayName)).toEqual(['A', 'B', 'C']);
        expect(events[0].startAt).toBe(BASE + 10 * MINUTE);
        expect(events[0].endAt).toBe(BASE + 90 * MINUTE);
    });

    test('says nothing when two friends used the same world at different times', () => {
        const windows = windowsOf([stay('usr_1', 'A', 0, HOUR), stay('usr_2', 'B', 2 * HOUR, 3 * HOUR)]);
        const events = findTogetherEvents(windows);

        expect(events).toEqual([]);
    });

    test('treats a different instance of the same world as a different room', () => {
        const windows = windowsOf([
            stay('usr_1', 'A', 0, HOUR, WORLD_A),
            stay('usr_2', 'B', 10 * MINUTE, 50 * MINUTE, WORLD_A_OTHER_INSTANCE)
        ]);

        expect(findTogetherEvents(windows)).toEqual([]);
    });

    test('does not read a hand over at the same instant as company', () => {
        const windows = windowsOf([stay('usr_1', 'A', 0, HOUR), stay('usr_2', 'B', HOUR, 2 * HOUR)]);
        const events = findTogetherEvents(windows);

        expect(events).toEqual([]);
    });

    test('drops overlaps shorter than the minimum duration', () => {
        const windows = windowsOf([stay('usr_1', 'A', 0, HOUR), stay('usr_2', 'B', 30 * MINUTE, 30 * MINUTE + 30000)]);

        expect(findTogetherEvents(windows)).toEqual([]);
        expect(findTogetherEvents(windows, { minDurationMs: 10000 })).toHaveLength(1);
    });

    test('can be asked for bigger groups only', () => {
        const windows = windowsOf([stay('usr_1', 'A', 0, HOUR), stay('usr_2', 'B', 10 * MINUTE, 50 * MINUTE)]);

        expect(findTogetherEvents(windows)).toHaveLength(1);
        expect(findTogetherEvents(windows, { minParticipants: 3 })).toEqual([]);
    });

    test('returns the newest event first', () => {
        const windows = windowsOf([
            stay('usr_1', 'A', 0, HOUR),
            stay('usr_2', 'B', 10 * MINUTE, 50 * MINUTE),
            stay('usr_1', 'A', 3 * HOUR, 4 * HOUR),
            stay('usr_2', 'B', 3 * HOUR + 10 * MINUTE, 3 * HOUR + 50 * MINUTE)
        ]);
        const events = findTogetherEvents(windows);

        expect(events).toHaveLength(2);
        expect(events[0].startAt).toBeGreaterThan(events[1].startAt);
    });

    test('tolerates junk', () => {
        expect(findTogetherEvents([])).toEqual([]);
        expect(findTogetherEvents(null)).toEqual([]);
        expect(findTogetherEvents([{ location: '' }])).toEqual([]);
    });
});

describe('markSelfPresence', () => {
    /**
     * @returns {object[]}
     */
    function oneEvent() {
        return findTogetherEvents(
            (() => {
                const windows = [];
                for (const rows of [
                    [gps('usr_1', 'A', WORLD_A, 0, 'Alpha'), gps('usr_1', 'A', WORLD_B, HOUR)],
                    [gps('usr_2', 'B', WORLD_A, 10 * MINUTE, 'Alpha'), gps('usr_2', 'B', WORLD_B, 50 * MINUTE)]
                ]) {
                    windows.push(...buildPresenceWindows(rows));
                }
                return windows;
            })()
        );
    }

    test('marks an event I was sitting in', () => {
        const events = markSelfPresence(oneEvent(), [{ location: WORLD_A, startAt: BASE, endAt: BASE + HOUR }]);

        expect(events[0].self).toBe('there');
    });

    test('does not count me being in another instance of that world', () => {
        const events = markSelfPresence(oneEvent(), [
            { location: WORLD_A_OTHER_INSTANCE, startAt: BASE, endAt: BASE + HOUR }
        ]);

        expect(events[0].self).toBe('elsewhere');
    });

    test('separates being online elsewhere from not being online at all', () => {
        const elsewhere = markSelfPresence(oneEvent(), [], [{ startAt: BASE, endAt: BASE + HOUR }]);
        expect(elsewhere[0].self).toBe('elsewhere');

        const offline = markSelfPresence(oneEvent(), [], [{ startAt: BASE + 5 * HOUR, endAt: BASE + 6 * HOUR }]);
        expect(offline[0].self).toBe('offline');
    });

    test('falls back to elsewhere when there is no session data to judge by', () => {
        expect(markSelfPresence(oneEvent(), [])[0].self).toBe('elsewhere');
        expect(markSelfPresence(oneEvent(), [], null)[0].self).toBe('elsewhere');
        expect(markSelfPresence(oneEvent(), [], [])[0].self).toBe('elsewhere');
    });

    test('tolerates junk', () => {
        expect(markSelfPresence(null, [])).toEqual([]);
    });
});

describe('buildTogetherEvents', () => {
    test('goes from raw rows to tagged events', () => {
        const events = buildTogetherEvents({
            friendRows: [
                gps('usr_1', 'A', WORLD_A, 0, 'Alpha'),
                gps('usr_1', 'A', WORLD_B, HOUR),
                gps('usr_2', 'B', WORLD_A, 10 * MINUTE, 'Alpha'),
                gps('usr_2', 'B', WORLD_B, 50 * MINUTE)
            ],
            selfSegments: [],
            selfSessions: [{ startAt: BASE, endAt: BASE + HOUR }]
        });

        expect(events).toHaveLength(1);
        expect(events[0].worldName).toBe('Alpha');
        expect(events[0].self).toBe('elsewhere');
        expect(events[0].participants).toHaveLength(2);
    });

    test('returns nothing for no rows', () => {
        expect(buildTogetherEvents({})).toEqual([]);
        expect(buildTogetherEvents()).toEqual([]);
    });
});

describe('summarizeTogether', () => {
    test('counts events, worlds, people and how many happened without me', () => {
        const events = buildTogetherEvents({
            friendRows: [
                gps('usr_1', 'A', WORLD_A, 0, 'Alpha'),
                gps('usr_1', 'A', WORLD_B, HOUR),
                gps('usr_2', 'B', WORLD_A, 10 * MINUTE, 'Alpha'),
                gps('usr_2', 'B', WORLD_B, 50 * MINUTE),
                gps('usr_3', 'C', WORLD_A_OTHER_INSTANCE, 3 * HOUR, 'Alpha'),
                gps('usr_3', 'C', WORLD_B, 4 * HOUR),
                gps('usr_4', 'D', WORLD_A_OTHER_INSTANCE, 3 * HOUR + 10 * MINUTE, 'Alpha'),
                gps('usr_4', 'D', WORLD_B, 3 * HOUR + 50 * MINUTE)
            ],
            selfSegments: [{ location: WORLD_A_OTHER_INSTANCE, startAt: BASE + 3 * HOUR, endAt: BASE + 4 * HOUR }]
        });
        const summary = summarizeTogether(events);

        expect(summary.events).toBe(2);
        expect(summary.worlds).toBe(1);
        expect(summary.instances).toBe(2);
        expect(summary.people).toBe(4);
        expect(summary.withoutMe).toBe(1);
        expect(summary.durationMs).toBeGreaterThan(0);
    });

    test('reports zeroes for nothing', () => {
        const summary = summarizeTogether([]);

        expect(summary).toMatchObject({ events: 0, worlds: 0, people: 0, durationMs: 0, firstAt: 0, lastAt: 0 });
        expect(summarizeTogether(null).events).toBe(0);
    });
});

describe('togetherByDay, topTogetherGroups and topTogetherWorlds', () => {
    /**
     * @returns {object[]}
     */
    function events() {
        return buildTogetherEvents({
            friendRows: [
                gps('usr_1', 'A', WORLD_A, 0, 'Alpha'),
                gps('usr_1', 'A', WORLD_B, HOUR),
                gps('usr_2', 'B', WORLD_A, 10 * MINUTE, 'Alpha'),
                gps('usr_2', 'B', WORLD_B, 50 * MINUTE),
                gps('usr_1', 'A', WORLD_A, 26 * HOUR, 'Alpha'),
                gps('usr_2', 'B', WORLD_A, 26 * HOUR + 5 * MINUTE, 'Alpha'),
                gps('usr_2', 'B', WORLD_B, 27 * HOUR),
                gps('usr_1', 'A', WORLD_B, 27 * HOUR + 5 * MINUTE)
            ]
        });
    }

    test('groups events under days, newest day first', () => {
        const days = togetherByDay(events());

        expect(days.length).toBeGreaterThanOrEqual(2);
        expect(days[0].timestamp).toBeGreaterThan(days[1].timestamp);
        expect(togetherByDay(events(), 1)).toHaveLength(1);
        expect(togetherByDay(null)).toEqual([]);
    });

    test('ranks the groups that keep meeting', () => {
        const groups = topTogetherGroups(events());

        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ events: 2 });
        expect(groups[0].members.map((member) => member.displayName)).toEqual(['A', 'B']);
        expect(topTogetherGroups(null)).toEqual([]);
    });

    test('keeps a gathering of three as one row instead of three pairs', () => {
        // Splitting the trio into A+B, A+C and B+C would show one afternoon as three
        // separate friendships, and contradicts the "three or more" filter.
        const trio = buildTogetherEvents({
            friendRows: [
                gps('usr_1', 'A', WORLD_A, 0, 'Alpha'),
                gps('usr_1', 'A', WORLD_B, HOUR),
                gps('usr_2', 'B', WORLD_A, 10 * MINUTE, 'Alpha'),
                gps('usr_2', 'B', WORLD_B, 50 * MINUTE),
                gps('usr_3', 'C', WORLD_A, 15 * MINUTE, 'Alpha'),
                gps('usr_3', 'C', WORLD_B, 40 * MINUTE)
            ]
        });
        const groups = topTogetherGroups(trio);

        expect(groups).toHaveLength(1);
        expect(groups[0].members.map((member) => member.displayName)).toEqual(['A', 'B', 'C']);
    });

    test('ranks the maps they gather in', () => {
        const worlds = topTogetherWorlds(events());

        expect(worlds[0]).toMatchObject({
            worldId: 'wrld_aaaaaaaa-0000-0000-0000-000000000000',
            name: 'Alpha',
            events: 2,
            people: 2
        });
        expect(topTogetherWorlds(events(), 1)).toHaveLength(1);
        expect(topTogetherWorlds(null)).toEqual([]);
    });
});
