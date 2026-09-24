import { defineStore } from 'pinia';
import { ref } from 'vue';

import configRepository from '../../services/config';
import { AUTO_STATUS_STORAGE_KEY } from '../../shared/constants/autoStatus';
import { normalizeAutoStatusRule, parseAutoStatusRules } from '../../shared/utils/autoStatusRules';

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
    // Set while a status write is in flight. The engine runs on a short interval and
    // the endpoint neither merges nor throttles PUTs, so without this a slow response
    // lets the next tick decide from a status that has already been changed.
    const pending = ref(false);
    let lastWrite = 0;

    async function load() {
        try {
            const stored = await configRepository.getString(AUTO_STATUS_STORAGE_KEY, null);
            rules.value = parseAutoStatusRules(stored);
        } catch {
            rules.value = [];
        } finally {
            loaded.value = true;
        }
    }

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
        load,
        save,
        ensureLoaded,
        addRule,
        updateRule,
        removeRule,
        moveRule,
        setEnabled,
        claimWrite,
        releaseWrite
    };
});
