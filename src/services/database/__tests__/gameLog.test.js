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

    test('turns a leave time and a duration into a start and end', async () => {
        // created_at is when the user left and time is how long they stayed
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T12:00:00.000Z', 'wrld_1:123~region=jp', 3600000]);
            return undefined;
        });

        const result = await gameLog.getSelfLocationSegments();

        expect(result).toEqual([
            {
                location: 'wrld_1:123~region=jp',
                startAt: Date.parse('2026-09-20T11:00:00.000Z'),
                endAt: Date.parse('2026-09-20T12:00:00.000Z')
            }
        ]);
        const sql = mocks.execute.mock.calls[0][1];
        expect(sql).toContain('gamelog_location');
        expect(sql).toContain('location');
        expect(sql).toContain('ORDER BY created_at ASC');
        expect(sql).not.toContain('WHERE');
    });

    test('adds the date filter only when a start date is given', async () => {
        mocks.execute.mockImplementation(async () => undefined);

        await gameLog.getSelfLocationSegments('2026-09-01T00:00:00.000Z');

        expect(mocks.execute.mock.calls[0][1]).toContain('WHERE created_at >= @createdAfter');
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({ '@createdAfter': '2026-09-01T00:00:00.000Z' });
    });

    test('skips rows with no usable duration or location', async () => {
        mocks.execute.mockImplementation(async (callback) => {
            callback(['2026-09-20T12:00:00.000Z', 'wrld_1:123', 0]);
            callback(['2026-09-20T12:00:00.000Z', '', 3600000]);
            callback(['not-a-date', 'wrld_1:123', 3600000]);
            return undefined;
        });

        expect(await gameLog.getSelfLocationSegments()).toEqual([]);
    });
});
