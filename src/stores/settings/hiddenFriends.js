import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import configRepository from '../../services/config';
import { HIDDEN_FRIENDS_STORAGE_KEY } from '../../shared/constants/hiddenFriends';
import {
    hiddenIdSet,
    MAX_HIDDEN_FRIENDS,
    normalizeHiddenFriends,
    parseHiddenFriends
} from '../../shared/utils/hiddenFriends';

/**
 * The friends this person does not want to see.
 *
 * A display filter, not a data filter. Polling, the friend roster and every SQLite
 * write carry on untouched, so un-hiding somebody brings back the whole time they were
 * hidden rather than starting fresh from that moment. That property is the reason the
 * feature is safe to use on a friend you cannot delete, and it is the reason this
 * store has no say over anything the collectors do.
 *
 * Stored as one JSON array under a single config key, like the status rules. Not
 * namespaced per account: a hidden person is the same person whichever of the user's
 * accounts is open, and re-entering the list twice is a worse trade than the rare case
 * where two accounts would want it differently.
 *
 * The name is captured when the entry is made because it has to survive the two ways
 * a roster lookup fails - the friend feed not loaded yet on first paint, and somebody
 * who was deleted after being hidden, whose hidden row is the only place their name
 * still exists.
 */
export const useHiddenFriendsStore = defineStore('HiddenFriends', () => {
    const hidden = ref([]);
    const loaded = ref(false);

    // A Set rather than an array scan: this is consulted once per row on every rebuild
    // of the sidebar, the feed and the notification list.
    const hiddenIds = computed(() => hiddenIdSet(hidden.value));

    const count = computed(() => hidden.value.length);

    async function load() {
        try {
            const stored = await configRepository.getString(HIDDEN_FRIENDS_STORAGE_KEY, null);
            hidden.value = parseHiddenFriends(stored);
        } catch (error) {
            console.error('Failed to load hidden friends', error);
            hidden.value = [];
        } finally {
            loaded.value = true;
        }
    }

    async function save() {
        try {
            await configRepository.setString(HIDDEN_FRIENDS_STORAGE_KEY, JSON.stringify(hidden.value));
        } catch (error) {
            console.error('Failed to save hidden friends', error);
        }
    }

    function ensureLoaded() {
        if (!loaded.value) {
            load();
        }
    }

    /**
     * @param {unknown} userId
     * @returns {boolean}
     */
    function isHidden(userId) {
        return hiddenIds.value.has(String(userId ?? ''));
    }

    /**
     * @param {string} userId
     * @param {string} [displayName]
     * @returns {boolean} True when this call added the entry
     */
    function hide(userId, displayName = '') {
        const entries = normalizeHiddenFriends([{ userId, displayName, at: Date.now() }]);
        const [entry] = entries;
        if (!entry || hiddenIds.value.has(entry.userId)) {
            return false;
        }
        // Newest first, so the settings page reads as "who I hid most recently"
        // without a sort step. The slice is what makes the documented ceiling real on
        // write rather than only on the next read.
        hidden.value = [entry, ...hidden.value].slice(0, MAX_HIDDEN_FRIENDS);
        save();
        return true;
    }

    /**
     * @param {string} userId
     * @returns {boolean} True when an entry was removed
     */
    function unhide(userId) {
        const key = String(userId ?? '');
        const index = hidden.value.findIndex((entry) => entry.userId === key);
        if (index === -1) {
            return false;
        }
        hidden.value = hidden.value.filter((entry) => entry.userId !== key);
        save();
        return true;
    }

    /**
     * @param {string} userId
     * @param {string} [displayName]
     * @returns {boolean} The new state: true is hidden
     */
    function toggle(userId, displayName = '') {
        if (isHidden(userId)) {
            unhide(userId);
            return false;
        }
        hide(userId, displayName);
        return true;
    }

    /**
     * Refresh the stored name, for an entry made before the roster was loaded.
     *
     * @param {string} userId
     * @param {string} displayName
     */
    function rename(userId, displayName) {
        const key = String(userId ?? '');
        const text = String(displayName ?? '').trim();
        const index = hidden.value.findIndex((entry) => entry.userId === key);
        if (index === -1 || !text || hidden.value[index].displayName === text) {
            return;
        }
        hidden.value = hidden.value.map((entry) => (entry.userId === key ? { ...entry, displayName: text } : entry));
        save();
    }

    async function clearAll() {
        if (hidden.value.length === 0) {
            return;
        }
        hidden.value = [];
        await save();
    }

    if (!loaded.value) {
        load();
    }

    return {
        hidden,
        loaded,
        hiddenIds,
        count,
        load,
        save,
        ensureLoaded,
        isHidden,
        hide,
        unhide,
        toggle,
        rename,
        clearAll
    };
});
