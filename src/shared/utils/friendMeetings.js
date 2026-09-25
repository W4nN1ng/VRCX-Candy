/**
 * Turns "which instance was I standing in, and who else was there" into a record of
 * who you actually play with.
 *
 * Two tables make this possible and neither is enough on its own:
 *
 * - `gamelog_location` is your own log. One row per visit, written when you enter, with `time` filled in with the
 *   duration when you leave, so a stay runs from `created_at` to `created_at + time`. It only ever holds _you_.
 * - `gamelog_join_leave` holds an `OnPlayerJoined` / `OnPlayerLeft` pair per player per instance, for the instances your
 *   own game log was watching - which means the instances you were in. That is what makes it possible to say a friend
 *   was in the same room rather than merely in the same world.
 *
 * A **meeting** is one stretch where your stay in an instance overlaps a friend's
 * stay in that same instance. The `location` string carries the instance id, the
 * access type and the region, so byte equality on it is exactly "same room" - the
 * same comparison the rest of VRCX already relies on.
 *
 * A meeting is not the same as an outing. Hopping through six worlds with someone is
 * six meetings but one evening together, so meetings that are close behind each other
 * for the same pair are merged into **outings**, and outings are what the frequency
 * chart counts. Reporting only meetings would make the number track how much you
 * travelled rather than how much you saw each other.
 *
 * Everything here is pure and takes its own clock, so the whole thing is testable
 * without a database.
 */

import { classifyLocation } from './friendFootprints';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Under a minute together is a loading screen you happened to share, not a meeting.
const DEFAULT_MIN_MEETING_MS = MINUTE_MS;

// Two meetings this close apart for the same pair are one outing: instance hops,
// re-joins, and a friend popping in to say something before moving on.
const DEFAULT_OUTING_GAP_MS = 60 * MINUTE_MS;

// A join with no matching leave is either the player still being there or VRCX
// closing; twelve hours is the ceiling the other friend views already use.
const DEFAULT_MAX_OPEN_MS = 12 * HOUR_MS;

// The range buttons the page offers. 0 means "everything in the log".
const MEETING_RANGES = [7, 30, 90, 365, 730, 0];

/**
 * @param {string} iso
 * @returns {number} Epoch ms, or 0 when unparseable
 */
function toEpoch(iso) {
    const value = Date.parse(iso);
    return Number.isNaN(value) ? 0 : value;
}

/**
 * @param {string} location
 * @returns {string} The world id, or an empty string when it is not a world
 */
function worldIdOf(location) {
    return classifyLocation(location).worldId || '';
}

/**
 * Fold the raw join/leave rows into one stay per friend per instance.
 *
 * Only friends are kept: the same rows contain every stranger in every public
 * instance you have visited, and counting them would drown the answer in noise.
 * A join with no matching leave is treated as still running, capped at
 * `maxOpenMs`, so the room you are both standing in right now counts.
 *
 * @param {object[]} presenceRows - Gamelog_join_leave rows: created_at, type, location, user_id, display_name
 * @param {Iterable<string>} friendIds - Roster to keep. Everyone else is a stranger.
 * @param {{ now?: number; maxOpenMs?: number }} [options]
 * @returns {object[]} Stays, oldest first
 */
function buildFriendStays(presenceRows, friendIds, options = {}) {
    const now = Number(options.now) || Date.now();
    const maxOpenMs = Number(options.maxOpenMs) || DEFAULT_MAX_OPEN_MS;
    const wanted = friendIds instanceof Set ? friendIds : new Set(friendIds || []);

    const open = new Map();
    const stays = [];
    for (const row of presenceRows || []) {
        const at = toEpoch(row.created_at);
        const userId = String(row.user_id || '');
        const location = String(row.location || '');
        const type = String(row.type || '');
        if (!at || !userId || !location || !wanted.has(userId)) {
            continue;
        }
        if (type !== 'OnPlayerJoined' && type !== 'OnPlayerLeft') {
            continue;
        }
        const key = `${location}|${userId}`;
        if (type === 'OnPlayerJoined') {
            // A second join without a leave means the first stay never closed; keep
            // the shorter, honest one and start again from here.
            const previous = open.get(key);
            if (previous) {
                previous.endAt = at;
                if (previous.endAt > previous.startAt) {
                    stays.push(previous);
                }
            }
            open.set(key, {
                userId,
                displayName: String(row.display_name || ''),
                location,
                worldId: worldIdOf(location),
                startAt: at,
                endAt: 0
            });
            continue;
        }
        const stay = open.get(key);
        if (!stay) {
            // A leave for a join we never saw: the log started mid-visit. Count it as
            // having been there, ending now, with no start we can claim.
            continue;
        }
        stay.endAt = at;
        open.delete(key);
        if (stay.endAt > stay.startAt) {
            stays.push(stay);
        }
    }
    for (const stay of open.values()) {
        stay.endAt = Math.min(now, stay.startAt + maxOpenMs);
        stay.open = true;
        if (stay.endAt > stay.startAt) {
            stays.push(stay);
        }
    }
    stays.sort((a, b) => a.startAt - b.startAt);
    return stays;
}

/**
 * Intersect your stays with your friends' stays, room by room.
 *
 * @param {object[]} selfSegments - From getSelfLocationSegments: location, startAt, endAt
 * @param {object[]} friendStays - From buildFriendStays
 * @param {{ minMeetingMs?: number }} [options]
 * @returns {object[]} Meetings, oldest first
 */
function buildMeetings(selfSegments, friendStays, options = {}) {
    const minMeetingMs = Number.isFinite(Number(options.minMeetingMs))
        ? Number(options.minMeetingMs)
        : DEFAULT_MIN_MEETING_MS;
    const byLocation = new Map();
    for (const stay of friendStays || []) {
        if (!stay || !(stay.endAt > stay.startAt)) {
            continue;
        }
        if (!byLocation.has(stay.location)) {
            byLocation.set(stay.location, []);
        }
        byLocation.get(stay.location).push(stay);
    }

    const meetings = [];
    for (const mine of selfSegments || []) {
        if (!mine || !(mine.endAt > mine.startAt) || !mine.location) {
            continue;
        }
        // Only real rooms can be shared; "traveling" and friends-only strings are
        // either nothing or someone else's private world.
        if (classifyLocation(mine.location).kind !== 'world') {
            continue;
        }
        for (const theirs of byLocation.get(mine.location) || []) {
            const startAt = Math.max(mine.startAt, theirs.startAt);
            const endAt = Math.min(mine.endAt, theirs.endAt);
            if (endAt - startAt < minMeetingMs) {
                continue;
            }
            meetings.push({
                userId: theirs.userId,
                displayName: theirs.displayName,
                location: mine.location,
                worldId: worldIdOf(mine.location),
                worldName: String(mine.worldName || ''),
                groupName: String(mine.groupName || ''),
                startAt,
                endAt,
                durationMs: endAt - startAt
            });
        }
    }
    meetings.sort((a, b) => a.startAt - b.startAt);
    return meetings;
}

/**
 * Merge each pair's meetings into outings.
 *
 * Walking through several worlds in one evening is one time you saw each other, so
 * consecutive meetings for the same friend are joined while the gap stays under
 * `outingGapMs`. A gap longer than that is a different occasion even on the same day.
 *
 * @param {object[]} meetings - From buildMeetings
 * @param {{ outingGapMs?: number }} [options]
 * @returns {object[]} Outings, oldest first
 */
function buildOutings(meetings, options = {}) {
    const outingGapMs = Number(options.outingGapMs) || DEFAULT_OUTING_GAP_MS;
    const byFriend = new Map();
    for (const meeting of meetings || []) {
        if (!byFriend.has(meeting.userId)) {
            byFriend.set(meeting.userId, []);
        }
        byFriend.get(meeting.userId).push(meeting);
    }

    const outings = [];
    for (const [userId, list] of byFriend) {
        let current = null;
        for (const meeting of list.sort((a, b) => a.startAt - b.startAt)) {
            if (current && meeting.startAt - current.endAt <= outingGapMs) {
                current.endAt = Math.max(current.endAt, meeting.endAt);
                // durationMs is the whole span and meetingMs only the time you were
                // actually in the same room, so the two are recomputed differently.
                current.durationMs = current.endAt - current.startAt;
                current.meetingMs += meeting.durationMs;
                current.meetings++;
                current.worldIds.add(meeting.worldId);
                current.dayKeys.add(dayKeyOf(meeting.startAt));
                if (!current.worldName && meeting.worldName) {
                    current.worldName = meeting.worldName;
                }
                continue;
            }
            current = {
                userId,
                displayName: meeting.displayName,
                startAt: meeting.startAt,
                endAt: meeting.endAt,
                // durationMs is the span of the evening, meetingMs only the time you
                // were actually in the same room; the gap between them is the bit
                // where one of you was somewhere else.
                durationMs: meeting.endAt - meeting.startAt,
                meetingMs: meeting.durationMs,
                meetings: 1,
                worldIds: new Set([meeting.worldId]),
                dayKeys: new Set([dayKeyOf(meeting.startAt)]),
                worldName: meeting.worldName || '',
                locations: [meeting.location]
            };
            outings.push(current);
        }
    }
    outings.sort((a, b) => a.startAt - b.startAt);
    return outings;
}

/**
 * @param {number} at - Epoch ms
 * @returns {string} Local calendar day as YYYY-MM-DD
 */
function dayKeyOf(at) {
    return new Date(at).toLocaleDateString('sv');
}

/**
 * Headline numbers, overall and per friend.
 *
 * `partners` counts only friends you actually met, which is the honest denominator
 * for "who do I play with": everyone on the roster who never shows up here has not
 * been in a room with you while the log was running.
 *
 * @param {object[]} meetings
 * @param {object[]} outings
 * @returns {object}
 */
function summarizeMeetings(meetings, outings) {
    const list = meetings || [];
    const friends = {};
    for (const meeting of list) {
        const bucket = friends[meeting.userId] || {
            userId: meeting.userId,
            name: meeting.displayName,
            meetings: 0,
            meetingMs: 0,
            outings: 0,
            outingMs: 0,
            days: new Set(),
            worldIds: new Set(),
            firstAt: meeting.startAt,
            lastAt: meeting.startAt
        };
        bucket.meetings++;
        bucket.meetingMs += meeting.durationMs;
        bucket.days.add(dayKeyOf(meeting.startAt));
        bucket.worldIds.add(meeting.worldId);
        bucket.firstAt = Math.min(bucket.firstAt, meeting.startAt);
        bucket.lastAt = Math.max(bucket.lastAt, meeting.startAt);
        friends[meeting.userId] = bucket;
    }
    for (const outing of outings || []) {
        const bucket = friends[outing.userId];
        if (bucket) {
            bucket.outings++;
            bucket.outingMs += outing.durationMs;
        }
    }

    for (const bucket of Object.values(friends)) {
        bucket.dayCount = bucket.days.size;
        bucket.worldCount = bucket.worldIds.size;
        bucket.days = undefined;
        bucket.worldIds = undefined;
    }

    return {
        meetings: list.length,
        meetingMs: list.reduce((total, meeting) => total + meeting.durationMs, 0),
        outings: (outings || []).length,
        outingMs: (outings || []).reduce((total, outing) => total + outing.durationMs, 0),
        partners: Object.keys(friends).length,
        friends
    };
}

/**
 * Pick a bucket size that keeps the line readable at every range.
 *
 * Thirty daily points is a chart; seven hundred is a comb. The page says which unit a
 * point is, so nobody reads a monthly bump as a busy week.
 *
 * @param {number} rangeDays - 0 for everything
 * @param {number} spanDays - Days of data actually available
 * @returns {string} 'day' | 'week' | 'month'
 */
function chooseBucketUnit(rangeDays, spanDays) {
    const effective = rangeDays > 0 ? rangeDays : spanDays;
    if (effective <= 31) {
        return 'day';
    }
    if (effective <= 400) {
        return 'week';
    }
    return 'month';
}

/**
 * @param {number} at - Epoch ms
 * @param {string} unit - 'day' | 'week' | 'month'
 * @returns {number} Epoch ms of the local start of the bucket
 */
function bucketStartOf(at, unit) {
    const date = new Date(at);
    if (unit === 'month') {
        return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    }
    if (unit === 'week') {
        const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return day.getTime() - ((day.getDay() + 6) % 7) * DAY_MS;
    }
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * @param {number} at
 * @param {string} unit
 * @returns {number} Epoch ms of the local end of the bucket
 */
function bucketEndOf(at, unit) {
    const date = new Date(at);
    if (unit === 'month') {
        return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
    }
    if (unit === 'week') {
        return bucketStartOf(at, unit) + 7 * DAY_MS;
    }
    return bucketStartOf(at, unit) + DAY_MS;
}

/**
 * The frequency line: one value per bucket, with empty buckets kept.
 *
 * Gaps are the information, so a week with nothing in it is drawn as zero rather than
 * dropped. Buckets run to `now` so the line always ends where the record ends.
 *
 * @param {object[]} outings - From buildOutings
 * @param {{ rangeDays?: number; unit?: string; metric?: string; now?: number }} [options]
 * @returns {{ unit: string; metric: string; points: object[]; max: number; total: number; peak: object | null }}
 */
function meetingFrequency(outings, options = {}) {
    const now = Number(options.now) || Date.now();
    const rangeDays = Number(options.rangeDays) || 0;
    const metric = options.metric || 'outings';
    const list = outings || [];
    const cutoff = rangeDays > 0 ? now - rangeDays * DAY_MS : 0;
    const inRange = list.filter((outing) => outing.startAt >= cutoff);

    const firstAt = inRange.length ? Math.min(cutoff || inRange[0].startAt, inRange[0].startAt) : now;
    const spanDays = Math.max(1, Math.ceil((now - (cutoff || firstAt)) / DAY_MS));
    const unit = options.unit || chooseBucketUnit(rangeDays, spanDays);

    const buckets = new Map();
    const step = (at) => {
        const next = bucketEndOf(at, unit);
        return next > at ? next : at + DAY_MS;
    };
    let cursor = bucketStartOf(Math.max(firstAt, cutoff || firstAt), unit);
    let guard = 0;
    while (cursor <= now && guard++ < 2000) {
        buckets.set(cursor, {
            startAt: cursor,
            endAt: step(cursor),
            outings: 0,
            meetings: 0,
            meetingMs: 0,
            days: new Set()
        });
        cursor = step(cursor);
    }
    for (const outing of inRange) {
        const bucket = buckets.get(bucketStartOf(outing.startAt, unit));
        if (!bucket) {
            continue;
        }
        bucket.outings++;
        bucket.meetings += outing.meetings;
        bucket.meetingMs += outing.meetingMs;
        for (const dayKey of outing.dayKeys) {
            bucket.days.add(dayKey);
        }
    }

    const valueOf = (bucket) => {
        if (metric === 'meetingMs') {
            return Math.round(bucket.meetingMs / HOUR_MS);
        }
        if (metric === 'meetings') {
            return bucket.meetings;
        }
        if (metric === 'days') {
            return bucket.days.size;
        }
        return bucket.outings;
    };

    const points = [...buckets.values()].map((bucket) => ({
        startAt: bucket.startAt,
        endAt: bucket.endAt,
        label: bucketLabel(bucket.startAt, unit),
        value: valueOf(bucket)
    }));
    let peak = null;
    for (const point of points) {
        if (!peak || point.value > peak.value) {
            peak = point;
        }
    }
    return {
        unit,
        metric,
        points,
        max: points.reduce((max, point) => Math.max(max, point.value), 0),
        total: points.reduce((sum, point) => sum + point.value, 0),
        peak: peak && peak.value > 0 ? peak : null
    };
}

/**
 * @param {number} at - Epoch ms
 * @param {string} unit
 * @returns {string} Short axis label
 */
function bucketLabel(at, unit) {
    const date = new Date(at);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    if (unit === 'month') {
        return `${date.getFullYear()}-${month}`;
    }
    if (unit === 'week') {
        return `${month}-${day}`;
    }
    return `${month}-${day}`;
}

/**
 * Worlds you have been in together, most visited first.
 *
 * `location` is one full instance string from that world, which is what the world
 * dialog opens on - a bare world id loses the instance the two of you were in.
 *
 * @param {object[]} meetings
 * @param {{ limit?: number }} [options]
 * @returns {object[]}
 */
function meetingWorldBoard(meetings, options = {}) {
    const limit = Number.isFinite(options.limit) ? options.limit : 12;
    const worlds = new Map();
    for (const meeting of meetings || []) {
        const key = meeting.worldId || meeting.location;
        const bucket = worlds.get(key) || {
            worldId: meeting.worldId,
            worldName: '',
            location: meeting.location,
            meetings: 0,
            meetingMs: 0,
            lastAt: 0,
            days: new Set(),
            partners: new Map()
        };
        bucket.meetings++;
        bucket.meetingMs += meeting.durationMs;
        bucket.lastAt = Math.max(bucket.lastAt, meeting.startAt);
        bucket.days.add(dayKeyOf(meeting.startAt));
        bucket.partners.set(meeting.userId, meeting.displayName || bucket.partners.get(meeting.userId));
        if (!bucket.worldName && meeting.worldName) {
            bucket.worldName = meeting.worldName;
        }
        worlds.set(key, bucket);
    }
    return [...worlds.values()]
        .map((bucket) => ({
            worldId: bucket.worldId,
            worldName: bucket.worldName,
            location: bucket.location,
            meetings: bucket.meetings,
            meetingMs: bucket.meetingMs,
            lastAt: bucket.lastAt,
            dayCount: bucket.days.size,
            partners: [...bucket.partners.entries()].map(([userId, name]) => ({ userId, name }))
        }))
        .sort((a, b) => b.meetingMs - a.meetingMs || b.meetings - a.meetings)
        .slice(0, limit);
}

/**
 * The worlds shared with one friend, newest visit first.
 *
 * @param {object[]} meetings - All meetings, any friend
 * @param {string} userId
 * @param {{ limit?: number }} [options]
 * @returns {object[]}
 */
function friendWorldBoard(meetings, userId, options = {}) {
    const limit = Number.isFinite(options.limit) ? options.limit : 20;
    const mine = (meetings || []).filter((meeting) => meeting.userId === userId);
    return meetingWorldBoard(mine, { limit });
}

/**
 * When you tend to play together: local weekday by hour, in minutes.
 *
 * @param {object[]} meetings
 * @returns {{ grid: number[][]; maxMinutes: number; peak: object | null }}
 */
function meetingHeatmap(meetings) {
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const meeting of meetings || []) {
        let cursor = meeting.startAt;
        while (cursor < meeting.endAt) {
            const date = new Date(cursor);
            const hour = date.getHours();
            let next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1).getTime();
            if (!(next > cursor)) {
                next = cursor + HOUR_MS;
            }
            const end = Math.min(next, meeting.endAt);
            grid[(date.getDay() + 6) % 7][hour] += Math.max(0, end - cursor) / MINUTE_MS;
            cursor = end;
        }
    }
    let maxMinutes = 0;
    let peak = null;
    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            const value = Math.round(grid[day][hour]);
            grid[day][hour] = value;
            if (value > maxMinutes) {
                maxMinutes = value;
                peak = { day, hour, value };
            }
        }
    }
    return { grid, maxMinutes, peak };
}

/**
 * Friends you used to play with, sorted by how long it has been.
 *
 * Only friends with at least one meeting can be stale; someone you have never been in
 * a room with while the log was running belongs in `neverMetPartners` instead, which
 * is a different message - one of those two is usually a logging gap rather than a
 * friendship fading.
 *
 * @param {object} summary - From summarizeMeetings
 * @param {Iterable<string>} friendIds
 * @param {{ now?: number }} [options]
 * @returns {{ stale: object[]; neverMet: object[] }}
 */
function meetingGaps(summary, friendIds, options = {}) {
    const now = Number(options.now) || Date.now();
    const friends = (summary && summary.friends) || {};
    const stale = Object.values(friends)
        .map((friend) => ({
            userId: friend.userId,
            name: friend.name,
            lastAt: friend.lastAt,
            daysAgo: Math.floor((now - friend.lastAt) / DAY_MS),
            meetings: friend.meetings,
            outings: friend.outings
        }))
        .sort((a, b) => b.daysAgo - a.daysAgo);

    const neverMet = [];
    for (const userId of friendIds || []) {
        if (!friends[userId]) {
            neverMet.push({ userId });
        }
    }
    return { stale, neverMet };
}

/**
 * Rank the friends you play with, by whichever measure is selected.
 *
 * `share` is against the total for the same measure, so the bars always add up to what
 * the page is claiming.
 *
 * @param {object} summary - From summarizeMeetings
 * @param {{ metric?: string; limit?: number }} [options]
 * @returns {object[]}
 */
function meetingRanking(summary, options = {}) {
    const metric = options.metric || 'meetingMs';
    const limit = Number.isFinite(options.limit) ? options.limit : 15;
    const valueOf = (friend) => {
        if (metric === 'meetings') {
            return friend.meetings;
        }
        if (metric === 'outings') {
            return friend.outings;
        }
        if (metric === 'days') {
            return friend.dayCount;
        }
        if (metric === 'worlds') {
            return friend.worldCount;
        }
        return friend.meetingMs;
    };
    const rows = Object.values((summary && summary.friends) || {}).map((friend) => ({
        ...friend,
        value: valueOf(friend)
    }));
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return rows
        .map((row) => ({ ...row, share: total ? row.value / total : 0 }))
        .sort((a, b) => b.value - a.value || b.meetingMs - a.meetingMs)
        .slice(0, limit);
}

export {
    DEFAULT_MIN_MEETING_MS,
    DEFAULT_OUTING_GAP_MS,
    MEETING_RANGES,
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
};
