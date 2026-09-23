import { parseLocation } from './locationParser';

/**
 * Turns raw feed_gps rows into visit records and aggregates them for the friend
 * footprint dashboard.
 *
 * A feed_gps row means: "at created_at the player moved to `location`, having come
 * from `previous_location`". The stored `time` column is how long the tracker had
 * been watching the previous location, which is only a lower bound - it resets when
 * the player hops instances inside the same world. The gap between two consecutive
 * rows is the more usable measure of dwell time, so that is what we compute here and
 * the reported value is kept only as a sanity fallback.
 */

const HOUR_MS = 60 * 60 * 1000;

// A gap longer than this means VRCX was closed or the player logged off, so the
// dwell time around it is unknown rather than long.
const MAX_RELIABLE_GAP_MS = 12 * HOUR_MS;

/**
 * @param {string} iso
 * @returns {number} Epoch ms, or 0 when unparseable
 */
function toEpoch(iso) {
    const value = Date.parse(iso);
    return Number.isNaN(value) ? 0 : value;
}

/**
 * Classify a location string into something a chart can group by.
 *
 * @param {string} location
 * @returns {{ key: string; kind: string; worldId: string }}
 */
function classifyLocation(location) {
    const parsed = parseLocation(location);
    if (parsed.isOffline) {
        return { key: 'offline', kind: 'offline', worldId: '' };
    }
    if (parsed.isTraveling) {
        return { key: 'traveling', kind: 'traveling', worldId: '' };
    }
    if (parsed.worldId) {
        return { key: parsed.worldId, kind: 'world', worldId: parsed.worldId };
    }
    if (parsed.isPrivate) {
        return { key: 'private', kind: 'private', worldId: '' };
    }
    const prefix = String(location || '').split(':')[0];
    return { key: prefix || 'unknown', kind: prefix || 'unknown', worldId: '' };
}

/**
 * @param {string} location
 * @returns {boolean} True when the player was somewhere worth recording
 */
function isTrackable(location) {
    const { kind } = classifyLocation(location);
    return kind !== 'offline' && kind !== 'traveling';
}

/**
 * Build merged visit records from raw rows, oldest row first.
 *
 * Consecutive rows for the same world are folded into one visit, so reloading into a
 * different instance of a world you were already in does not read as a new trip.
 *
 * @param {object[]} rows - Feed_gps rows ordered ascending by created_at
 * @returns {object[]} Visits, oldest first
 */
function buildFootprintVisits(rows) {
    const entries = [];
    for (const row of rows || []) {
        const at = toEpoch(row.created_at);
        if (!at || !isTrackable(row.location)) {
            continue;
        }
        const { key, kind, worldId } = classifyLocation(row.location);
        entries.push({
            at,
            key,
            kind,
            worldId,
            location: row.location,
            name: String(row.world_name || ''),
            groupName: String(row.group_name || ''),
            reportedMs: Number(row.time) || 0
        });
    }

    const visits = [];
    let index = 0;
    while (index < entries.length) {
        const current = entries[index];
        let next = index + 1;
        while (next < entries.length && entries[next].key === current.key) {
            next++;
        }
        const following = entries[next];
        const gapMs = following ? following.at - current.at : 0;
        const reliable = Boolean(following) && gapMs > 0 && gapMs <= MAX_RELIABLE_GAP_MS;

        visits.push({
            key: current.key,
            kind: current.kind,
            worldId: current.worldId,
            name: current.name,
            groupName: current.groupName,
            arrivedAt: current.at,
            // no following row means we never saw them leave: still there as far as we know
            leftAt: following ? following.at : null,
            durationMs: reliable ? gapMs : 0,
            durationKnown: reliable,
            instanceHops: next - index,
            lastSeenAt: following ? following.at : current.at
        });
        index = next;
    }
    return visits;
}

/**
 * Headline numbers for the dashboard.
 *
 * @param {object[]} visits
 * @param {number} [now] - Epoch ms to measure recency against
 * @returns {object}
 */
function summarizeFootprint(visits, now = Date.now()) {
    const list = visits || [];
    const byWorld = new Map();
    let durationMs = 0;
    let knownDurationMs = 0;
    let privateVisits = 0;
    let instanceHops = 0;

    for (const visit of list) {
        if (!byWorld.has(visit.key)) {
            byWorld.set(visit.key, { firstAt: visit.arrivedAt, lastAt: visit.lastSeenAt });
        } else {
            const bucket = byWorld.get(visit.key);
            bucket.lastAt = visit.lastSeenAt;
        }
        durationMs += visit.durationMs;
        if (visit.durationKnown) {
            knownDurationMs += visit.durationMs;
        }
        if (visit.kind !== 'world') {
            privateVisits++;
        }
        instanceHops += Math.max(0, visit.instanceHops - 1);
    }

    const firstAt = list.length ? list[0].arrivedAt : 0;
    const lastAt = list.length ? list[list.length - 1].arrivedAt : 0;
    const days = {};
    for (const visit of list) {
        days[new Date(visit.arrivedAt).toLocaleDateString('sv')] = true;
    }

    return {
        visits: list.length,
        worlds: byWorld.size,
        privateVisits,
        instanceHops,
        durationMs,
        knownDurationMs,
        activeDays: Object.keys(days).length,
        firstAt,
        lastAt,
        daysSinceLastSeen: lastAt ? Math.max(0, Math.floor((now - lastAt) / (24 * HOUR_MS))) : null,
        // distinct worlds whose very first record is inside this visit list
        newWorlds: [...byWorld.values()].filter((bucket) => bucket.firstAt === bucket.lastAt).length
    };
}

/**
 * Aggregate visits per world, most visited first.
 *
 * Private and other non-world rooms are left out by default: they carry no world name,
 * so they drown out the "which map does this friend hang out in" answer. They are still
 * counted in the summary.
 *
 * @param {object[]} visits
 * @param {number} [limit]
 * @param {{ includeNonWorld?: boolean }} [options]
 * @returns {object[]}
 */
function topFootprintWorlds(visits, limit = 10, options = {}) {
    const includeNonWorld = options.includeNonWorld === true;
    const byWorld = new Map();
    for (const visit of visits || []) {
        if (!includeNonWorld && visit.kind !== 'world') {
            continue;
        }
        let bucket = byWorld.get(visit.key);
        if (!bucket) {
            bucket = {
                key: visit.key,
                kind: visit.kind,
                worldId: visit.worldId,
                name: visit.name,
                groupName: visit.groupName,
                visits: 0,
                durationMs: 0,
                durationKnown: false,
                firstAt: visit.arrivedAt,
                lastAt: visit.lastSeenAt,
                instanceHops: 0
            };
            byWorld.set(visit.key, bucket);
        }
        bucket.visits++;
        bucket.durationMs += visit.durationMs;
        bucket.durationKnown = bucket.durationKnown || visit.durationKnown;
        bucket.firstAt = Math.min(bucket.firstAt, visit.arrivedAt);
        bucket.lastAt = Math.max(bucket.lastAt, visit.lastSeenAt);
        bucket.instanceHops += Math.max(0, visit.instanceHops - 1);
        if (!bucket.name && visit.name) {
            bucket.name = visit.name;
        }
        if (!bucket.groupName && visit.groupName) {
            bucket.groupName = visit.groupName;
        }
    }

    const worlds = [...byWorld.values()].sort(
        (a, b) => b.visits - a.visits || b.durationMs - a.durationMs || b.lastAt - a.lastAt
    );
    const total = worlds.reduce((sum, world) => sum + world.visits, 0) || 1;
    worlds.forEach((world, i) => {
        world.rank = i + 1;
        world.share = world.visits / total;
    });
    return Number.isFinite(limit) ? worlds.slice(0, limit) : worlds;
}

/**
 * Weekday x hour grid of when this player is around, in the local timezone.
 *
 * @param {object[]} visits
 * @returns {{
 *     grid: number[][];
 *     counts: number[][];
 *     peak: { day: number; hour: number; visits: number } | null;
 *     max: number;
 * }}
 */
function footprintHeatmap(visits) {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    const counts = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;

    for (const visit of visits || []) {
        const date = new Date(visit.arrivedAt);
        const day = date.getDay();
        const hour = date.getHours();
        counts[day][hour]++;
        grid[day][hour] += visit.durationMs;
        if (counts[day][hour] > max) {
            max = counts[day][hour];
        }
    }

    let peak = null;
    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            if (!peak || counts[day][hour] > peak.visits) {
                peak = { day, hour, visits: counts[day][hour] };
            }
        }
    }
    return { grid, counts, peak: peak && peak.visits ? peak : null, max: max || 1 };
}

/**
 * Group visits by the VRChat group the instance belonged to.
 *
 * @param {object[]} visits
 * @returns {object[]}
 */
function footprintGroupStats(visits) {
    const byGroup = new Map();
    for (const visit of visits || []) {
        const name = visit.groupName || '';
        let bucket = byGroup.get(name);
        if (!bucket) {
            bucket = { groupName: name, visits: 0, durationMs: 0, worlds: new Set() };
            byGroup.set(name, bucket);
        }
        bucket.visits++;
        bucket.durationMs += visit.durationMs;
        bucket.worlds.add(visit.key);
    }
    return [...byGroup.values()]
        .map((bucket) => ({
            groupName: bucket.groupName,
            visits: bucket.visits,
            durationMs: bucket.durationMs,
            worlds: bucket.worlds.size
        }))
        .sort((a, b) => b.visits - a.visits);
}

/**
 * Most recent visits first, for the timeline.
 *
 * @param {object[]} visits
 * @param {number} [limit]
 * @returns {object[]}
 */
function footprintTimeline(visits, limit = 60) {
    return [...(visits || [])].reverse().slice(0, limit);
}

/**
 * Bucket visits by calendar day so the timeline can be grouped under date headers.
 *
 * @param {object[]} visits - Any order
 * @param {string} [locale] - Passed to toLocaleDateString for the label
 * @returns {{ dateKey: string; visits: object[] }[]}
 */
function footprintByDay(visits, locale = undefined) {
    const buckets = new Map();
    for (const visit of visits || []) {
        const date = new Date(visit.arrivedAt);
        const dateKey = date.toLocaleDateString(locale || 'sv');
        if (!buckets.has(dateKey)) {
            buckets.set(dateKey, { dateKey, timestamp: date.getTime(), visits: [] });
        }
        buckets.get(dateKey).visits.push(visit);
    }
    return [...buckets.values()].sort((a, b) => b.timestamp - a.timestamp);
}

export {
    MAX_RELIABLE_GAP_MS,
    buildFootprintVisits,
    classifyLocation,
    footprintByDay,
    footprintGroupStats,
    footprintHeatmap,
    footprintTimeline,
    summarizeFootprint,
    topFootprintWorlds
};
