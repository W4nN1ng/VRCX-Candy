import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { HIDDEN_FRIENDS_MAX, HIDDEN_FRIENDS_STORAGE_KEY } from '../../shared/constants/hiddenFriends';

const db = { raw: undefined, keys: new Set() };

vi.mock('../../services/config', () => ({
    default: {
        getString: async (key) => {
            db.keys.add(key);
            return typeof db.raw === 'string' ? db.raw : null;
        },
        setString: async (key, value) => {
            db.keys.add(key);
            db.raw = value;
        }
    }
}));

import { useHiddenFriendsStore } from '../settings/hiddenFriends';

beforeEach(() => {
    setActivePinia(createPinia());
    db.raw = undefined;
    db.keys = new Set();
});

describe('hiddenFriends store', () => {
    test('reads and writes one config key', async () => {
        const instance = useHiddenFriendsStore();
        await instance.load();
        expect([...db.keys]).toEqual([HIDDEN_FRIENDS_STORAGE_KEY]);
    });

    test('starts empty and marks itself loaded', async () => {
        const instance = useHiddenFriendsStore();
        await instance.load();
        expect(instance.hidden).toEqual([]);
        expect(instance.count).toBe(0);
        expect(instance.loaded).toBe(true);
    });

    test('reads a stored list back', async () => {
        db.raw = JSON.stringify([
            { userId: 'usr_a', displayName: 'Alice', at: 5 },
            { userId: 'grp_bad', displayName: 'Dropped' }
        ]);
        const instance = useHiddenFriendsStore();
        await instance.load();
        expect(instance.hidden.map((entry) => entry.userId)).toEqual(['usr_a']);
        expect(instance.isHidden('usr_a')).toBe(true);
    });

    test('survives a corrupt blob instead of taking the feature down', async () => {
        db.raw = '{{{';
        const instance = useHiddenFriendsStore();
        await instance.load();
        expect(instance.hidden).toEqual([]);
        expect(instance.loaded).toBe(true);
    });

    test('hides newest first and writes it through', async () => {
        const instance = useHiddenFriendsStore();
        await instance.load();
        expect(instance.hide('usr_b', 'Bee')).toBe(true);
        expect(instance.hide('usr_a', 'Ant')).toBe(true);
        expect(instance.hidden.map((entry) => entry.userId)).toEqual(['usr_a', 'usr_b']);
        await vi.waitFor(() => {
            expect(JSON.parse(db.raw).map((entry) => entry.userId)).toEqual(['usr_a', 'usr_b']);
        });
    });

    test('refuses a repeat and something that is not a user id', async () => {
        const instance = useHiddenFriendsStore();
        await instance.load();
        expect(instance.hide('usr_a', 'Ant')).toBe(true);
        expect(instance.hide('usr_a', 'Again')).toBe(false);
        expect(instance.hide('grp_a', 'Not a user')).toBe(false);
        expect(instance.count).toBe(1);
    });

    test('unhides and reports whether anything was removed', async () => {
        const instance = useHiddenFriendsStore();
        await instance.load();
        instance.hide('usr_a', 'Ant');
        instance.hide('usr_b', 'Bee');
        expect(instance.unhide('usr_a')).toBe(true);
        expect(instance.unhide('usr_a')).toBe(false);
        expect(instance.hidden.map((entry) => entry.userId)).toEqual(['usr_b']);
        expect(instance.isHidden('usr_a')).toBe(false);
    });

    test('toggles', async () => {
        const instance = useHiddenFriendsStore();
        await instance.load();
        expect(instance.toggle('usr_a', 'Ant')).toBe(true);
        expect(instance.toggle('usr_a')).toBe(false);
        expect(instance.count).toBe(0);
    });

    test('refreshes a name captured before the roster was loaded', async () => {
        const instance = useHiddenFriendsStore();
        await instance.load();
        instance.hide('usr_a');
        expect(instance.hidden[0].displayName).toBe('');
        instance.rename('usr_a', 'Ant');
        instance.rename('usr_a', '   ');
        instance.rename('usr_z', 'Nobody');
        expect(instance.hidden[0].displayName).toBe('Ant');
    });

    test('clears everything', async () => {
        const instance = useHiddenFriendsStore();
        await instance.load();
        instance.hide('usr_a', 'Ant');
        await instance.clearAll();
        expect(instance.hidden).toEqual([]);
        await vi.waitFor(() => {
            expect(db.raw).toBe('[]');
        });
    });

    test('does not grow past the documented ceiling', async () => {
        const instance = useHiddenFriendsStore();
        await instance.load();
        for (let i = 0; i < HIDDEN_FRIENDS_MAX + 5; i++) {
            instance.hide(`usr_${i}`, `Friend ${i}`);
        }
        expect(instance.count).toBe(HIDDEN_FRIENDS_MAX);
        // The most recent hides are the ones kept.
        expect(instance.hidden[0].userId).toBe(`usr_${HIDDEN_FRIENDS_MAX + 4}`);
    });

    test('isHidden follows the list, so a filter recomputes when someone is unhidden', async () => {
        const instance = useHiddenFriendsStore();
        await instance.load();
        instance.hide('usr_a', 'Ant');
        expect([...instance.hiddenIds]).toEqual(['usr_a']);
        instance.unhide('usr_a');
        expect(instance.hiddenIds.size).toBe(0);
    });
});
