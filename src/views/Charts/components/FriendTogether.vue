<template>
    <div id="chart" class="x-container">
        <div class="flex min-h-0 flex-col gap-3 pt-3 pb-6">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                    <Users class="size-4 shrink-0 text-muted-foreground" />
                    <span class="text-sm font-medium">{{ t('view.charts.friend_together.header') }}</span>
                    <HoverCard>
                        <HoverCardTrigger as-child>
                            <Info class="size-3.5 shrink-0 cursor-pointer opacity-70" />
                        </HoverCardTrigger>
                        <HoverCardContent side="bottom" align="start" class="w-80 text-xs">
                            {{ t('view.charts.friend_together.tips.coverage') }}
                        </HoverCardContent>
                    </HoverCard>
                </div>

                <ToggleGroup
                    variant="outline"
                    type="single"
                    :model-value="String(rangeDays)"
                    @update:modelValue="handleRangeChange">
                    <ToggleGroupItem v-for="option in rangeOptions" :key="option" :value="String(option)">
                        {{
                            option
                                ? t(`view.charts.friend_together.period.days_${option}`)
                                : t('view.charts.friend_together.period.all')
                        }}
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>

            <div class="flex flex-wrap items-center gap-4">
                <label class="flex cursor-pointer items-center gap-2 text-xs">
                    <Switch v-model="onlyWithoutMe" />
                    <span>{{ t('view.charts.friend_together.filters.without_me') }}</span>
                </label>
                <label class="flex cursor-pointer items-center gap-2 text-xs">
                    <Switch v-model="onlyGroups" />
                    <span>{{ t('view.charts.friend_together.filters.three_plus') }}</span>
                </label>
            </div>

            <div v-if="loading" class="mt-[100px] flex justify-center">
                <RefreshCcw class="size-6 animate-spin text-muted-foreground" />
            </div>

            <div v-else-if="!allEvents.length" class="rounded-xl border border-dashed border-muted-foreground/30 p-6">
                <span class="text-xs text-muted-foreground">{{ t('view.charts.friend_together.empty') }}</span>
            </div>

            <template v-else>
                <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div v-for="card in statCards" :key="card.label" class="rounded-xl border p-3">
                        <div class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {{ card.label }}
                        </div>
                        <div class="mt-1 truncate text-lg font-medium" :title="card.title || ''">
                            {{ card.value }}
                        </div>
                        <div v-if="card.hint" class="truncate text-[11px] text-muted-foreground">
                            {{ card.hint }}
                        </div>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                        {{ t('view.charts.friend_together.summary.events') }}
                        <span class="font-medium text-foreground">{{ events.length }}</span>
                    </span>
                    <span>
                        {{ t('view.charts.friend_together.summary.while_offline') }}
                        <span class="font-medium text-foreground">{{ summary.whileOffline }}</span>
                    </span>
                    <TooltipWrapper side="top" :content="t('view.charts.friend_together.tips.filters')">
                        <Info class="size-3.5 cursor-help opacity-70" />
                    </TooltipWrapper>
                </div>

                <div v-if="!events.length" class="rounded-xl border border-dashed border-muted-foreground/30 p-6">
                    <span class="text-xs text-muted-foreground">{{
                        t('view.charts.friend_together.empty_filtered')
                    }}</span>
                </div>

                <template v-else>
                    <div class="grid gap-3 lg:grid-cols-2">
                        <section class="rounded-xl border p-3">
                            <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {{ t('view.charts.friend_together.section.pairs') }}
                            </div>
                            <button
                                v-for="pair in topPairs"
                                :key="`${pair.a.userId}-${pair.b.userId}`"
                                type="button"
                                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                                @click="showUserDialog(pair.a.userId)">
                                <Avatar class="size-6 shrink-0">
                                    <AvatarImage :src="userImage(userFor(pair.a.userId), true)" class="object-cover" />
                                    <AvatarFallback><User class="size-3" /></AvatarFallback>
                                </Avatar>
                                <Avatar class="size-6 shrink-0">
                                    <AvatarImage :src="userImage(userFor(pair.b.userId), true)" class="object-cover" />
                                    <AvatarFallback><User class="size-3" /></AvatarFallback>
                                </Avatar>
                                <span class="min-w-0 flex-1 truncate text-xs">
                                    {{ pair.a.displayName }} + {{ pair.b.displayName }}
                                </span>
                                <span class="shrink-0 text-[11px] text-muted-foreground">
                                    {{ t('view.charts.friend_together.unit.times', { count: pair.events }) }}
                                </span>
                            </button>
                        </section>

                        <section class="rounded-xl border p-3">
                            <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {{ t('view.charts.friend_together.section.worlds') }}
                            </div>
                            <button
                                v-for="(world, index) in topWorlds"
                                :key="world.worldId || index"
                                type="button"
                                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                                @click="world.worldId && showWorldDialog(world.worldId)">
                                <span class="w-5 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                                    {{ index + 1 }}
                                </span>
                                <span class="min-w-0 flex-1 truncate text-xs">
                                    {{ world.name || t('view.charts.friend_together.unknown_world') }}
                                </span>
                                <span class="shrink-0 text-[11px] text-muted-foreground">
                                    {{ t('view.charts.friend_together.unit.people', { count: world.people }) }}
                                </span>
                                <span class="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                                    {{ t('view.charts.friend_together.unit.times', { count: world.events }) }}
                                </span>
                            </button>
                        </section>
                    </div>

                    <section class="rounded-xl border p-3">
                        <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {{ t('view.charts.friend_together.section.timeline') }}
                        </div>

                        <div v-for="day in timelineDays" :key="day.dateKey" class="mb-3 last:mb-0">
                            <div class="mb-1 text-[11px] font-medium text-muted-foreground">
                                {{ formatDayLabel(day.dateKey) }}
                            </div>
                            <div
                                v-for="(event, index) in day.events"
                                :key="`${event.location}-${event.startAt}-${index}`"
                                class="flex items-start gap-2 border-l border-muted-foreground/20 py-1 pl-3">
                                <span class="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">
                                    {{ formatTime(event.startAt) }}–{{ formatTime(event.endAt) }}
                                </span>
                                <div class="min-w-0 flex-1">
                                    <button
                                        type="button"
                                        class="max-w-full truncate text-left text-xs hover:underline"
                                        @click="event.worldId && showWorldDialog(event.worldId)">
                                        {{ event.worldName || t('view.charts.friend_together.unknown_world') }}
                                    </button>
                                    <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                                        <button
                                            v-for="participant in event.participants"
                                            :key="participant.userId"
                                            type="button"
                                            class="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] hover:bg-accent"
                                            :title="participantSpan(participant, event)"
                                            @click="showUserDialog(participant.userId)">
                                            <Avatar class="size-4 shrink-0">
                                                <AvatarImage
                                                    :src="userImage(userFor(participant.userId), true)"
                                                    class="object-cover" />
                                                <AvatarFallback><User class="size-2.5" /></AvatarFallback>
                                            </Avatar>
                                            {{ participant.displayName }}
                                        </button>
                                    </div>
                                </div>
                                <div class="flex shrink-0 flex-col items-end gap-0.5">
                                    <span class="text-[11px] text-muted-foreground/80">
                                        {{ timeToText(event.durationMs, false) }}
                                    </span>
                                    <span
                                        class="rounded-full px-1.5 py-0.5 text-[10px]"
                                        :class="selfBadgeClass(event.self)">
                                        {{ t(`view.charts.friend_together.self.${event.self}`) }}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>
                </template>
            </template>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, ref } from 'vue';
    import { Info, RefreshCcw, User, Users } from 'lucide-vue-next';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
    import { Switch } from '@/components/ui/switch';
    import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
    import { TooltipWrapper } from '@/components/ui/tooltip';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import { useUserDisplay } from '@/composables/useUserDisplay';
    import { showUserDialog } from '@/coordinators/userCoordinator';
    import { showWorldDialog } from '@/coordinators/worldCoordinator';
    import { database } from '@/services/database';
    import { useFriendStore, useUserStore } from '@/stores';
    import {
        buildTogetherEvents,
        formatDateFilter,
        summarizeTogether,
        timeToText,
        togetherByDay,
        topTogetherPairs,
        topTogetherWorlds
    } from '@/shared/utils';

    const { t } = useI18n();
    const { friends } = storeToRefs(useFriendStore());
    const { currentUser } = storeToRefs(useUserStore());
    const { userImage } = useUserDisplay();

    const DAY_MS = 24 * 60 * 60 * 1000;
    const rangeOptions = [7, 30, 90, 0];

    const rangeDays = ref(30);
    const onlyWithoutMe = ref(true);
    const onlyGroups = ref(false);
    const loading = ref(false);
    const allEvents = ref([]);

    const events = computed(() =>
        allEvents.value.filter((event) => {
            if (onlyWithoutMe.value && event.self === 'there') {
                return false;
            }
            return !(onlyGroups.value && event.participants.length < 3);
        })
    );

    const summary = computed(() => summarizeTogether(events.value));

    const topPairs = computed(() => topTogetherPairs(events.value, 8));

    const topWorlds = computed(() => topTogetherWorlds(events.value, 8));

    const timelineDays = computed(() => togetherByDay(events.value, 30));

    const statCards = computed(() => {
        const stats = summary.value;
        const busiest = topWorlds.value[0];
        return [
            {
                label: t('view.charts.friend_together.stats.events'),
                value: String(stats.events),
                hint: t('view.charts.friend_together.stats.days', { count: stats.days })
            },
            {
                label: t('view.charts.friend_together.stats.worlds'),
                value: String(stats.worlds),
                hint: t('view.charts.friend_together.stats.instances', { count: stats.instances })
            },
            {
                label: t('view.charts.friend_together.stats.people'),
                value: String(stats.people),
                hint: t('view.charts.friend_together.stats.without_me', { count: stats.withoutMe })
            },
            {
                label: t('view.charts.friend_together.stats.duration'),
                value: stats.durationMs ? timeToText(stats.durationMs, false) : '—',
                hint: busiest ? busiest.name || t('view.charts.friend_together.unknown_world') : '',
                title: busiest?.name || ''
            }
        ];
    });

    /**
     * @param {string} userId
     * @returns {object} A user-ish object for the avatar helpers
     */
    function userFor(userId) {
        const friend = friends.value.get(userId);
        return friend?.ref || { id: userId };
    }

    /**
     * @param {number} timestamp
     * @returns {string}
     */
    function formatTime(timestamp) {
        return formatDateFilter(timestamp, 'time');
    }

    /**
     * @param {string} dateKey
     * @returns {string}
     */
    function formatDayLabel(dateKey) {
        return formatDateFilter(`${dateKey}T00:00:00`, 'long');
    }

    /**
     * A friend who only dropped in for part of the gathering gets their own window in
     * the tooltip, so a brief visit is not read as staying the whole time.
     *
     * @param {object} participant
     * @param {object} event
     * @returns {string}
     */
    function participantSpan(participant, event) {
        if (participant.startAt <= event.startAt && participant.endAt >= event.endAt) {
            return t('view.charts.friend_together.participant.all_along');
        }
        return t('view.charts.friend_together.participant.span', {
            from: formatTime(participant.startAt),
            to: formatTime(participant.endAt)
        });
    }

    /**
     * @param {string} self
     * @returns {string}
     */
    function selfBadgeClass(self) {
        if (self === 'offline') {
            return 'bg-muted text-muted-foreground';
        }
        if (self === 'there') {
            return 'bg-primary/15 text-primary';
        }
        return 'bg-black/[0.06] text-muted-foreground dark:bg-white/[0.08]';
    }

    function handleRangeChange(value) {
        if (!value) {
            return;
        }
        rangeDays.value = parseInt(value, 10);
        loadEvents();
    }

    async function loadEvents() {
        loading.value = true;
        try {
            const since = rangeDays.value ? new Date(Date.now() - rangeDays.value * DAY_MS).toISOString() : '';
            const [friendRows, selfSegments] = await Promise.all([
                database.getAllFriendGpsRows(since),
                database.getSelfLocationSegments(since)
            ]);
            // Sessions tell "I was online elsewhere" apart from "I was not online at
            // all"; without them every event I missed would just read as elsewhere.
            let selfSessions = [];
            if (currentUser.value?.id) {
                const sessions = await database.getActivitySessionsV2(currentUser.value.id);
                selfSessions = sessions.map((session) => ({ startAt: session.start, endAt: session.end }));
            }
            allEvents.value = buildTogetherEvents({ friendRows, selfSegments, selfSessions });
        } catch (error) {
            console.error('Failed to load friend together events', error);
            allEvents.value = [];
        } finally {
            loading.value = false;
        }
    }

    onMounted(loadEvents);
</script>
