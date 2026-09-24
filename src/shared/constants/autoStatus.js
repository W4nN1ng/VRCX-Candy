/**
 * Storage key and shared constants for the automatic status rules.
 *
 * Versioned in the name from the start: the group invite feature had to bump its key
 * once a guard turned out to read stale data, and every person who had the old marker
 * kept it forever. If this one needs a fix that changes what a stored rule means, the
 * key goes to _v2 and the old blob stops being honoured.
 */
export const AUTO_STATUS_STORAGE_KEY = 'VRCX_autoStatusRules_v1';

// The engine runs on a short tick, so this is the floor between two status writes.
// Two seconds is long enough that a person cannot hammer the endpoint by walking
// between rooms, and short enough that a rule still feels immediate.
export const AUTO_STATUS_MIN_WRITE_GAP_MS = 2000;
