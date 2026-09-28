import { toast } from 'vue-sonner';
import { i18n } from '../plugins/i18n';

import { parseLocation } from '../shared/utils';
import { decideAutoInvite } from '../shared/utils/autoInviteRules';
import { notificationRequest, queryRequest } from '../api';
import { useAutoInviteApprovalsStore } from '../stores/settings/autoInviteApprovals';
import { useFriendStore } from '../stores/friend';
import { useLocationStore } from '../stores/location';
import { useUserStore } from '../stores/user';

/**
 * Lets a pre-approved friend into your own room without you clicking anything.
 *
 * The scenario it exists for: you go to sleep in a VRChat sleep world with the yellow
 * light on, a friend agreed to join you there, and yellow means they cannot get in
 * until you personally accept - which you are not doing, being asleep.
 *
 * Everything that decides *whether* to act lives in the pure engine
 * (shared/utils/autoInviteRules.js) so the whole policy can be read and tested at
 * once. This file only gathers the facts, performs the two API calls the manual
 * "accept" button performs, and records what happened.
 *
 * It is called from the notification store the moment a notification arrives, rather
 * than on a timer, so a request is answered in the second it is made.
 */

/**
 * Where I am standing, in the same order the manual accept button resolves it.
 *
 * @param {object} locationStore
 * @param {object} userStore
 * @returns {string}
 */
function resolveCurrentLocation(locationStore, userStore) {
    let currentLocation = locationStore.lastLocation.location;
    if (currentLocation === 'traveling') {
        currentLocation = locationStore.lastLocationDestination;
    }
    if (!currentLocation) {
        currentLocation = userStore.currentUser?.$locationTag;
    }
    return String(currentLocation || '');
}

/**
 * @param {{ id?: string; type?: string; senderUserId?: string; senderDisplayName?: string; expired?: boolean }} notification
 * @returns {Promise<'none' | 'skipped' | 'accepted' | 'failed'>} Resolves once the decision
 *   has been acted on. The caller hides the notification when this says 'accepted'.
 */
export async function maybeAutoAcceptRequestInvite(notification) {
    const store = useAutoInviteApprovalsStore();
    if (!store.loaded) {
        // Before the settings have come back from storage we cannot know whether this
        // is allowed, and guessing wrong in either direction is bad: accepting would
        // open a room the owner never opted into, declining would silently eat a
        // request that arrived in the first second after login. Leaving it alone is
        // the one safe answer, and the manual button still works.
        return 'skipped';
    }

    const userStore = useUserStore();
    const locationStore = useLocationStore();
    const friendStore = useFriendStore();

    const locationTag = resolveCurrentLocation(locationStore, userStore);
    const decision = decideAutoInvite({
        notification,
        settings: store.settings,
        rules: store.rules,
        context: {
            currentUserId: userStore.currentUser?.id,
            locationTag,
            status: userStore.currentUser?.status,
            todayCount: store.todayCount,
            lastAcceptAt: store.lastAcceptFor(notification?.senderUserId)
        }
    });

    if (decision.action === 'none') {
        return 'none';
    }

    const senderId = String(notification?.senderUserId || '');
    const friend = friendStore.friends.get(senderId);
    const name = friend?.ref?.displayName || notification?.senderDisplayName || friend?.name || senderId;

    if (decision.action === 'skip') {
        // Only a near miss is worth showing: somebody who is on the list, while the
        // feature is switched on. Otherwise the log would be nothing but 'disabled'
        // rows for every notification that ever arrived.
        if (store.settings.enabled && decision.reason !== 'not-listed' && decision.reason !== 'not-request') {
            store.pushLog({ action: 'skip', reason: decision.reason, userId: senderId, name });
        }
        return 'skipped';
    }

    if (!store.claimNotification(notification.id)) {
        return 'skipped';
    }

    const parsed = parseLocation(locationTag);
    try {
        const world = await queryRequest.fetch('world', { worldId: parsed.worldId });
        await notificationRequest.sendInvite(
            {
                instanceId: parsed.tag,
                worldId: parsed.tag,
                worldName: world?.ref?.name || parsed.worldId,
                rsvp: true
            },
            senderId
        );
        await notificationRequest.hideNotification({ notificationId: notification.id });
        store.noteAccept(senderId);
        store.pushLog({
            action: 'accept',
            reason: 'accepted',
            userId: senderId,
            name,
            worldName: world?.ref?.name || ''
        });
        if (store.settings.notify) {
            toast.info(i18n.global.t('view.candy.auto_invites.accepted', { name }));
        }
        return 'accepted';
    } catch (error) {
        console.error('Failed to auto accept an invite request', error);
        store.pushLog({ action: 'fail', reason: 'failed', userId: senderId, name });
        return 'failed';
    }
}
