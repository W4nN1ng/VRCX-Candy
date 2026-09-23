/**
 * Turns raw feed_status and feed_online_offline rows into a timeline of status
 * light intervals and aggregates them for the friend status light dashboard.
 *
 * A feed_status row means: "at created_at the player's status became `status`,
 * having been `previous_status`". Two things about that table are easy to get
 * wrong and both are load bearing here:
 *
 * 1. A row where status === previous_status is NOT noise. VRChat lets a player attach custom text to a light, and the only
 *    trace of an edit is a row whose light is unchanged while the description moved. Those rows are kept as description
 *    changes and must not cut the current light's interval in half.
 * 2. `previous_status` describes the stretch immediately before the row, which reaches back to the start of the current
 *    online session. So the first change of a session is what tells us which light was on before it. Filling that in is
 *    the one inference this module makes, and it is flagged as such.
 *
 * No further inference is done. Measuring the real database showed that when two
 * observations are under an hour apart the light differs 92% of the time, so
 * carrying a light across an unobserved stretch would be wrong exactly where it
 * matters most; those stretches stay `unknown` instead.
 *
 * Online state comes from feed_online_offline, which repeats itself (adjacent
 * same-type rows) and lags behind status changes, so a status change is treated
 * as proof that the player was online regardless of what presence says.
 */

const HOUR_MS = 60 * 60 * 1000;

// A stretch longer than this means VRCX was closed or the player was gone, so the
// time inside it cannot be attributed to any light.
const DEFAULT_MAX_GAP_MS = 12 * HOUR_MS;

const STATUS_LIGHTS = ['active', 'join me', 'ask me', 'busy'];

// Maps a VRChat status onto the class names used by styles/status-icon.css
// (`i.x-user-status.online` and friends) and onto the --status-* colour variables.
const STATUS_LIGHT_META = [
    { light: 'active', tone: 'online', colour: 'var(--status-online)' },
    { light: 'join me', tone: 'joinme', colour: 'var(--status-joinme)' },
    { light: 'ask me', tone: 'askme', colour: 'var(--status-askme)' },
    { light: 'busy', tone: 'busy', colour: 'var(--status-busy)' }
];

const OFFLINE_TONE = 'offline';
const UNKNOWN_TONE = 'unknown';

/**
 * @param {string} iso
 * @returns {number} Epoch ms, or 0 when unparseable
 */
function toEpoch(iso) {
    const value = Date.parse(iso);
    return Number.isNaN(value) ? 0 : value;
}

/**
 * @param {unknown} status
 * @returns {string} A known light, or an empty string
 */
function normalizeLight(status) {
    const value = String(status || '').trim();
    return STATUS_LIGHTS.includes(value) ? value : '';
}

/**
 * @param {string} light
 * @returns {string} The style class suffix for a light
 */
function toneForLight(light) {
    const meta = STATUS_LIGHT_META.find((entry) => entry.light === light);
    return meta ? meta.tone : UNKNOWN_TONE;
}

/**
 * Merge both feeds into one ordered event list.
 *
 * Presence events sort before status events at the same timestamp so that a
 * change landing on the same millisecond as the online event still wins the
 * final state.
 *
 * @param {object[]} statusRows - Feed_status rows
 * @param {object[]} presenceRows - Feed_online_offline rows
 * @returns {object[]} Events ascending by time
 */
function normalizeStatusEvents(statusRows, presenceRows) {
    const events = [];
    for (const row of presenceRows || []) {
        const at = toEpoch(row.created_at);
        const type = String(row.type || '');
        if (!at || (type !== 'Online' && type !== 'Offline')) {
            continue;
        }
        events.push({ at, order: 0, online: type === 'Online' });
    }
    for (const row of statusRows || []) {
        const at = toEpoch(row.created_at);
        const light = normalizeLight(row.status);
        if (!at || !light) {
            continue;
        }
        events.push({
            at,
            order: 1,
            light,
            description: String(row.status_description || ''),
            previousLight: normalizeLight(row.previous_status),
            previousDescription: String(row.previous_status_description || '')
        });
    }
    events.sort((a, b) => a.at - b.at || a.order - b.order);
    return events;
}

/**
 * Build the interval timeline for one player.
 *
 * Intervals run back to back from the first event to `now`. An interval with
 * `online` false is an offline stretch, `light === null` with `online` true is an
 * online stretch whose light was never recorded, and `inferred` marks the single
 * case we fill in from `previous_status`.
 *
 * Neighbouring intervals in the same state are merged, so the result is a run of
 * maximal constant-state stretches rather than one entry per raw row.
 *
 * A stretch between two recorded events is taken at face value however long it is:
 * both of its ends are things VRCX actually saw, and for status the long ones are
 * ordinary, because a light that simply stays put produces no rows at all. Only the
 * trailing stretch - from the last event to now - is capped, since there is no
 * second witness to say the state still holds.
 *
 * @param {object[]} statusRows - Feed_status rows for one user
 * @param {object[]} presenceRows - Feed_online_offline rows for the same user
 * @param {{ now?: number; maxGapMs?: number }} [options]
 * @returns {object[]} Intervals, oldest first
 */
function buildStatusIntervals(statusRows, presenceRows, options = {}) {
    const now = Number(options.now) || Date.now();
    const maxGapMs = Number(options.maxGapMs) || DEFAULT_MAX_GAP_MS;
    const events = normalizeStatusEvents(statusRows, presenceRows);

    const intervals = [];
    let online = false;
    let light = '';
    let description = '';
    let since = null;

    /**
     * @param {number} endAt
     * @param {boolean} open - True for the trailing stretch that no event closes
     */
    const push = (endAt, open) => {
        if (since === null || endAt <= since) {
            return;
        }
        const gapMs = endAt - since;
        const reliable = open ? gapMs <= maxGapMs : true;
        const last = intervals[intervals.length - 1];
        if (
            last &&
            last.reliable === reliable &&
            last.online === online &&
            last.light === (light || null) &&
            last.description === description
        ) {
            last.endAt = endAt;
            last.durationMs = last.reliable ? last.endAt - last.startAt : 0;
            return;
        }
        intervals.push({
            startAt: since,
            endAt,
            online,
            light: light || null,
            description,
            known: Boolean(online && light),
            inferred: false,
            reliable,
            durationMs: reliable ? gapMs : 0
        });
    };

    for (const event of events) {
        push(event.at, false);
        if (event.light) {
            // The stretch that just closed was spent in what this change moved away
            // from. Only the stretch that actually ended here qualifies, which is why
            // the end is compared rather than just taking the last interval.
            const last = intervals[intervals.length - 1];
            if (last && last.endAt === event.at && last.online && !last.light && event.previousLight) {
                last.light = event.previousLight;
                last.known = false;
                last.inferred = true;
                last.description = event.previousDescription;
            }
            // A status change is proof of being online even when presence disagrees.
            online = true;
            light = event.light;
            description = event.description;
        } else {
            online = event.online;
            light = '';
            description = '';
        }
        since = event.at;
    }
    push(now, true);
    return intervals;
}

/**
 * Headline numbers for the dashboard.
 *
 * `observedMs` covers time where a light was actually recorded and is the only
 * denominator the shares should use. The remaining buckets exist so the page can
 * say how much of the record the percentages leave out, rather than quietly
 * implying they cover everything.
 *
 * Per light, `runs` counts the separate stretches it was worn for and `switches`
 * counts only changes from one known light to another, so a login does not inflate
 * either of them.
 *
 * @param {object[]} intervals
 * @returns {object}
 */
function summarizeStatusLights(intervals) {
    const list = intervals || [];
    const lights = {};
    for (const light of STATUS_LIGHTS) {
        lights[light] = {
            light,
            tone: toneForLight(light),
            observedMs: 0,
            inferredMs: 0,
            runs: 0,
            longestMs: 0,
            averageMs: 0
        };
    }

    let observedMs = 0;
    let inferredMs = 0;
    let unknownOnlineMs = 0;
    let offlineMs = 0;
    let reliableMs = 0;
    let switches = 0;

    // A run is consecutive time in one light. It ends whenever the light changes or
    // the player stops being observable, so a light re-entered later counts twice.
    let runLight = '';
    let runMs = 0;
    let lastLight = '';
    const days = new Set();

    const closeRun = () => {
        const bucket = lights[runLight];
        if (bucket && runMs > bucket.longestMs) {
            bucket.longestMs = runMs;
        }
        runLight = '';
        runMs = 0;
    };

    for (const interval of list) {
        reliableMs += interval.durationMs;

        if (!interval.online || !interval.light) {
            if (interval.online) {
                unknownOnlineMs += interval.durationMs;
            } else {
                offlineMs += interval.durationMs;
            }
            closeRun();
            lastLight = '';
            continue;
        }

        const bucket = lights[interval.light];
        if (!bucket) {
            continue;
        }
        if (interval.startAt) {
            days.add(new Date(interval.startAt).toLocaleDateString('sv'));
        }
        if (interval.known) {
            observedMs += interval.durationMs;
            bucket.observedMs += interval.durationMs;
        } else {
            inferredMs += interval.durationMs;
            bucket.inferredMs += interval.durationMs;
        }
        if (lastLight !== interval.light) {
            closeRun();
            bucket.runs++;
            // Coming back from offline or from an unrecorded stretch is not a switch:
            // that is just the light they were already wearing. Only a change from one
            // known light to another counts.
            if (lastLight) {
                switches++;
            }
            lastLight = interval.light;
            runLight = interval.light;
        }
        runMs += interval.durationMs;
    }
    closeRun();

    for (const bucket of Object.values(lights)) {
        const holdMs = bucket.observedMs + bucket.inferredMs;
        bucket.averageMs = bucket.runs ? Math.round(holdMs / bucket.runs) : 0;
    }

    const firstAt = list.length ? list[0].startAt : 0;
    const lastAt = list.length ? list[list.length - 1].endAt : 0;
    const spanMs = firstAt ? lastAt - firstAt : 0;

    return {
        firstAt,
        lastAt,
        spanMs,
        observedMs,
        inferredMs,
        unknownOnlineMs,
        offlineMs,
        // everything the gap rule refused to attribute: VRCX was not running
        unrecordedMs: Math.max(0, spanMs - reliableMs),
        recordedMs: reliableMs,
        switches,
        days: days.size,
        lights
    };
}

/**
 * The four way split the page draws.
 *
 * The denominator follows the chosen mode, so the shares always describe the
 * series they are drawn from. Inferred time is only ever admitted when asked for,
 * and the caller is expected to mark it as an estimate on screen.
 *
 * @param {object} summary - From summarizeStatusLights
 * @param {{ includeInferred?: boolean }} [options]
 * @returns {{ rows: object[]; totalMs: number; includeInferred: boolean }}
 */
function statusLightShares(summary, options = {}) {
    const includeInferred = options.includeInferred === true;
    const stats = (summary && summary.lights) || {};
    let totalMs = 0;
    const raw = STATUS_LIGHTS.map((light) => {
        const bucket = stats[light] || { observedMs: 0, inferredMs: 0 };
        const ms = includeInferred ? bucket.observedMs + bucket.inferredMs : bucket.observedMs;
        totalMs += ms;
        return { light, ms };
    });
    return {
        includeInferred,
        totalMs,
        rows: raw.map((row) => ({
            ...row,
            share: totalMs ? row.ms / totalMs : 0,
            tone: toneForLight(row.light)
        }))
    };
}

/**
 * Split one interval at local midnight so it can be drawn inside a single day.
 *
 * @param {object} interval
 * @returns {object[]}
 */
function splitIntervalByDay(interval) {
    const parts = [];
    let cursor = interval.startAt;
    while (cursor < interval.endAt) {
        const date = new Date(cursor);
        let next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0).getTime();
        if (!(next > cursor)) {
            // A DST jump can make the next midnight land on or before the cursor.
            next = cursor + HOUR_MS;
        }
        const end = Math.min(next, interval.endAt);
        const durationMs = end - cursor;
        parts.push({
            ...interval,
            startAt: cursor,
            endAt: end,
            durationMs: interval.reliable ? durationMs : 0,
            continuesFrom: cursor !== interval.startAt,
            continuesInto: end !== interval.endAt
        });
        cursor = end;
    }
    return parts;
}

/**
 * Intervals grouped under local calendar days, newest day first.
 *
 * @param {object[]} intervals
 * @param {number} [limit] - Maximum number of days to return
 * @returns {{ dateKey: string; timestamp: number; segments: object[]; observedMs: number }[]}
 */
function statusLightDays(intervals, limit = 14) {
    const buckets = new Map();
    // oldest first, so segments inside a day read left to right
    for (const interval of intervals || []) {
        if (!interval.startAt) {
            continue;
        }
        for (const part of splitIntervalByDay(interval)) {
            const date = new Date(part.startAt);
            const dateKey = date.toLocaleDateString('sv');
            if (!buckets.has(dateKey)) {
                buckets.set(dateKey, {
                    dateKey,
                    timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
                    segments: [],
                    observedMs: 0
                });
            }
            const bucket = buckets.get(dateKey);
            bucket.segments.push({
                ...part,
                tone: part.online ? toneForLight(part.light) : OFFLINE_TONE
            });
            if (part.known) {
                bucket.observedMs += part.durationMs;
            }
        }
    }
    const days = [...buckets.values()].sort((a, b) => b.timestamp - a.timestamp);
    return Number.isFinite(limit) ? days.slice(0, limit) : days;
}

/**
 * Time spent in each light by hour of the local day, for the "what does this
 * player tend to wear at 9pm" strip.
 *
 * @param {object[]} intervals
 * @returns {{ hours: object[]; totals: Record<string, number>; maxHourMs: number }}
 */
function statusLightHours(intervals) {
    const hours = Array.from({ length: 24 }, () => ({}));
    const totals = {};
    let maxHourMs = 0;

    for (const interval of intervals || []) {
        if (!interval.online || !interval.light || !interval.reliable) {
            continue;
        }
        let cursor = interval.startAt;
        while (cursor < interval.endAt) {
            const date = new Date(cursor);
            const hour = date.getHours();
            let next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1, 0, 0, 0).getTime();
            if (!(next > cursor)) {
                next = cursor + HOUR_MS;
            }
            const end = Math.min(next, interval.endAt);
            const slice = end - cursor;
            hours[hour][interval.light] = (hours[hour][interval.light] || 0) + slice;
            totals[interval.light] = (totals[interval.light] || 0) + slice;
            cursor = end;
        }
    }
    // The strip scales every hour column against the busiest one, so this is the
    // largest single hour rather than the largest per light total.
    for (const bucket of hours) {
        const sum = Object.values(bucket).reduce((total, ms) => total + ms, 0);
        if (sum > maxHourMs) {
            maxHourMs = sum;
        }
    }
    return { hours, totals, maxHourMs: maxHourMs || 1 };
}

/**
 * Edits to the custom text attached to a light, newest first.
 *
 * Rows where the light also changed are labelled so the caller can show them
 * separately or leave them out.
 *
 * @param {object[]} rows - Feed_status rows for one user
 * @param {{ limit?: number; onlySameLight?: boolean }} [options]
 * @returns {object[]}
 */
function statusDescriptionChanges(rows, options = {}) {
    const limit = Number.isFinite(options.limit) ? options.limit : 60;
    const onlySameLight = options.onlySameLight === true;
    const changes = [];
    for (const row of rows || []) {
        const light = normalizeLight(row.status);
        const at = toEpoch(row.created_at);
        if (!at || !light) {
            continue;
        }
        const description = String(row.status_description || '');
        const previousDescription = String(row.previous_status_description || '');
        if (description === previousDescription) {
            continue;
        }
        const previousLight = String(row.previous_status || '').trim();
        if (onlySameLight && previousLight !== light) {
            continue;
        }
        changes.push({
            at,
            light,
            tone: toneForLight(light),
            description,
            previousDescription,
            lightChanged: previousLight !== light
        });
    }
    changes.sort((a, b) => b.at - a.at || a.description.localeCompare(b.description));
    return changes.slice(0, limit);
}

export {
    DEFAULT_MAX_GAP_MS,
    OFFLINE_TONE,
    STATUS_LIGHTS,
    STATUS_LIGHT_META,
    UNKNOWN_TONE,
    buildStatusIntervals,
    normalizeStatusEvents,
    splitIntervalByDay,
    statusDescriptionChanges,
    statusLightDays,
    statusLightHours,
    statusLightShares,
    summarizeStatusLights,
    toneForLight
};
