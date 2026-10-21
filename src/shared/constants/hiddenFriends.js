/**
 * Storage key and limits for the hidden friend list.
 *
 * Versioned in the name from the start, for the reason the group invite feature
 * learned: if a stored entry ever turns out to mean something different from what the
 * code now assumes, the old blob has to be stoppable rather than lived with.
 */
export const HIDDEN_FRIENDS_STORAGE_KEY = 'VRCX_hiddenFriends_v1';

/**
 * How many people can be hidden at once.
 *
 * High enough that nobody runs into it by accident, finite because the list is read
 * into a Set on every re-render of the friend sidebar, and an unbounded blob in the
 * config table is how the wallpaper feature ended up storing a megabyte.
 */
export const HIDDEN_FRIENDS_MAX = 500;
