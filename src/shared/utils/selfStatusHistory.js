/**
 * Deciding whether VRCX has just learned something new about the user's *own* status
 * light, and shaping the row that records it.
 *
 * Why this exists: feed_status is written from the activity feed, and the feed never
 * contains the logged-in player - measured on a real database, 3 self rows against 1108
 * rows for friends, and those 3 were a single day. So the light you are wearing yourself
 * had no history at all, and the status light page had nothing of yours to show even
 * though it is the one person whose light you can always see.
 *
 * The fix is to record it at the two places where VRCX genuinely learns its own status -
 * a PUT it made through `applyCurrentUser`, and a user object that came back containing
 * itself through `applyUser`. This function is the whole decision, kept free of stores
 * and SQL so "is this a change?" can be argued about with tests rather than by reading
 * the coordinator.
 *
 * It refuses two things, and both matter:
 *
 * - The first fill after login, where there is no previous value to have changed from;
 * - A redelivery of a status already recorded, which is what happens when a refetch arrives after the PUT that already
 *   wrote the row.
 */

/**
 * @param {object} input
 * @param {string} input.userId - The logged-in user, always
 * @param {string} [input.displayName]
 * @param {{ status?: string; statusDescription?: string } | null} [input.before] - What VRCX believed just before
 * @param {{ status?: string; statusDescription?: string } | null} [input.after] - What it just learned
 * @param {string} input.at - ISO timestamp for the row
 * @returns {object | null} A feed_status row, or null when nothing changed
 */
function selfStatusChangeRow({ userId, displayName = '', before = null, after = null, at }) {
    const id = String(userId ?? '');
    if (!id || !after || typeof after !== 'object') {
        return null;
    }
    const status = String(after.status ?? '').trim();
    const description = String(after.statusDescription ?? '');
    if (!status) {
        return null;
    }
    const previousStatus = String(before?.status ?? '').trim();
    const previousDescription = String(before?.statusDescription ?? '');
    if (!previousStatus) {
        return null;
    }
    if (previousStatus === status && previousDescription === description) {
        return null;
    }
    return {
        created_at: at,
        type: 'Status',
        userId: id,
        displayName: String(displayName ?? '').trim(),
        status,
        statusDescription: description,
        previousStatus,
        previousStatusDescription: previousDescription
    };
}

/**
 * Turn the user's own recorded online sessions into the presence rows the status light
 * timeline needs.
 *
 * Feed_online_offline holds no rows for the logged-in player either, so without this the
 * timeline would treat every stretch of your own history as online - which is exactly
 * the bug that made friends look like they had worn a red light for two days straight.
 * activity_sessions_v2 already knows when this account was in VRChat, so it is the
 * witness for yourself that the feed is not.
 *
 * A session with an open tail has not been seen ending, so no Offline row is invented
 * for it; the timeline's own trailing-stretch cap handles that case.
 *
 * @param {{ start: number; end: number; isOpenTail?: boolean }[]} sessions
 * @param {number | string} [createdAfter] - Epoch ms or ISO string to cut at, empty for everything
 * @returns {{ created_at: string; type: string }[]} Ascending, same shape as the feed rows
 */
function selfPresenceRowsFromSessions(sessions, createdAfter = '') {
    const rows = [];
    const raw = createdAfter;
    const cutoff = Number.isFinite(Number(raw)) && String(raw).trim() !== '' ? Number(raw) : Date.parse(raw) || 0;
    for (const session of sessions || []) {
        const start = Number(session?.start);
        if (!Number.isFinite(start)) {
            continue;
        }
        const end = Number(session?.end);
        const closed = session?.isOpenTail !== true && Number.isFinite(end) && end > start;
        // A session that is still running is never cut: it is the one that says what
        // state the user is in right now, however long ago it began.
        if (closed && end < cutoff) {
            continue;
        }
        rows.push({ created_at: new Date(start).toJSON(), type: 'Online' });
        if (closed) {
            rows.push({ created_at: new Date(end).toJSON(), type: 'Offline' });
        }
    }
    rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    return rows;
}

export { selfPresenceRowsFromSessions, selfStatusChangeRow };
