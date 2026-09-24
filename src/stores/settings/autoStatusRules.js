import { defineStore } from 'pinia';
import { ref } from 'vue';

import configRepository from '../../services/config';
import {
    AUTO_STATUS_BASELINE_KEY,
    AUTO_STATUS_BASELINE_MAX_AGE_MS,
    AUTO_STATUS_FALLBACK_DESC_ENABLED_KEY,
    AUTO_STATUS_FALLBACK_DESC_KEY,
    AUTO_STATUS_FALLBACK_MODE_KEY,
    AUTO_STATUS_FALLBACK_MODES,
    AUTO_STATUS_FALLBACK_STATUS_KEY,
    AUTO_STATUS_STORAGE_KEY
} from '../../shared/constants/autoStatus';
import { isKnownStatus, normalizeAutoStatusRule, parseAutoStatusRules } from '../../shared/utils/autoStatusRules';

/**
 * The user's automatic status rules.
 *
 * Stored as one JSON blob under a single config key, the same way the dashboard
 * layouts are kept: the alternative (a table per rule) would need a host-side
 * migration for a feature that holds a handful of rows.
 *
 * Deliberately not namespaced per account. A rule says "when I am with this person"
 * and that is meant to hold whichever of the user's accounts happens to be open;
 * splitting it per account would mean re-entering the same rules twice.
 */
export const useAutoStatusRulesStore = defineStore('AutoStatusRules', () => {
    const rules = ref([]);
    const loaded = ref(false);

    // What to settle to once nothing matches. 'restore' is the default because it only
    // ever undoes what this feature itself did; 'fixed' is for people who want the
    // light pinned regardless of what they choose by hand.
    const fallbackMode = ref('restore');
    const fallbackStatus = ref('join me');
    const fallbackDescriptionEnabled = ref(false);
    const fallbackDescription = ref('');
    // The status as it was before this feature first changed it, or null. Kept in
    // config rather than memory so a restart mid-room still knows what to put back.
    const baseline = ref(null);

    function readBaseline(raw) {
        if (!raw) {
            return null;
        }
        try {
            const parsed = JSON.parse(raw);
            const status = parsed?.status;
            if (!isKnownStatus(status)) {
                return null;
            }
            if (!Number.isFinite(parsed?.at) || Date.now() - parsed.at > AUTO_STATUS_BASELINE_MAX_AGE_MS) {
                return null;
            }
            return { status, description: typeof parsed.description === 'string' ? parsed.description : null };
        } catch {
            return null;
        }
    }

    async function load() {
        try {
            const stored = await configRepository.getString(AUTO_STATUS_STORAGE_KEY, null);
            rules.value = parseAutoStatusRules(stored);
        } catch {
            rules.value = [];
        }
        try {
            const mode = await configRepository.getString(AUTO_STATUS_FALLBACK_MODE_KEY, 'restore');
            fallbackMode.value = AUTO_STATUS_FALLBACK_MODES.includes(mode) ? mode : 'restore';
            const status = await configRepository.getString(AUTO_STATUS_FALLBACK_STATUS_KEY, 'join me');
            fallbackStatus.value = isKnownStatus(status) ? status : 'join me';
            fallbackDescriptionEnabled.value = await configRepository.getBool(
                AUTO_STATUS_FALLBACK_DESC_ENABLED_KEY,
                false
            );
            fallbackDescription.value = await configRepository.getString(AUTO_STATUS_FALLBACK_DESC_KEY, '');
            baseline.value = readBaseline(await configRepository.getString(AUTO_STATUS_BASELINE_KEY, null));
        } catch (error) {
            console.error('Failed to load auto status fallback settings', error);
        } finally {
            loaded.value = true;
        }
    }

    async function setFallbackMode(mode) {
        fallbackMode.value = AUTO_STATUS_FALLBACK_MODES.includes(mode) ? mode : 'restore';
        await configRepository.setString(AUTO_STATUS_FALLBACK_MODE_KEY, fallbackMode.value);
    }

    async function setFallbackStatus(status) {
        fallbackStatus.value = isKnownStatus(status) ? status : 'join me';
        await configRepository.setString(AUTO_STATUS_FALLBACK_STATUS_KEY, fallbackStatus.value);
    }

    async function setFallbackDescriptionEnabled(on) {
        fallbackDescriptionEnabled.value = on === true;
        await configRepository.setBool(AUTO_STATUS_FALLBACK_DESC_ENABLED_KEY, fallbackDescriptionEnabled.value);
    }

    async function setFallbackDescription(text) {
        fallbackDescription.value = String(text ?? '').slice(0, 32);
        await configRepository.setString(AUTO_STATUS_FALLBACK_DESC_KEY, fallbackDescription.value);
    }

    async function captureBaseline(current) {
        if (baseline.value) {
            return;
        }
        const status = current?.status;
        if (!isKnownStatus(status)) {
            return;
        }
        baseline.value = {
            status,
            description: typeof current?.statusDescription === 'string' ? current.statusDescription : null
        };
        await configRepository.setString(
            AUTO_STATUS_BASELINE_KEY,
            JSON.stringify({ ...baseline.value, at: Date.now() })
        );
    }

    async function clearBaseline() {
        baseline.value = null;
        await configRepository.remove(AUTO_STATUS_BASELINE_KEY);
    }

    // Set while a status write is in flight. The engine runs on a short interval and
    // the endpoint neither merges nor throttles PUTs, so without this a slow response
    // lets the next tick decide from a status that has already been changed.
    const pending = ref(false);
    let lastWrite = 0;

    async function save() {
        try {
            await configRepository.setString(
                AUTO_STATUS_STORAGE_KEY,
                JSON.stringify({ rules: rules.value.map((rule, i) => ({ ...rule, index: i })) })
            );
        } catch (error) {
            console.error('Failed to save auto status rules', error);
        }
    }

    function ensureLoaded() {
        if (!loaded.value) {
            load();
        }
    }

    function addRule(input) {
        const rule = normalizeAutoStatusRule(input, rules.value.length);
        if (!rule) {
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
        // Re-normalizing the merged object is what keeps a hand edited status or an
        // over-long signature from reaching the API.
        const next = normalizeAutoStatusRule({ ...rules.value[index], ...patch }, index);
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

    function moveRule(id, direction) {
        const from = rules.value.findIndex((rule) => rule.id === id);
        const to = from + direction;
        if (from === -1 || to < 0 || to >= rules.value.length) {
            return;
        }
        const [rule] = rules.value.splice(from, 1);
        rules.value.splice(to, 0, rule);
        save();
    }

    function setEnabled(on) {
        rules.value.forEach((rule) => {
            rule.enabled = on === true;
        });
        save();
    }

    /**
     * @param {number} minimumGapMs - How long to leave between two status writes
     * @returns {boolean} Whether a write may go out now
     */
    function claimWrite(minimumGapMs) {
        if (pending.value) {
            return false;
        }
        if (Date.now() - lastWrite < minimumGapMs) {
            return false;
        }
        pending.value = true;
        return true;
    }

    function releaseWrite(success) {
        pending.value = false;
        if (success) {
            lastWrite = Date.now();
        } else {
            // Let the next tick try again quickly rather than waiting out a full gap.
            lastWrite = 0;
        }
    }

    if (!loaded.value) {
        load();
    }

    return {
        rules,
        loaded,
        pending,
        fallbackMode,
        fallbackStatus,
        fallbackDescriptionEnabled,
        fallbackDescription,
        baseline,
        load,
        save,
        ensureLoaded,
        setFallbackMode,
        setFallbackStatus,
        setFallbackDescriptionEnabled,
        setFallbackDescription,
        captureBaseline,
        clearBaseline,
        addRule,
        updateRule,
        removeRule,
        moveRule,
        setEnabled,
        claimWrite,
        releaseWrite
    };
});
