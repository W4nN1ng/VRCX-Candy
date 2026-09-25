import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    execute: vi.fn()
}));

vi.mock('../../sqlite.js', () => ({
    default: {
        execute: mocks.execute,
        executeNonQuery: vi.fn()
    }
}));
vi.mock('../index.js', () => ({
    dbVars: {
        maxTableSize: 500,
        userPrefix: ''
    }
}));

import { gameLog } from '../gameLog.js';

describe('gameLog.getMyTopWorlds', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('adds an exclude clause when a home world id is provided', async () => {
        mocks.execute.mockImplementation(async (callback, _sql, _params) => {
            callback(['wrld_1', 'World One', 3, 9000]);
            return undefined;
        });

        const result = await gameLog.getMyTopWorlds(30, 5, 'time', 'wrld_home');

        expect(result).toEqual([
            {
                worldId: 'wrld_1',
                worldName: 'World One',
                visitCount: 3,
                totalTime: 9000
            }
        ]);
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(mocks.execute.mock.calls[0][1]).toContain('AND world_id != @excludeWorldId');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({
            '@limit': 5,
            '@daysOffset': '-30 days',
            '@excludeWorldId': 'wrld_home'
        });
    });
});

describe('gameLog.getSelfLocationSegments', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('runs a stay from the enter time to the enter time plus the duration', async () => {
        // the row is written on entry and `time` is filled in with the duration on exit
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T12:00:00.000Z', 'wrld_1:123~region=jp', 3600000, 'Cafe', 'My group']);
            return undefined;
        });

        const result = await gameLog.getSelfLocationSegments();

        expect(result).toEqual([
            {
                location: 'wrld_1:123~region=jp',
                worldName: 'Cafe',
                groupName: 'My group',
                startAt: Date.parse('2026-09-20T12:00:00.000Z'),
                endAt: Date.parse('2026-09-20T13:00:00.000Z')
            }
        ]);
        const sql = mocks.execute.mock.calls[0][1];
        expect(sql).toContain('gamelog_location');
        expect(sql).toContain('location');
        expect(sql).toContain('world_name');
        expect(sql).toContain('ORDER BY created_at ASC');
        expect(sql).not.toContain('WHERE');
    });

    test('adds the date filter only when a start date is given', async () => {
        mocks.execute.mockImplementation(async () => undefined);

        await gameLog.getSelfLocationSegments('2026-09-01T00:00:00.000Z');

        expect(mocks.execute.mock.calls[0][1]).toContain('WHERE created_at >= @createdAfter');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@createdAfter': '2026-09-01T00:00:00.000Z' });
    });

    test('stretches the newest row, which is the stay still happening now', async () => {
        const started = Date.now() - 5 * 60 * 1000;
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T11:00:00.000Z', 'wrld_1:123', 60000, '', '']);
            callback([new Date(started).toISOString(), 'wrld_2:456', 0, '', '']);
            return undefined;
        });

        const [first, last] = await gameLog.getSelfLocationSegments();

        expect(first).toEqual({
            location: 'wrld_1:123',
            worldName: '',
            groupName: '',
            startAt: Date.parse('2026-09-20T11:00:00.000Z'),
            endAt: Date.parse('2026-09-20T11:01:00.000Z')
        });
        expect(last.location).toBe('wrld_2:456');
        expect(last.open).toBe(true);
        expect(last.endAt).toBeGreaterThan(last.startAt);
        // capped, so a stale "current" row from a crash cannot pretend to last forever
        expect(last.endAt - last.startAt).toBeLessThanOrEqual(12 * 60 * 60 * 1000);
    });

    test('drops rows with no location, an unparseable date, or no duration', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T12:00:00.000Z', '', 3600000, '', '']);
            callback(['not-a-date', 'wrld_1:123', 3600000, '', '']);
            callback(['2026-09-20T13:00:00.000Z', 'wrld_2:456', 0, '', '']);
            callback(['2026-09-20T14:00:00.000Z', 'wrld_3:789', 60000, '', '']);
            return undefined;
        });

        const result = await gameLog.getSelfLocationSegments();

        // only the last row may be an open stay, so the zero duration one is dropped
        expect(result.map((segment) => segment.location)).toEqual(['wrld_3:789']);
    });
});

describe('gameLog.getFriendPresenceRows', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('maps rows to the five columns the meeting view needs, oldest first', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T12:00:00.000Z', 'OnPlayerJoined', 'wrld_1:123~region(jp)', 'usr_a', 'A']);
            return undefined;
        });

        const result = await gameLog.getFriendPresenceRows();

        expect(result).toEqual([
            {
                created_at: '2026-09-20T12:00:00.000Z',
                type: 'OnPlayerJoined',
                location: 'wrld_1:123~region(jp)',
                user_id: 'usr_a',
                display_name: 'A'
            }
        ]);
        const sql = mocks.execute.mock.calls[0][1];
        expect(sql).toContain('gamelog_join_leave');
        expect(sql).toContain('_friend_log_current');
        expect(sql).toContain('ORDER BY created_at ASC, id ASC');
        expect(sql).not.toContain('AND created_at >=');
    });

    test('coerces null columns to empty strings', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T12:00:00.000Z', null, null, null, null]);
            return undefined;
        });

        expect(await gameLog.getFriendPresenceRows()).toEqual([
            { created_at: '2026-09-20T12:00:00.000Z', type: '', location: '', user_id: '', display_name: '' }
        ]);
    });

    test('adds the date filter only when a start date is given', async () => {
        mocks.execute.mockImplementation(async () => undefined);

        await gameLog.getFriendPresenceRows('2026-09-01T00:00:00.000Z');

        expect(mocks.execute.mock.calls[0][1]).toContain('AND created_at >= @createdAfter');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@createdAfter': '2026-09-01T00:00:00.000Z' });
    });
});
