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
