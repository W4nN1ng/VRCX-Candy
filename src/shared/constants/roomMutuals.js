/**
 * Storage key and limits for "who in this room do I have mutual friends with".
 *
 * Versioned in the name from the start, for the reason the group invite feature
 * learned: if a stored setting ever turns out to mean something different from what the
 * code now assumes, the old blob has to be stoppable rather than lived with.
 */
export const ROOM_MUTUAL_STORAGE_KEY = 'VRCX_roomMutuals_v1';

// A full public instance is 40 people, and that is also the ceiling on how many
// requests one room visit can cost. Anything past it is listed as "not looked up"
// rather than queried, because a room bigger than that is not somebody you are there
// to read a list of.
export const ROOM_MUTUAL_MAX_PLAYERS = 40;

// Nobody is in the room yet the instant you arrive - players stream in for a few
// seconds, and the game log has to catch up first. Querying immediately would spend
// requests on a roster that is about to change anyway.
export const ROOM_MUTUAL_FIRST_PASS_DELAY_MS = 5000;

// Serialised on purpose. This fires at up to 40 people the moment you enter a room, and
// doing it as 40 parallel calls is how you get the session rate limited for everything
// else VRCX is doing.
export const ROOM_MUTUAL_REQUEST_GAP_MS = 400;

// Matches the 15 minute staleTime of the mutualCounts query, so this cache never asks a
// question the request cache was about to answer for free.
export const ROOM_MUTUAL_CACHE_TTL_MS = 15 * 60 * 1000;

// A player who has hidden their connections is not going to unhide them in the next ten
// minutes, and every room hop would otherwise ask again.
export const ROOM_MUTUAL_DENIED_TTL_MS = 60 * 60 * 1000;

// How many mutual-friend names the page pulls when you open one player.
export const ROOM_MUTUAL_NAMES_PAGE_SIZE = 50;
