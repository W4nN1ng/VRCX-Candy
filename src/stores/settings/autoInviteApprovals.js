import { defineStore } from 'pinia';
import { ref } from 'vue';

import configRepository from '../../services/config';
import {
    AUTO_INVITE_COUNTER_KEY,
    AUTO_INVITE_LOG_MAX,
    AUTO_INVITE_STORAGE_KEY
} from '../../shared/constants/autoInvite';
import { normalizeAutoInviteRule, normalizeAutoInviteState } from '../../shared/utils/autoInviteRules';

/**
 * Who may be let in automatically, and under what limits.
 *
 * One JSON blob under a single config key, like the status rules: this holds a
 * handful of rows and a host-side table for it would be more machinery than data.
 *
 * The daily counter is stored separately and carries the local date it belongs to, so
 * restarting VRCX at 4am cannot hand the feature back its whole allowance.
 */
export const useAutoInviteApprovalsStore = defineStore('AutoInviteApprovals', () => {
    const settings = ref(normalizeAutoInviteState(null).settings);
    const rules = ref([]);
    const loaded = ref(false);

    // Decisions this session, newest first. Deliberately not persisted: it is a "what
    // just happened while I was asleep" list, and an old one is misleading rather than
    // useful.
    const log = ref([]);

    // Notification ids already acted on, so a notification that arrives twice - which
    // the feed does - cannot invite twice.
    const handled = new Set();

    // userId -> epoch ms of the last time this feature invited them.
    const lastAcceptAt = new Map();

    const todayCount = ref(0);
    let todayKey = '';

    /**
     * @returns {string} The local date the counter belongs to
     */
    function currentDayKey() {
        return new Date().toLocaleDateString('sv');
    }

    /**
     * @param {unknown} raw
     * @returns {{ day: string; count: number } | null}
     */
    function readCounter(raw) {
        if (!raw) {
            return null;
        }
        try {
            const parsed = JSON.parse(raw);
            const count = Number(parsed?.count);
            if (!parsed?.day || !Number.isFinite(count) || count < 0) {
                return null;
            }
            return { day: String(parsed.day), count: Math.round(count) };
        } catch {
            return null;
        }
    }

    async function load() {
        try {
            const stored = await configRepository.getString(AUTO_INVITE_STORAGE_KEY, null);
            const state = normalizeAutoInviteState(stored ? JSON.parse(stored) : null);
            settings.value = state.settings;
            rules.value = state.rules;
        } catch (error) {
            console.error('Failed to load auto invite approvals', error);
            settings.value = normalizeAutoInviteState(null).settings;
            rules.value = [];
        }
        try {
            const saved = readCounter(await configRepository.getString(AUTO_INVITE_COUNTER_KEY, null));
            todayKey = currentDayKey();
            // Yesterday's number is not today's number, whatever was stored.
            todayCount.value = saved && saved.day === todayKey ? saved.count : 0;
        } catch (error) {
            console.error('Failed to load auto invite counter', error);
            todayCount.value = 0;
        } finally {
            loaded.value = true;
        }
    }

    async function save() {
        try {
            await configRepository.setString(
                AUTO_INVITE_STORAGE_KEY,
                JSON.stringify({ settings: settings.value, rules: rules.value })
            );
        } catch (error) {
            console.error('Failed to save auto invite approvals', error);
        }
    }

    async function saveCounter() {
        try {
            await configRepository.setString(
                AUTO_INVITE_COUNTER_KEY,
                JSON.stringify({ day: todayKey || currentDayKey(), count: todayCount.value })
            );
        } catch (error) {
            console.error('Failed to save auto invite counter', error);
        }
    }

    function ensureLoaded() {
        if (!loaded.value) {
            load();
        }
    }

    /**
     * @param {boolean} on
     */
    async function setEnabled(on) {
        settings.value = { ...settings.value, enabled: on === true };
        await save();
    }

    async function setAskMeOnly(on) {
        settings.value = { ...settings.value, askMeOnly: on === true };
        await save();
    }

    async function setNotify(on) {
        settings.value = { ...settings.value, notify: on !== false };
        await save();
    }

    async function setDailyLimit(value) {
        const parsed = Number(value);
        settings.value = {
            ...settings.value,
            dailyLimit: Number.isFinite(parsed) ? parsed : settings.value.dailyLimit
        };
        await save();
    }

    /**
     * @param {{ enabled: boolean; fromMinute: number; toMinute: number }} next
     */
    async function setWindow(next) {
        settings.value = { ...settings.value, window: { ...settings.value.window, ...(next || {}) } };
        await save();
    }

    /**
     * @param {object} input
     * @returns {object | null} The stored rule, or null when the input was unusable
     */
    function addRule(input) {
        const rule = normalizeAutoInviteRule(input, rules.value.length);
        if (!rule || rules.value.some((entry) => entry.userId === rule.userId)) {
            return null;
        }
        rules.value.push(rule);
        save();
        return rule;
    }

    function updateRule(id, patch) {
        const index = rules.value.findIndex((rule) => rule.id === id);
        if (index === -1) {
            return;
        }
        const next = normalizeAutoInviteRule({ ...rules.value[index], ...patch }, index);
        if (next) {
            rules.value[index] = next;
            save();
        }
    }

    function removeRule(id) {
        const index = rules.value.findIndex((rule) => rule.id === id);
        if (index !== -1) {
            rules.value.splice(index, 1);
            save();
        }
    }

    /**
     * Has this notification already been acted on? Claiming it is what makes the check
     * and the act safe against a notification arriving twice in a row.
     *
     * @param {string} id
     * @returns {boolean} True when this caller got the claim
     */
    function claimNotification(id) {
        const key = String(id || '');
        if (!key || handled.has(key)) {
            return false;
        }
        handled.add(key);
        return true;
    }

    /**
     * @param {string} userId
     * @returns {number} Epoch ms of the last accept for this friend, 0 for never
     */
    function lastAcceptFor(userId) {
        return lastAcceptAt.get(String(userId)) || 0;
    }

    /**
     * Record that an invite actually went out.
     *
     * @param {string} userId
     */
    function noteAccept(userId) {
        const key = String(userId);
        lastAcceptAt.set(key, Date.now());
        if (todayKey !== currentDayKey()) {
            todayKey = currentDayKey();
            todayCount.value = 0;
        }
        todayCount.value += 1;
        saveCounter();
    }

    /**
     * @param {{ action: string; reason: string; userId?: string; name?: string; worldName?: string }} entry
     */
    function pushLog(entry) {
        log.value.unshift({ ...entry, at: Date.now() });
        if (log.value.length > AUTO_INVITE_LOG_MAX) {
            log.value.length = AUTO_INVITE_LOG_MAX;
        }
    }

    async function resetCounter() {
        todayCount.value = 0;
        todayKey = currentDayKey();
        await saveCounter();
    }

    if (!loaded.value) {
        load();
    }

    return {
        settings,
        rules,
        loaded,
        log,
        todayCount,
        load,
        save,
        ensureLoaded,
        setEnabled,
        setAskMeOnly,
        setNotify,
        setDailyLimit,
        setWindow,
        addRule,
        updateRule,
        removeRule,
        claimNotification,
        lastAcceptFor,
        noteAccept,
        pushLog,
        resetCounter
    };
});
