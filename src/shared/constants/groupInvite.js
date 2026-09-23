/**
 * The group this build offers to new users, once, right after they log in.
 *
 * Replace the id with your own group's `grp_...` id, which you can read off the
 * group page in VRCX under the raw JSON tab, or from the address bar on the
 * website at vrchat.com/home/group/<id>.
 *
 * Leaving it empty switches the whole thing off, and that is the deliberate
 * default: a build with no group configured should not ask anybody anything.
 * Someone who is already in the group is never asked, which is also what keeps
 * the prompt from appearing to whoever builds and runs this fork themselves.
 */
export const GROUP_INVITE_GROUP_ID = 'grp_3d453804-fcd8-4187-9c36-1dc2a1d5b2ce';

/**
 * Config key recording that the prompt has been shown.
 *
 * Written on every path - joined, declined, or the request failed - and never
 * cleared, which is what makes the prompt appear at most once ever. It is not
 * scoped to a user id, because the point is that this installation has already
 * asked; signing into a second account should not bring it back.
 */
export const GROUP_INVITE_SEEN_KEY = 'VRCX_group_invite_seen';

// How long to wait for the group list before giving up. The list is fetched after
// login, and deciding before it arrives would mistake a member for a stranger.
export const GROUP_INVITE_GROUP_WAIT_MS = 15000;
