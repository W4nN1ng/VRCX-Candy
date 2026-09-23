import { MAX_RELIABLE_GAP_MS, classifyLocation } from './friendFootprints';

/**
 * Finds the times your friends were in an instance together without you.
 *
 * Feed_gps says "at created_at this friend moved to `location`", so a friend's stay
 * in one instance runs from their row to that friend's next row, whenever and
 * wherever that is. Two friends were together exactly when those stays overlap and
 * the `location` strings are byte equal - that string carries the instance number,
 * the access type and the region, so equality is what the rest of VRCX already uses
 * to mean "same instance".
 *
 * Knowing whether *you* were there uses a different table, because feed_gps only
 * ever holds friends. gamelog_location is your own log: `created_at` is when you
 * left and `time` is how long you stayed, so your stay is
 * [created_at - time, created_at] and its location string compares directly with a
 * friend's.
 *
 * One trap worth naming, because getting it wrong makes the whole feature return
 * nothing: the participant count has to be snapshotted *before* a departure is
 * removed from the active set. Count after removing and a pair never looks complete.
 */

const MINUTE_MS = 60 * 1000;

// Stays shorter than this are tag churn - a friend bouncing between two instances -
// rather than two people actually meeting up.
const DEFAULT_MIN_DURATION_MS = MINUTE_MS;
const DEFAULT_MIN_PARTICIPANTS = 2;

/**
 * @param {string} iso
 * @returns {number} Epoch ms, or 0 when unparseable
 */
function toEpoch(iso) {
    const value = Date.parse(iso);
    return Number.isNaN(value) ? 0 : value;
}

/**
 * Group raw feed_gps rows by the friend they belong to.
 *
 * @param {object[]} rows
 * @returns {Map<string, object[]>}
 */
function groupRowsByUser(rows) {
    const byUser = new Map();
    for (const row of rows || []) {
        if (!row || !row.user_id) {
            continue;
        }
        if (!byUser.has(row.user_id)) {
            byUser.set(row.user_id, []);
        }
        byUser.get(row.user_id).push(row);
    }
    return byUser;
}

/**
 * Turn one friend's rows into the stretches they spent in a single instance.
 *
 * Consecutive rows of the same instance are folded together, so being re-observed
 * inside one instance does not end the stay. A stay is only usable when the friend's
 * next row arrives within the gap limit; otherwise VRCX was closed and the stay has
 * no end we can trust.
 *
 * @param {object[]} rows - Rows of one friend, any order
 * @param {{ maxGapMs?: number }} [options]
 * @returns {object[]} Stays, oldest first
 */
function buildPresenceWindows(rows, options = {}) {
    const maxGapMs = Number(options.maxGapMs) || MAX_RELIABLE_GAP_MS;
    const entries = [];
    for (const row of rows || []) {
        const at = toEpoch(row.created_at);
        const location = String(row.location || '');
        if (!at || !location) {
            continue;
        }
        // Only real worlds have an instance worth comparing.
        if (classifyLocation(location).kind !== 'world') {
            continue;
        }
        entries.push({
            at,
            location,
            worldName: String(row.world_name || ''),
            userId: String(row.user_id || ''),
            displayName: String(row.display_name || '')
        });
    }
    entries.sort((a, b) => a.at - b.at);

    const windows = [];
    let index = 0;
    while (index < entries.length) {
        const current = entries[index];
        let next = index + 1;
        while (next < entries.length && entries[next].location === current.location) {
            next++;
        }
        const following = entries[next];
        if (following) {
            const gapMs = following.at - current.at;
            if (gapMs > 0 && gapMs <= maxGapMs) {
                const worldName =
                    entries
                        .slice(index, next)
                        .map((entry) => entry.worldName)
                        .find((name) => name) || '';
                windows.push({
                    location: current.location,
                    worldId: classifyLocation(current.location).worldId,
                    worldName,
                    userId: current.userId,
                    displayName: current.displayName,
                    startAt: current.at,
                    endAt: following.at
                });
            }
        }
        index = next;
    }
    return windows;
}

/**
 * @param {object[]} windows
 * @param {{ minParticipants?: number; minDurationMs?: number }} [options]
 * @returns {object[]} Together events, newest first
 */
function findTogetherEvents(windows, options = {}) {
    const minParticipants = Number(options.minParticipants) || DEFAULT_MIN_PARTICIPANTS;
    const minDurationMs = Number.isFinite(options.minDurationMs)
        ? Number(options.minDurationMs)
        : DEFAULT_MIN_DURATION_MS;

    const byLocation = new Map();
    for (const window of windows || []) {
        if (!window || !window.location) {
            continue;
        }
        if (!byLocation.has(window.location)) {
            byLocation.set(window.location, []);
        }
        byLocation.get(window.location).push(window);
    }

    const events = [];
    for (const [location, stays] of byLocation) {
        const points = [];
        for (const stay of stays) {
            points.push({ at: stay.startAt, joining: true, stay });
            points.push({ at: stay.endAt, joining: false, stay });
        }
        // A departure wins a tie so one friend handing the instance to another at the
        // same millisecond does not read as the two of them meeting.
        points.sort((a, b) => a.at - b.at || Number(a.joining) - Number(b.joining));

        const active = new Set();
        const members = new Map();
        let clusterStart = null;

        for (const point of points) {
            // Count before applying the point. Counting after a departure has been
            // removed leaves one person in the set, and the gathering is never seen -
            // that bug made every event in the real database disappear.
            const beforeCount = countParticipants(active);
            if (point.joining) {
                active.add(point.stay);
            } else {
                active.delete(point.stay);
            }
            const afterCount = countParticipants(active);

            if (beforeCount < minParticipants && afterCount >= minParticipants) {
                clusterStart = point.at;
                members.clear();
                for (const stay of active) {
                    addMember(members, stay);
                }
            } else if (clusterStart !== null) {
                // Whoever this point is about was part of the gathering, including
                // someone who only dropped in for a few minutes. Their own window is
                // recorded, so a short visit is not passed off as the whole stretch.
                addMember(members, point.stay);
            }

            if (beforeCount >= minParticipants && afterCount < minParticipants && clusterStart !== null) {
                if (point.at - clusterStart >= minDurationMs) {
                    events.push(makeTogetherEvent(location, [...members.values()], clusterStart, point.at));
                }
                clusterStart = null;
                members.clear();
            }
        }
    }
    events.sort((a, b) => b.startAt - a.startAt || a.location.localeCompare(b.location));
    return events;
}

/**
 * @param {Iterable<object>} stays - Stays, or the set of currently active ones
 * @returns {number} Number of distinct friends
 */
function countParticipants(stays) {
    return new Set([...stays].map((stay) => stay.userId)).size;
}

/**
 * Fold one stay into the roster of a gathering, widening the window if the same
 * friend is already listed.
 *
 * @param {Map<string, object>} members
 * @param {object} stay
 */
function addMember(members, stay) {
    const existing = members.get(stay.userId);
    if (existing) {
        existing.startAt = Math.min(existing.startAt, stay.startAt);
        existing.endAt = Math.max(existing.endAt, stay.endAt);
        existing.worldId = existing.worldId || stay.worldId;
        existing.worldName = existing.worldName || stay.worldName;
        return;
    }
    members.set(stay.userId, {
        userId: stay.userId,
        displayName: stay.displayName,
        startAt: stay.startAt,
        endAt: stay.endAt,
        worldId: stay.worldId,
        worldName: stay.worldName
    });
}

/**
 * @param {string} location
 * @param {object[]} participants
 * @param {number} startAt
 * @param {number} endAt
 * @returns {object}
 */
function makeTogetherEvent(location, participants, startAt, endAt) {
    const roster = [...participants].sort((a, b) => a.startAt - b.startAt);
    return {
        location,
        worldId: roster.find((member) => member.worldId)?.worldId || '',
        worldName: roster.find((member) => member.worldName)?.worldName || '',
        startAt,
        endAt,
        durationMs: endAt - startAt,
        participants: roster.map((member) => ({
            userId: member.userId,
            displayName: member.displayName,
            startAt: member.startAt,
            endAt: member.endAt
        })),
        self: 'elsewhere'
    };
}

/**
 * Tag each event with where you were while it happened.
 *
 * `there` means you were in that exact instance, `offline` means you were not logged
 * in at all, and `elsewhere` means you were around but somewhere else. Without
 * session data the last two cannot be told apart, so everything that is not `there`
 * stays `elsewhere` rather than being guessed at.
 *
 * @param {object[]} events - Mutated in place and returned
 * @param {object[]} selfSegments - [{ location, startAt, endAt }] where you were
 * @param {object[]} [selfSessions] - [{ startAt, endAt }] when you were online at all
 * @returns {object[]}
 */
function markSelfPresence(events, selfSegments, selfSessions) {
    const byLocation = new Map();
    for (const segment of selfSegments || []) {
        if (!segment || !segment.location) {
            continue;
        }
        if (!byLocation.has(segment.location)) {
            byLocation.set(segment.location, []);
        }
        byLocation.get(segment.location).push(segment);
    }
    const sessions = Array.isArray(selfSessions) ? selfSessions : [];

    for (const event of events || []) {
        if (overlaps(byLocation.get(event.location), event)) {
            event.self = 'there';
        } else if (sessions.length && !overlaps(sessions, event)) {
            event.self = 'offline';
        } else {
            event.self = 'elsewhere';
        }
    }
    return events || [];
}

/**
 * @param {object[]} ranges - Objects with startAt/endAt
 * @param {{ startAt: number; endAt: number }} event
 * @returns {boolean}
 */
function overlaps(ranges, event) {
    return (ranges || []).some((range) => range.startAt < event.endAt && range.endAt > event.startAt);
}

/**
 * Rows to events in one call, for callers that just want the answer.
 *
 * @param {{
 *     friendRows?: object[];
 *     selfSegments?: object[];
 *     selfSessions?: object[];
 *     minParticipants?: number;
 *     minDurationMs?: number;
 *     maxGapMs?: number;
 * }} input
 * @returns {object[]} Together events, newest first
 */
function buildTogetherEvents(input = {}) {
    const byUser = groupRowsByUser(input.friendRows);
    const windows = [];
    for (const rows of byUser.values()) {
        windows.push(...buildPresenceWindows(rows, { maxGapMs: input.maxGapMs }));
    }
    const events = findTogetherEvents(windows, {
        minParticipants: input.minParticipants,
        minDurationMs: input.minDurationMs
    });
    return markSelfPresence(events, input.selfSegments, input.selfSessions);
}

/**
 * Headline numbers for the dashboard.
 *
 * @param {object[]} events
 * @returns {object}
 */
function summarizeTogether(events) {
    const list = events || [];
    const worlds = new Set();
    const instances = new Set();
    const people = new Set();
    const days = new Set();
    let durationMs = 0;
    let withoutMe = 0;
    let whileOffline = 0;

    for (const event of list) {
        worlds.add(event.worldId || event.location);
        instances.add(event.location);
        for (const participant of event.participants || []) {
            people.add(participant.userId);
        }
        days.add(new Date(event.startAt).toLocaleDateString('sv'));
        durationMs += event.durationMs;
        if (event.self !== 'there') {
            withoutMe++;
        }
        if (event.self === 'offline') {
            whileOffline++;
        }
    }

    return {
        events: list.length,
        worlds: worlds.size,
        instances: instances.size,
        people: people.size,
        days: days.size,
        durationMs,
        withoutMe,
        whileOffline,
        firstAt: list.length ? list[list.length - 1].startAt : 0,
        lastAt: list.length ? list[0].startAt : 0
    };
}

/**
 * Events grouped under local calendar days, newest day first.
 *
 * @param {object[]} events
 * @param {number} [limit]
 * @returns {{ dateKey: string; timestamp: number; events: object[] }[]}
 */
function togetherByDay(events, limit = 30) {
    const buckets = new Map();
    for (const event of events || []) {
        const date = new Date(event.startAt);
        const dateKey = date.toLocaleDateString('sv');
        if (!buckets.has(dateKey)) {
            buckets.set(dateKey, {
                dateKey,
                timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
                events: []
            });
        }
        buckets.get(dateKey).events.push(event);
    }
    const days = [...buckets.values()].sort((a, b) => b.timestamp - a.timestamp);
    for (const day of days) {
        day.events.sort((a, b) => b.startAt - a.startAt);
    }
    return Number.isFinite(limit) ? days.slice(0, limit) : days;
}

/**
 * Which friends keep turning up together, most often first.
 *
 * @param {object[]} events
 * @param {number} [limit]
 * @returns {object[]}
 */
function topTogetherPairs(events, limit = 10) {
    const pairs = new Map();
    for (const event of events || []) {
        const people = [...(event.participants || [])].sort((a, b) => a.userId.localeCompare(b.userId));
        for (let i = 0; i < people.length; i++) {
            for (let j = i + 1; j < people.length; j++) {
                const key = `${people[i].userId}|${people[j].userId}`;
                if (!pairs.has(key)) {
                    pairs.set(key, {
                        a: { userId: people[i].userId, displayName: people[i].displayName },
                        b: { userId: people[j].userId, displayName: people[j].displayName },
                        events: 0,
                        durationMs: 0,
                        lastAt: 0
                    });
                }
                const pair = pairs.get(key);
                pair.events++;
                pair.durationMs += event.durationMs;
                pair.lastAt = Math.max(pair.lastAt, event.startAt);
            }
        }
    }
    return [...pairs.values()]
        .sort((x, y) => y.events - x.events || y.durationMs - x.durationMs || y.lastAt - x.lastAt)
        .slice(0, limit);
}

/**
 * The maps friends gather in without you, most visited first.
 *
 * @param {object[]} events
 * @param {number} [limit]
 * @returns {object[]}
 */
function topTogetherWorlds(events, limit = 10) {
    const worlds = new Map();
    for (const event of events || []) {
        const key = event.worldId || event.location;
        if (!worlds.has(key)) {
            worlds.set(key, {
                worldId: event.worldId,
                name: event.worldName,
                events: 0,
                durationMs: 0,
                people: new Set(),
                lastAt: 0
            });
        }
        const world = worlds.get(key);
        world.events++;
        world.durationMs += event.durationMs;
        world.lastAt = Math.max(world.lastAt, event.startAt);
        for (const participant of event.participants || []) {
            world.people.add(participant.userId);
        }
        if (!world.name && event.worldName) {
            world.name = event.worldName;
        }
    }
    return [...worlds.values()]
        .map((world) => ({ ...world, people: world.people.size }))
        .sort((a, b) => b.events - a.events || b.durationMs - a.durationMs || b.lastAt - a.lastAt)
        .slice(0, limit);
}

export {
    DEFAULT_MIN_DURATION_MS,
    DEFAULT_MIN_PARTICIPANTS,
    buildPresenceWindows,
    buildTogetherEvents,
    findTogetherEvents,
    groupRowsByUser,
    markSelfPresence,
    summarizeTogether,
    togetherByDay,
    topTogetherPairs,
    topTogetherWorlds
};
