import { describe, expect, test } from 'vitest';

import { selfPresenceRowsFromSessions, selfStatusChangeRow } from '../selfStatusHistory';
import { buildStatusIntervals } from '../friendStatusLights';

const ME = 'usr_me';
const AT = '2026-10-05T00:00:00.000Z';

function row(overrides = {}) {
    return {
        userId: ME,
        displayName: '晚凝',
        before: { status: 'ask me' },
        after: { status: 'join me' },
        at: AT,
        ...overrides
    };
}

describe('selfStatusChangeRow', () => {
    test('writes a row when the light changed', () => {
        expect(selfStatusChangeRow(row())).toEqual({
            created_at: AT,
            type: 'Status',
            userId: ME,
            displayName: '晚凝',
            status: 'join me',
            statusDescription: '',
            previousStatus: 'ask me',
            previousStatusDescription: ''
        });
    });

    test('writes a row when only the signature changed', () => {
        const result = selfStatusChangeRow(
            row({
                before: { status: 'join me', statusDescription: 'old' },
                after: { status: 'join me', statusDescription: 'new' }
            })
        );
        expect(result.status).toBe('join me');
        expect(result.statusDescription).toBe('new');
        expect(result.previousStatusDescription).toBe('old');
    });

    test('skips the first fill, when there is nothing to have changed from', () => {
        expect(selfStatusChangeRow(row({ before: null }))).toBeNull();
        expect(selfStatusChangeRow(row({ before: {} }))).toBeNull();
        expect(selfStatusChangeRow(row({ before: { status: '' } }))).toBeNull();
    });

    test('skips a redelivery of what was already recorded', () => {
        // A refetch after a PUT the caller already wrote would otherwise double up.
        expect(selfStatusChangeRow(row({ before: { status: 'join me' }, after: { status: 'join me' } }))).toBeNull();
    });

    test('skips a statusless payload', () => {
        expect(selfStatusChangeRow(row({ after: {} }))).toBeNull();
        expect(selfStatusChangeRow(row({ after: { status: '   ' } }))).toBeNull();
        expect(selfStatusChangeRow(row({ after: null }))).toBeNull();
    });

    test('needs an id', () => {
        expect(selfStatusChangeRow(row({ userId: '' }))).toBeNull();
        expect(selfStatusChangeRow(row({ userId: null }))).toBeNull();
    });

    test('trims the name and tolerates a missing one', () => {
        expect(selfStatusChangeRow(row({ displayName: '  Ann  ' })).displayName).toBe('Ann');
        expect(selfStatusChangeRow(row({ displayName: undefined })).displayName).toBe('');
    });
});

describe('selfPresenceRowsFromSessions', () => {
    const start = Date.parse('2026-10-01T10:00:00.000Z');
    const end = Date.parse('2026-10-01T12:00:00.000Z');

    test('turns one closed session into an online/offline pair', () => {
        const rows = selfPresenceRowsFromSessions([{ start, end, isOpenTail: false }]);
        expect(rows).toEqual([
            { created_at: new Date(start).toJSON(), type: 'Online' },
            { created_at: new Date(end).toJSON(), type: 'Offline' }
        ]);
    });

    test('leaves an open session unclosed', () => {
        const rows = selfPresenceRowsFromSessions([{ start, end, isOpenTail: true }]);
        expect(rows).toEqual([{ created_at: new Date(start).toJSON(), type: 'Online' }]);
    });

    test('sorts oldest first whatever order the sessions came in', () => {
        const rows = selfPresenceRowsFromSessions([
            { start: start + 86400000, end: start + 90000000, isOpenTail: false },
            { start, end, isOpenTail: false }
        ]);
        expect(rows.map((r) => r.type)).toEqual(['Online', 'Offline', 'Online', 'Offline']);
        expect(Date.parse(rows[0].created_at)).toBeLessThan(Date.parse(rows[1].created_at));
    });

    test('drops sessions that ended before the window', () => {
        expect(selfPresenceRowsFromSessions([{ start, end, isOpenTail: false }], end + 1)).toEqual([]);
        expect(selfPresenceRowsFromSessions([{ start, end, isOpenTail: false }], end - 1)).toHaveLength(2);
    });

    test('keeps a running session however long ago it started', () => {
        // This is the row that says what state the user is in right now.
        const rows = selfPresenceRowsFromSessions([{ start, end, isOpenTail: true }], end + 999999);
        expect(rows).toEqual([{ created_at: new Date(start).toJSON(), type: 'Online' }]);
    });

    test('accepts the ISO string the page holds and ignores junk', () => {
        expect(selfPresenceRowsFromSessions([{ start, end }], new Date(end - 1).toJSON())).toHaveLength(2);
        expect(selfPresenceRowsFromSessions(null)).toEqual([]);
        expect(selfPresenceRowsFromSessions([{}, null, { start: 'x' }])).toEqual([]);
    });

    test('a session with no end is treated as still open', () => {
        expect(selfPresenceRowsFromSessions([{ start }])).toEqual([
            { created_at: new Date(start).toJSON(), type: 'Online' }
        ]);
    });
});

describe('self history through the real timeline', () => {
    test('offline hours are not counted as time spent wearing a light', () => {
        // The whole reason the presence rows are synthesized: feed_online_offline has no
        // rows for the logged-in player, and a status light page without them would
        // report the same multi-day lights that the friend page used to.
        const online = Date.parse('2026-10-01T10:00:00.000Z');
        const offline = Date.parse('2026-10-01T11:00:00.000Z');
        const statusAt = Date.parse('2026-10-01T10:30:00.000Z');
        const websiteEditWhileAsleep = Date.parse('2026-10-01T20:00:00.000Z');

        const statusRows = [
            {
                created_at: new Date(statusAt).toJSON(),
                status: 'busy',
                status_description: '',
                previous_status: '',
                previous_status_description: ''
            },
            {
                created_at: new Date(websiteEditWhileAsleep).toJSON(),
                status: 'ask me',
                status_description: '',
                previous_status: 'busy',
                previous_status_description: ''
            }
        ];
        const presenceRows = selfPresenceRowsFromSessions([{ start: online, end: offline, isOpenTail: false }]);

        const intervals = buildStatusIntervals(statusRows, presenceRows, { now: websiteEditWhileAsleep + 60000 });
        const lit = intervals.filter((interval) => interval.known);
        expect(lit).toHaveLength(1);
        expect(lit[0].light).toBe('busy');
        // Nothing after going offline counts, so the timeline stops at the log off.
        expect(lit[0].endAt).toBe(offline);
    });
});
