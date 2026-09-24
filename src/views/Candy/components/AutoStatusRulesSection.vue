<template>
    <div class="auto-status-rules">
        <FieldSeparator />

        <Field orientation="vertical">
            <FieldLabel>{{ t('dialog.auto_status_rules.title') }}</FieldLabel>
            <FieldContent>
                <!-- The priority rule has to be read next to the thing it explains, not
                     in a manual: two rules can point at the same moment and the person
                     needs to know which one wins before they write them. -->
                <p class="rules-hint">
                    {{ t('dialog.auto_status_rules.priority_hint') }}
                    <span class="lights">
                        <i class="x-user-status busy"></i> &gt; <i class="x-user-status askme"></i> &gt;
                        <i class="x-user-status online"></i> &gt; <i class="x-user-status joinme"></i>
                    </span>
                    {{ t('dialog.auto_status_rules.priority_hint_tail') }}
                </p>
                <p class="rules-hint">{{ t('dialog.auto_status_rules.presence_hint') }}</p>

                <div v-if="!rules.length" class="rules-empty">{{ t('dialog.auto_status_rules.empty') }}</div>

                <div v-for="(rule, index) in rules" :key="rule.id" class="rule-row" :class="{ off: !rule.enabled }">
                    <Switch :model-value="rule.enabled" @update:modelValue="(v) => patch(rule, 'enabled', v)" />

                    <Select :model-value="rule.type" @update:modelValue="(v) => onTypeChange(rule, v)">
                        <SelectTrigger size="sm" class="shrink-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="friend">{{ t('dialog.auto_status_rules.type_friend') }}</SelectItem>
                            <SelectItem value="world">{{ t('dialog.auto_status_rules.type_world') }}</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select :model-value="rule.targetId" @update:modelValue="(v) => onTargetChange(rule, v)">
                        <SelectTrigger size="sm" class="min-w-40 max-w-96 flex-1">
                            <SelectValue :placeholder="t('dialog.auto_status_rules.pick_target')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="option in targetOptions(rule.type)" :key="option.id" :value="option.id">
                                {{ option.name }}
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    <Select :model-value="rule.status" @update:modelValue="(v) => patch(rule, 'status', v)">
                        <SelectTrigger size="sm" class="shrink-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="busy"
                                ><i class="x-user-status busy"></i> {{ t('dialog.user.status.busy') }}</SelectItem
                            >
                            <SelectItem value="ask me"
                                ><i class="x-user-status askme"></i> {{ t('dialog.user.status.ask_me') }}</SelectItem
                            >
                            <SelectItem value="active"
                                ><i class="x-user-status online"></i> {{ t('dialog.user.status.online') }}</SelectItem
                            >
                            <SelectItem value="join me"
                                ><i class="x-user-status joinme"></i> {{ t('dialog.user.status.join_me') }}</SelectItem
                            >
                        </SelectContent>
                    </Select>

                    <!-- Always shown. Empty means "do not touch my signature", which is
                         what the placeholder says, so there is no switch to get out of
                         sync with the text. -->
                    <Input
                        class="min-w-36 max-w-72 flex-1"
                        :maxlength="32"
                        :model-value="rule.description"
                        :placeholder="t('dialog.auto_status_rules.signature_placeholder')"
                        :aria-label="t('dialog.auto_status_rules.with_signature')"
                        @update:modelValue="(v) => patch(rule, 'description', v)" />

                    <div class="rule-extra">
                        <label class="mini">
                            <Switch :model-value="rule.pin" @update:modelValue="(v) => patch(rule, 'pin', v)" />
                            {{ t('dialog.auto_status_rules.pin') }}
                        </label>
                        <label v-if="rule.type === 'friend'" class="mini">
                            <Switch
                                :model-value="rule.friendScope === 'world'"
                                @update:modelValue="(v) => patch(rule, 'friendScope', v ? 'world' : 'instance')" />
                            {{ t('dialog.auto_status_rules.same_world') }}
                        </label>
                    </div>

                    <div class="rule-actions">
                        <Button size="sm" :disabled="index === 0" @click="autoStatusRulesStore.moveRule(rule.id, -1)"
                            >↑</Button
                        >
                        <Button
                            size="sm"
                            :disabled="index === rules.length - 1"
                            @click="autoStatusRulesStore.moveRule(rule.id, 1)"
                            >↓</Button
                        >
                        <Button size="sm" @click="autoStatusRulesStore.removeRule(rule.id)">
                            <Trash2 />
                        </Button>
                    </div>
                </div>

                <div class="add-row">
                    <Select :model-value="draft.type" @update:modelValue="(v) => (draft.type = v)">
                        <SelectTrigger size="sm" class="shrink-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="friend">{{ t('dialog.auto_status_rules.type_friend') }}</SelectItem>
                            <SelectItem value="world">{{ t('dialog.auto_status_rules.type_world') }}</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select v-model="draft.targetId">
                        <SelectTrigger size="sm" class="min-w-40 max-w-96 flex-1">
                            <SelectValue :placeholder="t('dialog.auto_status_rules.pick_target')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="option in targetOptions(draft.type)" :key="option.id" :value="option.id">
                                {{ option.name }}
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    <Select v-model="draft.status">
                        <SelectTrigger size="sm" class="shrink-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="busy"
                                ><i class="x-user-status busy"></i> {{ t('dialog.user.status.busy') }}</SelectItem
                            >
                            <SelectItem value="ask me"
                                ><i class="x-user-status askme"></i> {{ t('dialog.user.status.ask_me') }}</SelectItem
                            >
                            <SelectItem value="active"
                                ><i class="x-user-status online"></i> {{ t('dialog.user.status.online') }}</SelectItem
                            >
                            <SelectItem value="join me"
                                ><i class="x-user-status joinme"></i> {{ t('dialog.user.status.join_me') }}</SelectItem
                            >
                        </SelectContent>
                    </Select>

                    <Button size="sm" :disabled="!draft.targetId" @click="addDraft">
                        {{ t('dialog.auto_status_rules.add') }}
                    </Button>
                </div>

                <SimpleSwitch
                    :label="t('dialog.auto_status_rules.blend_legacy')"
                    :tooltip="t('dialog.auto_status_rules.blend_legacy_hint')"
                    :value="autoStateChangeRulesBlendLegacy"
                    :long-label="true"
                    @change="setAutoStateChangeRulesBlendLegacy" />
            </FieldContent>
        </Field>
    </div>
</template>

<script setup>
    import { computed, reactive } from 'vue';
    import { useI18n } from 'vue-i18n';
    import { storeToRefs } from 'pinia';
    import { Trash2 } from 'lucide-vue-next';

    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
    import { Switch } from '@/components/ui/switch';
    import { Input } from '@/components/ui/input';
    import { Button } from '@/components/ui/button';
    import { Field, FieldContent, FieldLabel, FieldSeparator } from '@/components/ui/field';

    import { useAutoStatusRulesStore, useFriendStore, useGeneralSettingsStore, useWorldStore } from '../../../stores';
    import SimpleSwitch from '../../Settings/components/SimpleSwitch.vue';

    const { t } = useI18n();

    const autoStatusRulesStore = useAutoStatusRulesStore();
    const friendStore = useFriendStore();
    const worldStore = useWorldStore();
    const generalSettingsStore = useGeneralSettingsStore();

    const { rules } = storeToRefs(autoStatusRulesStore);
    const { autoStateChangeRulesBlendLegacy } = storeToRefs(generalSettingsStore);
    const { setAutoStateChangeRulesBlendLegacy } = generalSettingsStore;

    const draft = reactive({ type: 'friend', targetId: '', status: 'busy' });

    const friendOptions = computed(() =>
        [...friendStore.friends.entries()]
            .map(([id, user]) => ({
                // The friend record has carried both `name` and `displayName` across
                // versions, and either can be empty for a person VRCX only knows from
                // the game log, so fall through to the id rather than show a blank row.
                id,
                name: user?.displayName || user?.name || user?.id || id
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
    );

    // Worlds VRCX has already seen. There is no point offering a search box here: the
    // only worlds a rule can usefully name are ones this account has actually been to.
    const worldOptions = computed(() => {
        const seen = new Map();
        for (const world of worldStore.cachedWorlds?.values?.() || []) {
            if (world?.id && world?.name) {
                seen.set(world.id, world.name);
            }
        }
        return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    });

    function targetOptions(type) {
        return type === 'world' ? worldOptions.value : friendOptions.value;
    }

    function nameFor(type, id) {
        return targetOptions(type).find((option) => option.id === id)?.name || '';
    }

    function patch(rule, field, value) {
        autoStatusRulesStore.updateRule(rule.id, { [field]: value });
    }

    function onTypeChange(rule, type) {
        autoStatusRulesStore.updateRule(rule.id, { type, targetId: '', targetName: '' });
    }

    function onTargetChange(rule, id) {
        autoStatusRulesStore.updateRule(rule.id, { targetId: id, targetName: nameFor(rule.type, id) });
    }

    function addDraft() {
        if (!draft.targetId) {
            return;
        }
        autoStatusRulesStore.addRule({
            type: draft.type,
            targetId: draft.targetId,
            targetName: nameFor(draft.type, draft.targetId),
            status: draft.status,
            enabled: true
        });
        draft.targetId = '';
    }
</script>

<style scoped>
    .auto-status-rules {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .rules-hint {
        font-size: 11px;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
        line-height: 1.5;
    }

    .rules-hint .lights {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        vertical-align: middle;
    }

    .rules-empty {
        font-size: 12px;
        opacity: 0.6;
        padding: 6px 0;
    }

    .rule-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        padding: 6px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .rule-row.off {
        opacity: 0.45;
    }

    .rule-extra {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .rule-extra .mini {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        white-space: nowrap;
    }

    .rule-actions {
        display: flex;
        gap: 2px;
        margin-left: auto;
    }

    .add-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding-top: 8px;
    }
</style>
