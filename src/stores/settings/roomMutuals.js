import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';

import configRepository from '../../services/config';
import { ROOM_MUTUAL_MAX_PLAYERS, ROOM_MUTUAL_STORAGE_KEY } from '../../shared/constants/roomMutuals';
import { buildRoomMutualRows, ROOM_MUTUAL_STATE, summarizeRoomMutuals } from '../../shared/utils/roomMutuals';
import { useFriendStore } from '../friend';
import { useHiddenFriendsStore } from '../settings/hiddenFriends';
import { useLocationStore } from '../location';
import { useUserStore } from '../user';

/**
 * Who in the current room shares friends with you.
 *
 * The roster is not fetched - VRCX already has it, because the game log names everybody
 * who joins and leaves the instance you are standing in. What this store holds is the
 * one thing that does cost a request: the shared-friend count per stranger, and the
 * schedule state for the batch that asks.
 *
 * The count cache is deliberately in memory only. A room fills and empties within
 * minutes, an answer about a stranger is worthless a day later, and the request layer
 * already keeps its own 15 minute copy - persisting a second one would only make stale
 * numbers survive a restart.
 */
export const useRoomMutualsStore = defineStore('RoomMutuals', () => {
    const locationStore = useLocationStore();
    const friendStore = useFriendStore();
    const userStore = useUserStore();
    const hiddenFriendsStore = useHiddenFriendsStore();

    const loaded = ref(false);
    const enabled = ref(true);
    // Off by default: the point of walking into a room is usually not to be told things.
    const notify = ref(false);
    const limit = ref(ROOM_MUTUAL_MAX_PLAYERS);
    // On by default: a 72 person room with five relevant names is not a list worth
    // scrolling, and the point of the page is the five.
    const onlyShared = ref(true);

    // userId -> { friends, groups, at, denied }
    const counts = reactive(new Map());
    // userId -> { list, at, denied }, for the names behind a count once you open one
    const names = reactive(new Map());

    const roomTag = ref('');
    const scanning = ref(false);
    // Bumped every time the room changes. A response that arrives after you have moved
    // on belongs to a roster nobody is looking at, and must not be scheduled or drawn.
    let runId = 0;

    function clampLimit(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return ROOM_MUTUAL_MAX_PLAYERS;
        }
        return Math.min(ROOM_MUTUAL_MAX_PLAYERS, Math.max(1, Math.round(parsed)));
    }

    async function load() {
        try {
            const stored = await configRepository.getString(ROOM_MUTUAL_STORAGE_KEY, null);
            const parsed = stored ? JSON.parse(stored) : null;
            if (parsed && typeof parsed === 'object') {
                enabled.value = parsed.enabled !== false;
                notify.value = parsed.notify === true;
                onlyShared.value = parsed.onlyShared !== false;
                limit.value = clampLimit(parsed.limit);
            }
        } catch (error) {
            console.error('Failed to load room mutual friends settings', error);
        } finally {
            loaded.value = true;
        }
    }

    async function save() {
        try {
            await configRepository.setString(
                ROOM_MUTUAL_STORAGE_KEY,
                JSON.stringify({
                    enabled: enabled.value,
                    notify: notify.value,
                    limit: limit.value,
                    onlyShared: onlyShared.value
                })
            );
        } catch (error) {
            console.error('Failed to save room mutual friends settings', error);
        }
    }

    function ensureLoaded() {
        if (!loaded.value) {
            load();
        }
    }

    async function setEnabled(on) {
        enabled.value = on === true;
        if (!enabled.value) {
            clearCache();
        }
        await save();
    }

    async function setNotify(on) {
        notify.value = on === true;
        await save();
    }

    async function setOnlyShared(on) {
        onlyShared.value = on !== false;
        await save();
    }

    async function setLimit(value) {
        limit.value = clampLimit(value);
        await save();
    }

    /**
     * Start a fresh scan. The id it hands back is what the caller has to present before
     * writing anything, so a slow response from the room you were in a minute ago cannot
     * land in this one.
     *
     * @param {string} tag
     * @returns {number}
     */
    function beginRun(tag) {
        roomTag.value = String(tag || '');
        runId += 1;
        return runId;
    }

    /**
     * @param {number} id
     * @returns {boolean}
     */
    function isRunCurrent(id) {
        return id === runId;
    }

    /**
     * @param {string} userId
     * @param {{ friends?: number; groups?: number }} result - What the endpoint answered
     */
    function noteCount(userId, result) {
        const key = String(userId || '');
        if (!key) {
            return;
        }
        const friends = Number(result?.friends);
        const groups = Number(result?.groups);
        counts.set(key, {
            friends: Number.isFinite(friends) && friends > 0 ? friends : 0,
            groups: Number.isFinite(groups) && groups > 0 ? groups : 0,
            at: Date.now(),
            denied: false
        });
    }

    /**
     * A refusal is recorded rather than retried, because the answer for that player is
     * not going to change during this session.
     *
     * @param {string} userId
     */
    function noteDenied(userId) {
        const key = String(userId || '');
        if (!key) {
            return;
        }
        counts.set(key, { friends: null, groups: null, at: Date.now(), denied: true });
    }

    /**
     * @param {string} userId
     * @param {{ userId: string; displayName: string }[]} list
     */
    function noteNames(userId, list) {
        const key = String(userId || '');
        if (!key) {
            return;
        }
        names.set(key, { list: list || [], at: Date.now(), denied: false });
    }

    /**
     * @param {string} userId
     * @returns {{ list: object[]; at: number; denied: boolean } | null}
     */
    function namesFor(userId) {
        return names.get(String(userId || '')) || null;
    }

    function clearCache() {
        counts.clear();
        names.clear();
    }

    /**
     * The list both this page and the player list column read, so one room costs one set
     * of requests rather than two.
     */
    const rows = computed(() =>
        buildRoomMutualRows({
            players: [...locationStore.lastLocation.playerList.values()],
            selfId: String(userStore.currentUser?.id || ''),
            friendIds: new Set(friendStore.friends.keys()),
            hiddenIds: hiddenFriendsStore.hiddenIds,
            cache: counts,
            limit: limit.value
        })
    );

    const summary = computed(() => summarizeRoomMutuals(rows.value));

    /**
     * @param {string} userId
     * @returns {object | null} The row for one player, when they are in the room
     */
    function rowFor(userId) {
        const key = String(userId || '');
        return rows.value.find((row) => row.userId === key) || null;
    }

    /**
     * The one number the player list column is allowed to show.
     *
     * Null means "nothing to print" - a friend, somebody not looked up, somebody who
     * hides their connections, or somebody who simply is not in the room. Printing 0 for
     * those would claim a thing we do not know.
     *
     * @param {string} userId
     * @returns {number | null}
     */
    function countFor(userId) {
        const row = rowFor(userId);
        return row && row.state === ROOM_MUTUAL_STATE.Mutual ? row.mutualCount : null;
    }

    if (!loaded.value) {
        load();
    }

    return {
        loaded,
        enabled,
        notify,
        limit,
        onlyShared,
        counts,
        names,
        roomTag,
        scanning,
        rows,
        summary,
        load,
        save,
        ensureLoaded,
        setEnabled,
        setNotify,
        setOnlyShared,
        setLimit,
        beginRun,
        isRunCurrent,
        noteCount,
        noteDenied,
        noteNames,
        namesFor,
        rowFor,
        countFor,
        clearCache
    };
});
