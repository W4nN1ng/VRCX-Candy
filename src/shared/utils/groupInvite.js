/**
 * Whether this build should ask the signed in user to join the group behind it.
 *
 * The prompt is only ever right for a stranger to the group, so the decision is made
 * from the membership status the API reports for that one group, read live. The group
 * list held in the store cannot be used for this. It is seeded from a config row the
 * previous session wrote and is only replaced once the new list arrives, so somebody
 * who left the group in between is still listed as a member - and mistaking a
 * stranger for a member is the one failure that must not happen, because that is what
 * makes the prompt silently never appear.
 *
 * Keeping the rule here rather than in the dialog is what makes it testable without a
 * logged in account.
 */

/**
 * Membership states where there is nothing left to offer.
 *
 * `member` speaks for itself. `requested` and `invited` mean the user has already
 * dealt with the group and is waiting on the other side of it. `userblocked` means
 * they blocked it, and asking again would be rude.
 */
export const GROUP_INVITE_SETTLED_STATES = ['member', 'requested', 'invited', 'userblocked'];

/** Ask, because the user is a stranger to the group. */
export const GROUP_INVITE_ASK = 'ask';

/** Stay quiet, because this installation has already had its one prompt. */
export const GROUP_INVITE_ALREADY_SEEN = 'already-seen';

/** Stay quiet, because the user is already involved with the group. */
export const GROUP_INVITE_ALREADY_SETTLED = 'already-settled';

/**
 * @param {{ seen?: boolean; membershipStatus?: string }} [input]
 * @returns {string} One of the three GROUP_INVITE_* decisions
 */
export function decideGroupInvite({ seen = false, membershipStatus } = {}) {
    if (seen) {
        return GROUP_INVITE_ALREADY_SEEN;
    }
    const status = String(membershipStatus ?? '')
        .trim()
        .toLowerCase();
    if (GROUP_INVITE_SETTLED_STATES.includes(status)) {
        return GROUP_INVITE_ALREADY_SETTLED;
    }
    // Anything else - 'none', a missing field, a value from a newer API - is read as
    // "not a member", which is the direction that keeps the prompt alive.
    return GROUP_INVITE_ASK;
}
