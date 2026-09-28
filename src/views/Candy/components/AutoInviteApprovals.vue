<template>
    <div class="auto-invite-page flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-8">
        <div class="pt-4 text-base font-medium">{{ t('view.candy.auto_invites.tab_label') }}</div>
        <p class="page-intro">{{ t('view.candy.auto_invites.intro') }}</p>

        <!-- The switch is at the top because everything under it is inert until it is
             on, and this is the one feature in the fork that lets somebody into a room
             you are not awake enough to open the door for. -->
        <div class="master-row">
            <Switch :model-value="settings.enabled" @update:modelValue="(v) => store.setEnabled(v)" />
            <div class="min-w-0">
                <div class="master-title">{{ t('view.candy.auto_invites.enable') }}</div>
                <div class="page-intro">{{ t('view.candy.auto_invites.enable_hint') }}</div>
            </div>
        </div>

        <Field orientation="vertical" :class="{ dim: !settings.enabled }">
            <FieldLabel>{{ t('view.candy.auto_invites.guards_title') }}</FieldLabel>
            <FieldContent>
                <ul class="guard-list">
                    <li v-for="line in guardLines" :key="line">{{ line }}</li>
                </ul>
            </FieldContent>
        </Field>

        <FieldSeparator />

        <Field orientation="vertical">
            <FieldLabel>{{ t('view.candy.auto_invites.allowed_title') }}</FieldLabel>
            <FieldContent>
                <div v-if="!rules.length" class="page-intro">{{ t('view.candy.auto_invites.allowed_empty') }}</div>
                <div v-for="rule in rules" :key="rule.id" class="friend-row" :class="{ off: !rule.enabled }">
                    <Switch
                        :model-value="rule.enabled"
                        @update:modelValue="(v) => store.updateRule(rule.id, { enabled: v })" />
                    <Avatar class="size-7 flex-none">
                        <AvatarImage :src="userImage(friendRecord(rule.userId), true)" class="object-cover" />
                        <AvatarFallback><User class="size-3 text-muted-foreground" /></AvatarFallback>
                    </Avatar>
                    <div class="min-w-0 flex-1">
                        <div
                            class="truncate text-[13px] font-medium"
                            :style="{ color: friendRecord(rule.userId)?.$userColour }">
                            {{ displayName(rule) }}
                        </div>
                        <div class="truncate text-[11px] text-muted-foreground">{{ rule.userId }}</div>
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        :aria-label="t('view.candy.auto_invites.remove')"
                        @click="store.removeRule(rule.id)">
                        <Trash2 class="size-3.5" />
                    </Button>
                </div>

                <div class="add-row">
                    <Select v-model="draftUserId">
                        <SelectTrigger size="sm" class="min-w-40 max-w-96 flex-1">
                            <SelectValue :placeholder="t('view.candy.auto_invites.pick_friend')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="option in friendOptions" :key="option.id" :value="option.id">
                                {{ option.name }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <Button size="sm" :disabled="!draftUserId" @click="addDraft">
                        {{ t('view.candy.auto_invites.add') }}
                    </Button>
                </div>
            </FieldContent>
        </Field>

        <FieldSeparator />

        <Field orientation="vertical">
            <FieldLabel>{{ t('view.candy.auto_invites.limits_title') }}</FieldLabel>
            <FieldContent>
                <label class="option-row">
                    <Switch :model-value="settings.askMeOnly" @update:modelValue="(v) => store.setAskMeOnly(v)" />
                    <span>
                        {{ t('view.candy.auto_invites.ask_me_only') }}
                        <span class="page-intro block">{{ t('view.candy.auto_invites.ask_me_only_hint') }}</span>
                    </span>
                </label>
                <label class="option-row">
                    <Switch :model-value="settings.notify" @update:modelValue="(v) => store.setNotify(v)" />
                    <span>{{ t('view.candy.auto_invites.notify') }}</span>
                </label>

                <div class="option-row">
                    <Switch :model-value="settings.window.enabled" @update:modelValue="(v) => onWindowToggle(v)" />
                    <span class="flex-1">
                        {{ t('view.candy.auto_invites.window') }}
                        <span class="page-intro block">{{ t('view.candy.auto_invites.window_hint') }}</span>
                    </span>
                    <template v-if="settings.window.enabled">
                        <Input
                            class="time-input"
                            type="time"
                            :model-value="toClock(settings.window.fromMinute)"
                            @update:modelValue="(v) => onWindowChange('fromMinute', v)" />
                        <span class="page-intro">–</span>
                        <Input
                            class="time-input"
                            type="time"
                            :model-value="toClock(settings.window.toMinute)"
                            @update:modelValue="(v) => onWindowChange('toMinute', v)" />
                    </template>
                </div>

                <div class="option-row">
                    <span class="flex-1">
                        {{ t('view.candy.auto_invites.daily_limit') }}
                        <span class="page-intro block">{{ t('view.candy.auto_invites.daily_limit_hint') }}</span>
                    </span>
                    <Input
                        class="limit-input"
                        type="number"
                        min="1"
                        max="50"
                        :model-value="settings.dailyLimit"
                        @update:modelValue="(v) => store.setDailyLimit(v)" />
                </div>

                <div class="option-row">
                    <span class="flex-1 text-[12px] text-muted-foreground">
                        {{
                            t('view.candy.auto_invites.today', { count: store.todayCount, limit: settings.dailyLimit })
                        }}
                    </span>
                    <Button size="sm" variant="ghost" @click="store.resetCounter()">
                        {{ t('view.candy.auto_invites.reset_today') }}
                    </Button>
                </div>
            </FieldContent>
        </Field>

        <FieldSeparator />

        <Field orientation="vertical">
            <FieldLabel>{{ t('view.candy.auto_invites.log_title') }}</FieldLabel>
            <FieldContent>
                <div v-if="!store.log.length" class="page-intro">{{ t('view.candy.auto_invites.log_empty') }}</div>
                <div v-for="(entry, index) in store.log" :key="`${entry.at}-${index}`" class="log-row">
                    <span class="log-time">{{ formatTime(entry.at) }}</span>
                    <span class="log-name">{{ entry.name || entry.userId }}</span>
                    <span class="log-action" :class="entry.action">{{ actionLabel(entry) }}</span>
                </div>
                <p class="page-intro mt-1">{{ t('view.candy.auto_invites.log_hint') }}</p>
            </FieldContent>
        </Field>
    </div>
</template>

<script setup>
    import { computed, ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { Trash2, User } from 'lucide-vue-next';

    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { Button } from '@/components/ui/button';
    import { Field, FieldContent, FieldLabel, FieldSeparator } from '@/components/ui/field';
    import { Input } from '@/components/ui/input';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
    import { Switch } from '@/components/ui/switch';

    import { useAutoInviteApprovalsStore, useFriendStore } from '../../../stores';
    import { useUserDisplay } from '@/composables/useUserDisplay';

    defineOptions({ name: 'CandyAutoInvites' });

    const { t } = useI18n();
    const { userImage } = useUserDisplay();
    const store = useAutoInviteApprovalsStore();
    const friendStore = useFriendStore();
    const { settings, rules } = storeToRefs(store);

    const draftUserId = ref('');

    const guardLines = computed(() => [
        t('view.candy.auto_invites.guard_room'),
        t('view.candy.auto_invites.guard_owner'),
        t('view.candy.auto_invites.guard_once'),
        t('view.candy.auto_invites.guard_limit')
    ]);

    const friendOptions = computed(() =>
        [...friendStore.friends.entries()]
            .map(([id, user]) => ({ id, name: user?.displayName || user?.name || user?.id || id }))
            .filter((option) => !rules.value.some((rule) => rule.userId === option.id))
            .sort((a, b) => a.name.localeCompare(b.name))
    );

    /**
     * @param {string} userId
     * @returns {object | null} The live friend record, looked up while rendering
     */
    function friendRecord(userId) {
        return friendStore.friends.get(userId)?.ref || null;
    }

    /**
     * @param {{ userId: string; displayName?: string }} row
     * @returns {string}
     */
    function displayName(row) {
        return friendRecord(row.userId)?.displayName || row.displayName || row.userId;
    }

    function addDraft() {
        const friend = friendStore.friends.get(draftUserId.value);
        const rule = store.addRule({
            userId: draftUserId.value,
            displayName: friend?.ref?.displayName || friend?.displayName
        });
        if (rule) {
            draftUserId.value = '';
        }
    }

    /**
     * @param {number} minutes
     * @returns {string} HH:MM for the time input
     */
    function toClock(minutes) {
        const value = Number.isFinite(minutes) ? Math.max(0, Math.min(1439, minutes)) : 0;
        return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    }

    /**
     * @param {string} clock
     * @returns {number} Minutes since midnight, or -1 when unparseable
     */
    function fromClock(clock) {
        const match = /^(\d{1,2}):(\d{2})$/.exec(String(clock || '').trim());
        if (!match) {
            return -1;
        }
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        if (hour > 23 || minute > 59) {
            return -1;
        }
        return hour * 60 + minute;
    }

    function onWindowToggle(on) {
        store.setWindow({ enabled: on === true });
    }

    /**
     * @param {string} field
     * @param {string} value
     */
    function onWindowChange(field, value) {
        const minutes = fromClock(value);
        if (minutes < 0) {
            return;
        }
        store.setWindow({ [field]: minutes });
    }

    /**
     * @param {number} at
     * @returns {string}
     */
    function formatTime(at) {
        return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * @param {{ action: string; reason: string; worldName?: string }} entry
     * @returns {string}
     */
    function actionLabel(entry) {
        const reason = t(`view.candy.auto_invites.reason.${entry.reason}`);
        if (entry.action === 'accept' && entry.worldName) {
            return `${reason} · ${entry.worldName}`;
        }
        return reason;
    }
</script>

<style scoped>
    .page-intro {
        font-size: 12px;
        line-height: 1.6;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
    }

    .master-row,
    .option-row,
    .friend-row,
    .add-row,
    .log-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .master-row {
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
    }

    .master-title {
        font-size: 13px;
        font-weight: 500;
    }

    .option-row {
        margin-top: 10px;
        font-size: 13px;
    }

    .friend-row {
        padding: 6px 0;
        border-bottom: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
    }

    .friend-row.off {
        opacity: 0.55;
    }

    .add-row {
        margin-top: 10px;
    }

    .guard-list {
        margin: 4px 0 0;
        padding-left: 18px;
        font-size: 12px;
        line-height: 1.7;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
        list-style: disc;
    }

    .dim {
        opacity: 0.5;
    }

    .time-input {
        width: 96px;
        flex: none;
    }

    .limit-input {
        width: 72px;
        flex: none;
    }

    .log-row {
        font-size: 12px;
        padding: 3px 0;
    }

    .log-time {
        width: 56px;
        flex: none;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
    }

    .log-name {
        min-width: 0;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .log-action {
        flex: none;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
    }

    .log-action.accept {
        color: var(--status-online, #2ed319);
    }

    .log-action.fail {
        color: var(--status-busy, #c80928);
    }
</style>
