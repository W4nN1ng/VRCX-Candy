import * as workerTimers from 'worker-timers';
import { watch } from 'vue';

import { queryRequest, userRequest } from '../api';
import { ROOM_MUTUAL_FIRST_PASS_DELAY_MS, ROOM_MUTUAL_REQUEST_GAP_MS } from '../shared/constants/roomMutuals';
import { mutualNamesFromJson, planRoomMutualFetch } from '../shared/utils/roomMutuals';
import { useLocationStore } from '../stores/location';
import { useRoomMutualsStore } from '../stores/settings/roomMutuals';
import { useUserStore } from '../stores/user';
import { AppDebug } from '../services/appConfig';
import { i18n } from '../plugins/i18n';
import { toast } from 'vue-sonner';

/**
 * Looking up who in the current room shares friends with you.
 *
 * The roster is free - the game log already names everybody who joins and leaves the
 * instance - so this file only has to spend requests well. Three rules shape it:
 *
 * - Nothing happens the instant you arrive. Players stream in for several seconds and the log has to catch up first, so
 *   the first pass is delayed and later passes are quick.
 * - One request at a time with a gap between them. A full public room is 40 people, and firing 40 calls at once is how
 *   you get the whole session rate limited.
 * - Every await is followed by a run check. Walking into another room mid-batch has to drop the rest of it, and answers
 *   about the room you left must not be drawn here.
 */

// How long to wait before re-looking at the roster after it changes. The first pass after
// entering a room waits longer than a follow-up for somebody who walked in later.
const FOLLOW_UP_DELAY_MS = 2000;

// A safety net, not a policy: if a plan never empties - an answer that does not clear the
// pending state, say - this stops the loop from asking forever.
const MAX_ROUNDS = 4;

let scheduled = null;
let seen = false;
let notifiedRoom = '';

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
    return new Promise((resolve) => workerTimers.setTimeout(resolve, ms));
}

/**
 * Ask about every stranger in the room that does not have a fresh answer yet.
 *
 * @returns {Promise<void>}
 */
export async function scanRoomForMutuals() {
    const store = useRoomMutualsStore();
    const locationStore = useLocationStore();
    const userStore = useUserStore();

    store.ensureLoaded();
    if (!store.enabled) {
        return;
    }
    // With sharing turned off in VRChat's own settings the endpoint has nothing to say
    // about anybody, and asking would only produce 40 refusals to draw as "unknown".
    if (userStore.currentUser?.hasSharedConnectionsOptOut) {
        return;
    }

    const tag = String(locationStore.lastLocation.location || '');
    const runId = store.beginRun(tag);
    store.scanning = true;
    try {
        for (let round = 0; round < MAX_ROUNDS; round += 1) {
            const ids = planRoomMutualFetch(store.rows);
            if (!ids.length) {
                break;
            }
            for (const userId of ids) {
                if (!store.isRunCurrent(runId)) {
                    return;
                }
                try {
                    const args = await queryRequest.fetch('mutualCounts', { userId });
                    if (!store.isRunCurrent(runId)) {
                        return;
                    }
                    store.noteCount(userId, args?.json);
                } catch (error) {
                    // A refusal is the normal case here: that player hides their
                    // connections. Logging one line per stranger would bury the log, so
                    // it sits behind the same switch the rest of the request tracing uses.
                    if (store.isRunCurrent(runId)) {
                        store.noteDenied(userId);
                    }
                    if (AppDebug.debugWebRequests) {
                        console.error('Shared friends lookup failed', userId, error);
                    }
                }
                if (ROOM_MUTUAL_REQUEST_GAP_MS > 0) {
                    await wait(ROOM_MUTUAL_REQUEST_GAP_MS);
                }
            }
        }
    } finally {
        if (store.isRunCurrent(runId)) {
            store.scanning = false;
            maybeAnnounce(store, tag);
        }
    }
}

/**
 * Queue a pass. Repeated roster changes inside the window collapse into one scan.
 *
 * @param {{ first?: boolean }} [options]
 */
export function scheduleRoomMutualScan(options = {}) {
    if (scheduled) {
        return;
    }
    const delay = !seen || options.first ? ROOM_MUTUAL_FIRST_PASS_DELAY_MS : FOLLOW_UP_DELAY_MS;
    seen = true;
    scheduled = workerTimers.setTimeout(() => {
        scheduled = null;
        scanRoomForMutuals().catch((error) => {
            console.error('Failed to scan the room for shared friends', error);
        });
    }, delay);
}

/**
 * The names behind one player's count, asked only when somebody opens that row.
 *
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function loadRoomMutualNames(userId) {
    const store = useRoomMutualsStore();
    const cached = store.namesFor(userId);
    if (cached && !cached.denied) {
        return cached.list || [];
    }
    try {
        const args = await userRequest.getMutualFriends({ userId });
        const list = mutualNamesFromJson(args?.json);
        store.noteNames(userId, list);
        return list;
    } catch (error) {
        console.error('Failed to load shared friends', error);
        return [];
    }
}

/**
 * One line per room, when the switch is on. Announcing on every roster change would be
 * worse than no announcement at all.
 *
 * @param {object} store
 * @param {string} tag
 */
function maybeAnnounce(store, tag) {
    if (!store.notify || !tag || notifiedRoom === tag) {
        return;
    }
    const withMutuals = store.summary?.withMutuals || 0;
    if (withMutuals <= 0) {
        return;
    }
    notifiedRoom = tag;
    toast.info(i18n.global.t('view.candy.room_mutuals.announce', { count: withMutuals }));
}

/**
 * Watch the room and the roster. Called once at start-up so the numbers are ready by the
 * time the page is opened - the point of the feature is walking in and already knowing.
 */
export function initRoomMutualScan() {
    const store = useRoomMutualsStore();
    const locationStore = useLocationStore();

    // A new room is a new question: drop the previous answers so the list cannot show a
    // count for somebody who is standing in the room you just left.
    watch(
        () => locationStore.lastLocation.location,
        (tag, previous) => {
            if (tag === previous) {
                return;
            }
            store.clearCache();
            seen = false;
            scheduleRoomMutualScan({ first: true });
        }
    );

    watch(
        () => locationStore.lastLocation.playerList.size,
        (size, previous) => {
            if (!size && !previous) {
                return;
            }
            scheduleRoomMutualScan();
        }
    );

    watch(
        () => store.enabled,
        (on) => {
            if (on) {
                seen = false;
                scheduleRoomMutualScan({ first: true });
            }
        }
    );
}
