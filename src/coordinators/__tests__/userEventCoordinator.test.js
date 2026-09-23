import { beforeEach, describe, expect, test, vi } from 'vitest';

const { addBioToDatabase, addEntry, addFeedEntry, queueFeedNoty, loadUserDialogBioHistory, friend, userDialog } =
    vi.hoisted(() => ({
        addBioToDatabase: vi.fn(),
        addEntry: vi.fn(),
        addFeedEntry: vi.fn(),
        queueFeedNoty: vi.fn(),
        loadUserDialogBioHistory: vi.fn(),
        friend: { id: 'usr_1', name: 'Tester' },
        userDialog: { visible: false, id: '' }
    }));

vi.mock('../../shared/utils', () => ({
    getGroupName: vi.fn(async () => ''),
    getWorldName: vi.fn(async () => ''),
    parseLocation: (value) => ({ tag: value })
}));

vi.mock('../../services/appConfig', () => ({
    AppDebug: {}
}));

vi.mock('../../services/database', () => ({
    database: {
        addBioToDatabase,
        addStatusToDatabase: vi.fn(),
        addGPSToDatabase: vi.fn(),
        addAvatarToDatabase: vi.fn()
    }
}));

vi.mock('../avatarCoordinator', () => ({
    getAvatarName: vi.fn(async () => ({ ownerId: '', avatarName: '' }))
}));

vi.mock('../../stores/feed', () => ({ useFeedStore: () => ({ addFeedEntry }) }));
vi.mock('../../stores/friend', () => ({
    useFriendStore: () => ({
        friends: {
            get: (id) => (id === 'usr_1' ? friend : undefined)
        }
    })
}));
vi.mock('../../stores/group', () => ({ useGroupStore: () => ({}) }));
vi.mock('../../stores/instance', () => ({ useInstanceStore: () => ({}) }));
vi.mock('../../stores/location', () => ({ useLocationStore: () => ({}) }));
vi.mock('../../stores/notification', () => ({ useNotificationStore: () => ({ queueFeedNoty }) }));
vi.mock('../../stores/sharedFeed', () => ({ useSharedFeedStore: () => ({ addEntry }) }));
vi.mock('../../stores/user', () => ({
    useUserStore: () => ({
        state: {},
        userDialog,
        applyUserDialogLocation: vi.fn(),
        checkNote: vi.fn(),
        loadUserDialogBioHistory
    })
}));
vi.mock('../../stores/world', () => ({ useWorldStore: () => ({}) }));

import { runHandleUserUpdateFlow } from '../userEventCoordinator';

const now = () => 1000;
const nowIso = () => '2026-09-23T00:00:00.000Z';

function bioRef() {
    return { id: 'usr_1', displayName: 'Tester' };
}

describe('runHandleUserUpdateFlow bio changes', () => {
    beforeEach(() => {
        addBioToDatabase.mockClear();
        addEntry.mockClear();
        addFeedEntry.mockClear();
        queueFeedNoty.mockClear();
        loadUserDialogBioHistory.mockClear();
        userDialog.visible = false;
        userDialog.id = '';
    });

    test('records a change between two non empty bios', async () => {
        await runHandleUserUpdateFlow(bioRef(), { bio: ['我不喜欢你', '我喜欢你'] }, { now, nowIso });

        expect(addBioToDatabase).toHaveBeenCalledWith({
            created_at: nowIso(),
            type: 'Bio',
            userId: 'usr_1',
            displayName: 'Tester',
            bio: '我不喜欢你',
            previousBio: '我喜欢你'
        });
    });

    test('ignores a bio that was set from an empty one', async () => {
        await runHandleUserUpdateFlow(bioRef(), { bio: ['你好', ''] }, { now, nowIso });

        expect(addBioToDatabase).not.toHaveBeenCalled();
    });

    test('ignores a bio that looks cleared, the api reports empty bios on refresh', async () => {
        await runHandleUserUpdateFlow(bioRef(), { bio: ['', '你好'] }, { now, nowIso });

        expect(addBioToDatabase).not.toHaveBeenCalled();
    });

    test('ignores an unchanged bio', async () => {
        await runHandleUserUpdateFlow(bioRef(), { bio: ['你好', '你好'] }, { now, nowIso });

        expect(addBioToDatabase).not.toHaveBeenCalled();
    });

    test('ignores updates for users that are not friends', async () => {
        await runHandleUserUpdateFlow({ id: 'usr_2', displayName: 'Stranger' }, { bio: ['a', 'b'] }, { now, nowIso });

        expect(addBioToDatabase).not.toHaveBeenCalled();
    });

    test('reloads the bio history of an open dialog', async () => {
        userDialog.visible = true;
        userDialog.id = 'usr_1';

        await runHandleUserUpdateFlow(bioRef(), { bio: ['新简介', '旧简介'] }, { now, nowIso });

        expect(loadUserDialogBioHistory).toHaveBeenCalledWith('usr_1');
    });

    test('does not reload the bio history of another user', async () => {
        userDialog.visible = true;
        userDialog.id = 'usr_9';

        await runHandleUserUpdateFlow(bioRef(), { bio: ['新简介', '旧简介'] }, { now, nowIso });

        expect(loadUserDialogBioHistory).not.toHaveBeenCalled();
    });

    test('still emits the feed entry for a bio change', async () => {
        await runHandleUserUpdateFlow(bioRef(), { bio: ['b', 'a'] }, { now, nowIso });

        expect(queueFeedNoty).toHaveBeenCalledTimes(1);
        expect(addEntry).toHaveBeenCalledTimes(1);
        expect(addFeedEntry).toHaveBeenCalledTimes(1);
    });
});
