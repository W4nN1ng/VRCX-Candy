import { describe, expect, test } from 'vitest';

import {
    DEFAULT_MAX_GAP_MS,
    buildStatusIntervals,
    normalizeStatusEvents,
    statusDescriptionChanges,
    statusLightDays,
    statusLightHours,
    statusLightShares,
    summarizeStatusLights,
    toneForLight
} from '../friendStatusLights';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Local-time ISO string, so tests that care about days and hours do not depend on
 * the machine timezone.
 *
 * @param {number} year
 * @param {number} month - Zero based, as Date expects
 * @param {number} day
 * @param {number} hour
 * @param {number} minute
 * @returns {string}
 */
function localIso(year, month, day, hour, minute = 0) {
    return new Date(year, month, day, hour, minute, 0, 0).toISOString();
}

/**
 * A fixed UTC reference point for the tests that only compare relative offsets.
 *
 * @param {number} offsetMs
 * @returns {string}
 */
function at(offsetMs) {
    return new Date(Date.UTC(2026, 7, 20, 10, 0, 0) + offsetMs).toISOString();
}

function statusRow(offsetMs, light, extra = {}) {
    return {
        created_at: at(offsetMs),
        status: light,
        status_description: extra.description || '',
        previous_status: extra.previous || '',
        previous_status_description: extra.previousDescription || ''
    };
}

function presenceRow(offsetMs, type) {
    return { created_at: at(offsetMs), type };
}

describe('normalizeStatusEvents', () => {
    test('merges both feeds in time order with presence first on a tie', () => {
        const events = normalizeStatusEvents(
            [statusRow(MINUTE, 'busy', { previous: 'active' })],
            [presenceRow(MINUTE, 'Online'), presenceRow(0, 'Offline')]
        );

        expect(events.map((event) => event.order)).toEqual([0, 0, 1]);
        expect(events[2]).toMatchObject({ light: 'busy', previousLight: 'active' });
    });

    test('drops rows with an unusable time, a poisoned type or a non light status', () => {
        const events = normalizeStatusEvents(
            [
                { created_at: 'not-a-date', status: 'active' },
                statusRow(0, 'offline'),
                statusRow(0, ''),
                statusRow(0, 'wat')
            ],
            [presenceRow(0, 'Maybe'), { created_at: at(0), type: 'Online' }]
        );

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ online: true });
    });
});

describe('buildStatusIntervals', () => {
    test('splits the timeline on offline and resumes with the next online', () => {
        const intervals = buildStatusIntervals(
            [statusRow(10 * MINUTE, 'active')],
            [presenceRow(0, 'Online'), presenceRow(HOUR, 'Offline'), presenceRow(2 * HOUR, 'Online')],
            { now: Date.parse(at(3 * HOUR)) }
        );

        expect(intervals).toHaveLength(4);
        expect(intervals[0]).toMatchObject({ online: true, light: null, durationMs: 10 * MINUTE });
        expect(intervals[1]).toMatchObject({ online: true, light: 'active', known: true });
        expect(intervals[2]).toMatchObject({ online: false, light: null, startAt: Date.parse(at(HOUR)) });
        expect(intervals[3]).toMatchObject({ online: true, light: null, known: false });
    });

    test('collapses the repeated presence rows the table is full of', () => {
        const intervals = buildStatusIntervals(
            [],
            [
                presenceRow(0, 'Online'),
                presenceRow(10 * MINUTE, 'Online'),
                presenceRow(20 * MINUTE, 'Online'),
                presenceRow(HOUR, 'Offline'),
                presenceRow(2 * HOUR, 'Offline')
            ],
            { now: Date.parse(at(3 * HOUR)) }
        );

        // one online stretch then one offline stretch, with no flapping in between
        expect(intervals.map((interval) => interval.online)).toEqual([true, false]);
    });

    test('treats a status change as proof the player was online', () => {
        const intervals = buildStatusIntervals(
            [statusRow(MINUTE, 'ask me', { previous: 'active' })],
            [presenceRow(0, 'Online'), presenceRow(MINUTE, 'Offline')],
            { now: Date.parse(at(HOUR)) }
        );

        // presence says offline straight after, but the change still opened a session
        const last = intervals[intervals.length - 1];
        expect(last).toMatchObject({ online: true, light: 'ask me', known: true });
    });

    test('fills the stretch before a session first change from previous_status', () => {
        const intervals = buildStatusIntervals(
            [statusRow(10 * MINUTE, 'busy', { previous: 'ask me' })],
            [presenceRow(0, 'Online')],
            { now: Date.parse(at(HOUR)) }
        );

        expect(intervals[0]).toMatchObject({
            light: 'ask me',
            known: false,
            inferred: true,
            startAt: Date.parse(at(0)),
            endAt: Date.parse(at(10 * MINUTE))
        });
    });

    test('leaves an online stretch unknown when no change ever recorded a light', () => {
        const intervals = buildStatusIntervals([], [presenceRow(0, 'Online'), presenceRow(HOUR, 'Offline')], {
            now: Date.parse(at(2 * HOUR))
        });

        expect(intervals[0]).toMatchObject({ online: true, light: null, inferred: false, known: false });
    });

    test('does not reach back across an offline stretch to fill a light in', () => {
        const intervals = buildStatusIntervals(
            [statusRow(10 * MINUTE, 'active'), statusRow(5 * HOUR, 'busy', { previous: 'active' })],
            [presenceRow(0, 'Online'), presenceRow(HOUR, 'Offline')],
            { now: Date.parse(at(6 * HOUR)) }
        );

        // the four hours before the unseen login stay offline rather than inheriting active
        expect(intervals[2]).toMatchObject({ online: false, light: null, inferred: false });
        expect(intervals[3]).toMatchObject({ online: true, light: 'busy' });
    });

    test('trusts a long stretch that both of its ends witness', () => {
        const intervals = buildStatusIntervals(
            [statusRow(HOUR, 'active'), statusRow(3 * 24 * HOUR, 'busy', { previous: 'active' })],
            [presenceRow(0, 'Online')],
            { now: Date.parse(at(3 * 24 * HOUR + HOUR)) }
        );

        // three days in one light is ordinary and produces no rows of its own, so a
        // stretch closed by two real events is taken at face value
        expect(intervals[1]).toMatchObject({ light: 'active', reliable: true, durationMs: 71 * HOUR });
    });

    test('refuses to attribute the trailing stretch once it exceeds the gap limit', () => {
        const intervals = buildStatusIntervals([statusRow(MINUTE, 'active')], [presenceRow(0, 'Online')], {
            now: Date.parse(at(20 * HOUR))
        });

        // nothing closes the session, so a twenty hour tail is not trusted
        expect(intervals[0].reliable).toBe(true);
        expect(intervals.at(-1)).toMatchObject({ reliable: false, durationMs: 0 });
    });

    test('honours a custom gap limit', () => {
        const intervals = buildStatusIntervals([], [presenceRow(0, 'Online')], {
            now: Date.parse(at(2 * HOUR)),
            maxGapMs: HOUR
        });

        expect(intervals[0].durationMs).toBe(0);
        expect(DEFAULT_MAX_GAP_MS).toBe(12 * HOUR);
    });

    test('tolerates junk input', () => {
        const now = Date.parse(at(HOUR));
        expect(buildStatusIntervals([], [], { now })).toEqual([]);
        expect(buildStatusIntervals(null, null, { now })).toEqual([]);
        expect(buildStatusIntervals([{ created_at: 'x', status: 'active' }], [], { now })).toEqual([]);
    });
});

describe('a changed status description is not a light change', () => {
    /**
     * A feed_status row where the light is unchanged but its custom text moved is a
     * real edit that cannot be told apart from a genuine light switch by looking at
     * `status` alone. Cutting the light interval there would invent a switch and
     * chop the run in half, so it is covered on its own.
     *
     * @returns {object[]}
     */
    function descriptionOnlyRows() {
        return [
            statusRow(MINUTE, 'active', { description: 'aaa' }),
            statusRow(30 * MINUTE, 'active', {
                description: 'bbb',
                previous: 'active',
                previousDescription: 'aaa'
            }),
            statusRow(45 * MINUTE, 'active', {
                description: 'ccc',
                previous: 'active',
                previousDescription: 'bbb'
            })
        ];
    }

    test('keeps one continuous run across the edits', () => {
        const intervals = buildStatusIntervals(
            descriptionOnlyRows(),
            [presenceRow(0, 'Online'), presenceRow(HOUR, 'Offline')],
            { now: Date.parse(at(2 * HOUR)) }
        );

        const lit = intervals.filter((interval) => interval.light === 'active');
        expect(lit.length).toBeGreaterThan(1);
        expect(lit.every((interval) => interval.known)).toBe(true);

        const summary = summarizeStatusLights(intervals);
        expect(summary.lights.active.runs).toBe(1);
        expect(summary.switches).toBe(0);
        expect(summary.lights.active.longestMs).toBe(59 * MINUTE);
        expect(summary.lights.active.observedMs).toBe(59 * MINUTE);
    });

    test('is reported separately as a description change', () => {
        const changes = statusDescriptionChanges(descriptionOnlyRows(), { onlySameLight: true });

        expect(changes).toHaveLength(2);
        expect(changes.map((change) => change.description)).toEqual(['ccc', 'bbb']);
        expect(changes[0]).toMatchObject({ light: 'active', previousDescription: 'bbb', lightChanged: false });
    });

    test('is left out of the count when a light change also moved the text', () => {
        const rows = [
            statusRow(0, 'active', { description: 'a' }),
            statusRow(HOUR, 'busy', { description: 'b', previous: 'active', previousDescription: 'a' })
        ];

        expect(statusDescriptionChanges(rows, { onlySameLight: true })).toHaveLength(0);
        expect(statusDescriptionChanges(rows)).toHaveLength(2);
        expect(statusDescriptionChanges(rows)[0].lightChanged).toBe(true);
    });

    test('ignores rows whose text did not move at all', () => {
        const rows = [statusRow(0, 'busy', { description: 'same', previous: 'busy', previousDescription: 'same' })];

        expect(statusDescriptionChanges(rows)).toEqual([]);
    });
});

describe('summarizeStatusLights', () => {
    /**
     * @returns {object[]}
     */
    function sampleIntervals() {
        return buildStatusIntervals(
            [
                statusRow(10 * MINUTE, 'busy', { previous: 'active' }),
                statusRow(40 * MINUTE, 'active', { previous: 'busy' })
            ],
            [presenceRow(0, 'Online'), presenceRow(HOUR, 'Offline')],
            { now: Date.parse(at(2 * HOUR)) }
        );
    }

    test('splits time into the buckets the page reports separately', () => {
        const summary = summarizeStatusLights(sampleIntervals());

        expect(summary.observedMs).toBe(50 * MINUTE);
        expect(summary.inferredMs).toBe(10 * MINUTE);
        expect(summary.offlineMs).toBe(HOUR);
        expect(summary.unknownOnlineMs).toBe(0);
        expect(summary.spanMs).toBe(2 * HOUR);
    });

    test('counts switches between lights but not logins', () => {
        const summary = summarizeStatusLights(sampleIntervals());

        // active -> busy -> active is two changes, and the session opening is not one
        expect(summary.switches).toBe(2);
        expect(summary.lights.busy.runs).toBe(1);
        expect(summary.lights.active.runs).toBe(2);
    });

    test('averages the hold time over the runs of that light', () => {
        const summary = summarizeStatusLights(sampleIntervals());

        // busy was held once for 30m; active was held twice, 10m inferred then 20m seen
        expect(summary.lights.busy.averageMs).toBe(30 * MINUTE);
        expect(summary.lights.active.averageMs).toBe(15 * MINUTE);
    });

    test('reports zeroes for an empty history', () => {
        const summary = summarizeStatusLights([]);

        expect(summary).toMatchObject({ observedMs: 0, inferredMs: 0, offlineMs: 0, switches: 0, days: 0 });
        expect(summary.lights.active.runs).toBe(0);
        expect(summarizeStatusLights(null).observedMs).toBe(0);
    });
});

describe('statusLightShares', () => {
    test('divides by observed time only unless inference is asked for', () => {
        const summary = summarizeStatusLights(
            buildStatusIntervals(
                [
                    statusRow(10 * MINUTE, 'busy', { previous: 'ask me' }),
                    statusRow(50 * MINUTE, 'busy', { previous: 'busy', description: 'edited' })
                ],
                [presenceRow(0, 'Online')],
                { now: Date.parse(at(HOUR)) }
            )
        );
        const plain = statusLightShares(summary);
        const withInferred = statusLightShares(summary, { includeInferred: true });

        expect(plain.totalMs).toBe(50 * MINUTE);
        expect(plain.rows.find((row) => row.light === 'busy').share).toBe(1);
        expect(plain.rows.find((row) => row.light === 'ask me').share).toBe(0);

        expect(withInferred.totalMs).toBe(HOUR);
        const inferred = withInferred.rows.find((row) => row.light === 'ask me');
        expect(inferred.ms).toBe(10 * MINUTE);
        expect(inferred.share).toBeCloseTo(10 / 60, 5);
    });

    test('always sums to one and reports a tone for each light', () => {
        const summary = summarizeStatusLights(
            buildStatusIntervals(
                [
                    statusRow(MINUTE, 'active', { previous: 'ask me' }),
                    statusRow(30 * MINUTE, 'busy', { previous: 'active' }),
                    statusRow(45 * MINUTE, 'join me', { previous: 'busy' })
                ],
                [presenceRow(0, 'Online')],
                { now: Date.parse(at(HOUR)) }
            )
        );
        const shares = statusLightShares(summary);

        expect(shares.rows).toHaveLength(4);
        expect(shares.rows.reduce((total, row) => total + row.share, 0)).toBeCloseTo(1, 10);
        expect(shares.rows.map((row) => row.tone)).toEqual(['online', 'joinme', 'askme', 'busy']);
    });

    test('reports zero shares when nothing was observed', () => {
        const shares = statusLightShares(summarizeStatusLights([]));

        expect(shares.totalMs).toBe(0);
        expect(shares.rows.every((row) => row.share === 0)).toBe(true);
    });

    test('maps every light onto a known style tone', () => {
        expect(toneForLight('active')).toBe('online');
        expect(toneForLight('offline')).not.toBe('online');
    });
});

describe('statusLightDays', () => {
    test('splits an interval at local midnight and lists newest day first', () => {
        const intervals = buildStatusIntervals(
            [{ created_at: localIso(2026, 8, 15, 23, 1), status: 'active', previous_status: '' }],
            [
                { created_at: localIso(2026, 8, 15, 23, 0), type: 'Online' },
                { created_at: localIso(2026, 8, 16, 1, 0), type: 'Offline' }
            ],
            { now: new Date(2026, 8, 16, 2, 0).getTime() }
        );
        const days = statusLightDays(intervals);

        expect(days[0].dateKey).toBe(new Date(2026, 8, 16).toLocaleDateString('sv'));
        expect(days[1].dateKey).toBe(new Date(2026, 8, 15).toLocaleDateString('sv'));
        expect(days[1].segments.at(-1)).toMatchObject({ light: 'active', continuesInto: true });
        expect(days[0].segments[0]).toMatchObject({ light: 'active', continuesFrom: true });
    });

    test('respects the day limit', () => {
        const intervals = buildStatusIntervals(
            [],
            [
                { created_at: localIso(2026, 8, 15, 10, 0), type: 'Online' },
                { created_at: localIso(2026, 8, 15, 11, 0), type: 'Offline' },
                { created_at: localIso(2026, 8, 16, 10, 0), type: 'Online' }
            ],
            { now: new Date(2026, 8, 16, 11, 0).getTime() }
        );

        expect(statusLightDays(intervals, 1)).toHaveLength(1);
        expect(statusLightDays(intervals, Number.POSITIVE_INFINITY).length).toBe(2);
    });

    test('returns nothing for no intervals', () => {
        expect(statusLightDays([], 5)).toEqual([]);
        expect(statusLightDays(null, 5)).toEqual([]);
    });
});

describe('statusLightHours', () => {
    test('buckets observed time into the local hour it was spent in', () => {
        const intervals = buildStatusIntervals(
            [{ created_at: localIso(2026, 8, 15, 12, 1), status: 'active', previous_status: '' }],
            [
                { created_at: localIso(2026, 8, 15, 12, 0), type: 'Online' },
                { created_at: localIso(2026, 8, 15, 13, 0), type: 'Offline' }
            ],
            { now: new Date(2026, 8, 15, 14, 0).getTime() }
        );
        const { hours, totals, maxHourMs } = statusLightHours(intervals);

        expect(hours).toHaveLength(24);
        expect(hours[12].active).toBe(59 * MINUTE);
        expect(totals.active).toBe(59 * MINUTE);
        expect(maxHourMs).toBe(59 * MINUTE);
    });

    test('leaves out stretches the gap rule refused to trust', () => {
        const intervals = buildStatusIntervals(
            [{ created_at: localIso(2026, 8, 15, 12, 1), status: 'active', previous_status: '' }],
            [{ created_at: localIso(2026, 8, 15, 12, 0), type: 'Online' }],
            { now: new Date(2026, 8, 16, 10, 0).getTime() }
        );
        const { hours, totals } = statusLightHours(intervals);

        // the tail runs past the gap limit, so none of it is attributed to hour 12
        expect(intervals.at(-1).reliable).toBe(false);
        expect(hours[12].active ?? 0).toBe(0);
        expect(totals.active ?? 0).toBe(0);
    });

    test('returns an all zero grid for no intervals', () => {
        const { hours, maxHourMs } = statusLightHours([]);

        expect(hours.every((bucket) => Object.keys(bucket).length === 0)).toBe(true);
        expect(maxHourMs).toBe(1);
    });
});
