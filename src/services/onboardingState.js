import { ref } from 'vue';

/**
 * Coordination for the two one-shot dialogs a fresh install can show.
 *
 * The group invite gets the screen first, and the help screen waits for it to finish
 * rather than stacking on top of it or racing it to open. `settled` is set on every
 * path the invite can take - shown and dismissed, or decided against - so the help
 * screen never waits forever on an install where the invite is switched off.
 */

/** False once the group invite has either been answered or decided not to appear. */
export const groupInviteSettled = ref(false);

/** True while the help screen is on display. */
export const helpDialogOpen = ref(false);

export function openHelpDialog() {
    helpDialogOpen.value = true;
}

export function closeHelpDialog() {
    helpDialogOpen.value = false;
}
