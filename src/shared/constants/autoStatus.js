/**
 * Storage key and shared constants for the automatic status rules.
 *
 * Versioned in the name from the start: the group invite feature had to bump its key
 * once a guard turned out to read stale data, and every person who had the old marker
 * kept it forever. If this one needs a fix that changes what a stored rule means, the
 * key goes to _v2 and the old blob stops being honoured.
 */
export const AUTO_STATUS_STORAGE_KEY = 'VRCX_autoStatusRules_v1';

// What to do once no rule matches any more, and the record of what the status was
// before this feature first changed it.
export const AUTO_STATUS_FALLBACK_MODE_KEY = 'VRCX_autoStatusFallbackMode';
export const AUTO_STATUS_FALLBACK_STATUS_KEY = 'VRCX_autoStatusFallbackStatus';
export const AUTO_STATUS_FALLBACK_DESC_ENABLED_KEY = 'VRCX_autoStatusFallbackDescEnabled';
export const AUTO_STATUS_FALLBACK_DESC_KEY = 'VRCX_autoStatusFallbackDesc';
export const AUTO_STATUS_BASELINE_KEY = 'VRCX_autoStatusBaseline_v1';

// A captured baseline older than this is treated as no record at all. Restoring a
// status from weeks ago - most likely because some path failed to clear it - is worse
// than not restoring anything.
export const AUTO_STATUS_BASELINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const AUTO_STATUS_FALLBACK_MODES = ['restore', 'fixed', 'off'];

// The engine runs on a short tick, so this is the floor between two status writes.
// Two seconds is long enough that a person cannot hammer the endpoint by walking
// between rooms, and short enough that a rule still feels immediate.
export const AUTO_STATUS_MIN_WRITE_GAP_MS = 2000;
