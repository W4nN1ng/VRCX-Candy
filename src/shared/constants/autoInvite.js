/**
 * Storage keys and limits for "let these friends into my room without asking me".
 *
 * Versioned in the name from the start, for the reason the group invite feature
 * learned: a guard that turns out to read stale data has to be able to stop honouring
 * the old blob rather than live with it.
 */
export const AUTO_INVITE_STORAGE_KEY = 'VRCX_autoInviteApprovals_v1';

export const AUTO_INVITE_COUNTER_KEY = 'VRCX_autoInviteDayCount_v1';

// The point of the whole feature is being asleep, so it has to keep working unattended
// - which makes a ceiling on how many people it can let in per day non-negotiable.
export const AUTO_INVITE_DEFAULT_DAILY_LIMIT = 10;
export const AUTO_INVITE_MAX_DAILY_LIMIT = 50;

// Two requests from the same friend this close apart are one person knocking twice
// because the first invite had not landed yet.
export const AUTO_INVITE_FRIEND_COOLDOWN_MS = 30 * 1000;

// How many past decisions the page keeps showing, newest first.
export const AUTO_INVITE_LOG_MAX = 50;

export const AUTO_INVITE_REASONS = [
    'accepted',
    'disabled',
    'not-request',
    'not-listed',
    'not-own-instance',
    'outside-window',
    'daily-limit',
    'status-gate',
    'cooldown',
    'already-handled',
    'failed'
];
