import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    execute: vi.fn(),
    executeNonQuery: vi.fn()
}));

vi.mock('../../sqlite.js', () => ({
    default: {
        execute: mocks.execute,
        executeNonQuery: mocks.executeNonQuery
    }
}));
vi.mock('../index.js', () => ({
    dbVars: {
        maxTableSize: 500,
        searchTableSize: 5000,
        userPrefix: 'usr123'
    }
}));

import { feed } from '../feed.js';

describe('feed.getBioHistoryForUserId', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
        mocks.executeNonQuery.mockReset();
    });

    test('maps rows to bio history entries', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback([1, '2026-09-23T00:00:00.000Z', 'usr_1', 'Tester', '我不喜欢你', '我喜欢你']);
            return undefined;
        });

        const result = await feed.getBioHistoryForUserId('usr_1');

        expect(result).toEqual([
            {
                rowId: 1,
                created_at: '2026-09-23T00:00:00.000Z',
                userId: 'usr_1',
                displayName: 'Tester',
                bio: '我不喜欢你',
                previousBio: '我喜欢你'
            }
        ]);
        expect(mocks.execute.mock.calls[0][1]).toContain('usr123_feed_bio');
        expect(mocks.execute.mock.calls[0][1]).toContain('WHERE user_id = @user_id');
        expect(mocks.execute.mock.calls[0][1]).toContain("AND bio != ''");
        expect(mocks.execute.mock.calls[0][1]).toContain("AND previous_bio != ''");
        expect(mocks.execute.mock.calls[0][1]).toContain('ORDER BY created_at ASC, id ASC');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@user_id': 'usr_1' });
    });

    test('turns missing bio columns into empty strings', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback([2, '2026-09-23T01:00:00.000Z', 'usr_1', 'Tester', null, null]);
            return undefined;
        });

        const result = await feed.getBioHistoryForUserId('usr_1');

        expect(result[0]).toMatchObject({ bio: '', previousBio: '' });
    });

    test('honours the entry limit', async () => {
        mocks.execute.mockImplementation(async () => undefined);

        await feed.getBioHistoryForUserId('usr_1', 10);

        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@limit': 10 });
    });
});

describe('feed.getGpsRowsForUserId', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('maps rows and keeps the ascending order', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T00:00:00.000Z', 'wrld_1:inst', 'offline', 'Alpha', '中文游戏社区', 60000]);
            return undefined;
        });

        const result = await feed.getGpsRowsForUserId('usr_1');

        expect(result).toEqual([
            {
                created_at: '2026-09-20T00:00:00.000Z',
                location: 'wrld_1:inst',
                previous_location: 'offline',
                world_name: 'Alpha',
                group_name: '中文游戏社区',
                time: 60000
            }
        ]);
        const sql = mocks.execute.mock.calls[0][1];
        expect(sql).toContain('usr123_feed_gps');
        expect(sql).toContain('ORDER BY created_at ASC, id ASC');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@user_id': 'usr_1' });
        expect(sql).not.toContain('AND created_at >=');
    });

    test('adds the date filter only when a start date is given', async () => {
        mocks.execute.mockImplementation(async () => undefined);

        await feed.getGpsRowsForUserId('usr_1', '2026-09-01T00:00:00.000Z');

        expect(mocks.execute.mock.calls[0][1]).toContain('AND created_at >= @created_after');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@created_after': '2026-09-01T00:00:00.000Z' });
    });

    test('coerces a null group name to an empty string', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T00:00:00.000Z', 'private:private', '', null, null, null]);
            return undefined;
        });

        const result = await feed.getGpsRowsForUserId('usr_1');

        expect(result[0]).toMatchObject({ world_name: '', group_name: '', time: 0 });
    });
});

describe('feed.getPlayersWithGpsHistory', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('returns one entry per player', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['usr_1', 'Tester', 42, 12, '2026-09-20T00:00:00.000Z']);
            return undefined;
        });

        const result = await feed.getPlayersWithGpsHistory();

        expect(result).toEqual([
            {
                userId: 'usr_1',
                displayName: 'Tester',
                visits: 42,
                worlds: 12,
                lastAt: '2026-09-20T00:00:00.000Z'
            }
        ]);
        expect(mocks.execute.mock.calls[0][1]).toContain('GROUP BY user_id');
    });

    test('filters by start date when given', async () => {
        mocks.execute.mockImplementation(async () => undefined);

        await feed.getPlayersWithGpsHistory('2026-09-01T00:00:00.000Z');

        expect(mocks.execute.mock.calls[0][1]).toContain('WHERE created_at >= @created_after');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@created_after': '2026-09-01T00:00:00.000Z' });
    });
});

describe('feed.getStatusRowsForUserId', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('maps rows and keeps the ascending order', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T00:00:00.000Z', 'busy', '加班中', 'active', '在线']);
            return undefined;
        });

        const result = await feed.getStatusRowsForUserId('usr_1');

        expect(result).toEqual([
            {
                created_at: '2026-09-20T00:00:00.000Z',
                status: 'busy',
                status_description: '加班中',
                previous_status: 'active',
                previous_status_description: '在线'
            }
        ]);
        const sql = mocks.execute.mock.calls[0][1];
        expect(sql).toContain('usr123_feed_status');
        expect(sql).toContain('ORDER BY created_at ASC, id ASC');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@user_id': 'usr_1' });
        expect(sql).not.toContain('AND created_at >=');
    });

    test('adds the date filter only when a start date is given', async () => {
        mocks.execute.mockImplementation(async () => undefined);

        await feed.getStatusRowsForUserId('usr_1', '2026-09-01T00:00:00.000Z');

        expect(mocks.execute.mock.calls[0][1]).toContain('AND created_at >= @created_after');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@created_after': '2026-09-01T00:00:00.000Z' });
    });

    test('coerces null columns to empty strings', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T00:00:00.000Z', null, null, null, null]);
            return undefined;
        });

        const result = await feed.getStatusRowsForUserId('usr_1');

        expect(result[0]).toMatchObject({ status: '', status_description: '', previous_status: '' });
    });

    test('does not filter out rows whose light stayed put', async () => {
        mocks.execute.mockImplementation(async () => undefined);

        await feed.getStatusRowsForUserId('usr_1');

        // a text-only edit keeps the light but is still a real change, so the read
        // must not discard rows where status equals previous_status
        expect(mocks.execute.mock.calls[0][1]).not.toContain('status != previous_status');
    });
});

describe('feed.getPresenceRowsForUserId', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('maps rows to time and type, oldest first', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T00:00:00.000Z', 'Online']);
            return undefined;
        });

        const result = await feed.getPresenceRowsForUserId('usr_1');

        expect(result).toEqual([{ created_at: '2026-09-20T00:00:00.000Z', type: 'Online' }]);
        const sql = mocks.execute.mock.calls[0][1];
        expect(sql).toContain('usr123_feed_online_offline');
        expect(sql).toContain('ORDER BY created_at ASC, id ASC');
        expect(sql).not.toContain('AND created_at >=');
    });

    test('adds the date filter only when a start date is given', async () => {
        mocks.execute.mockImplementation(async () => undefined);

        await feed.getPresenceRowsForUserId('usr_1', '2026-09-01T00:00:00.000Z');

        expect(mocks.execute.mock.calls[0][1]).toContain('AND created_at >= @created_after');
    });
});

describe('feed.getPlayersWithStatusHistory', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('returns one entry per player with a change count', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['usr_1', 'Tester', 91, '2026-09-20T00:00:00.000Z']);
            return undefined;
        });

        const result = await feed.getPlayersWithStatusHistory();

        expect(result).toEqual([
            {
                userId: 'usr_1',
                displayName: 'Tester',
                changes: 91,
                lastAt: '2026-09-20T00:00:00.000Z'
            }
        ]);
        expect(mocks.execute.mock.calls[0][1]).toContain('GROUP BY user_id');
        expect(mocks.execute.mock.calls[0][1]).not.toContain('WHERE');
    });

    test('filters by start date when given', async () => {
        mocks.execute.mockImplementation(async () => undefined);

        await feed.getPlayersWithStatusHistory('2026-09-01T00:00:00.000Z');

        expect(mocks.execute.mock.calls[0][1]).toContain('WHERE created_at >= @created_after');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@created_after': '2026-09-01T00:00:00.000Z' });
    });
});

describe('feed.addBioToDatabase', () => {
    beforeEach(() => {
        mocks.executeNonQuery.mockReset();
    });

    test('binds the bio and the previous bio', async () => {
        await feed.addBioToDatabase({
            created_at: '2026-09-23T00:00:00.000Z',
            userId: 'usr_1',
            displayName: 'Tester',
            bio: '新简介',
            previousBio: '旧简介'
        });

        expect(mocks.executeNonQuery.mock.calls[0][1]).toMatchObject({
            '@bio': '新简介',
            '@previous_bio': '旧简介'
        });
    });
});
