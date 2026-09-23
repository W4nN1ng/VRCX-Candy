<template>
    <div id="chart" class="x-container">
        <div class="flex h-[calc(100vh-96px)] min-h-0 gap-3 pt-3">
            <!-- 左栏：从好友里挑一个 -->
            <aside class="flex w-72 flex-none flex-col gap-2 border-r border-muted-foreground/20 pr-3 min-h-0">
                <div class="flex items-center gap-2">
                    <Footprints class="size-4 shrink-0 text-muted-foreground" />
                    <span class="truncate text-sm font-medium">{{ t('view.charts.friend_footprints.header') }}</span>
                </div>

                <Input v-model="search" :placeholder="t('view.charts.friend_footprints.search_placeholder')" />

                <ScrollArea class="min-h-0 flex-1 pr-1">
                    <div v-if="!filteredCandidates.length" class="px-2 py-6 text-xs text-muted-foreground">
                        {{ t('view.charts.friend_footprints.no_candidates') }}
                    </div>
                    <button
                        v-for="candidate in filteredCandidates"
                        :key="candidate.userId"
                        type="button"
                        class="x-hover-list flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left"
                        :class="candidate.userId === selectedId ? 'bg-accent' : ''"
                        @click="selectFriend(candidate.userId)">
                        <div class="relative inline-block size-9 flex-none" :class="userStatusClass(candidate.user)">
                            <Avatar class="size-9">
                                <AvatarImage :src="userImage(candidate.user, true)" class="object-cover" />
                                <AvatarFallback><User class="size-4 text-muted-foreground" /></AvatarFallback>
                            </Avatar>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div
                                class="truncate text-[13px] font-medium"
                                :style="{ color: candidate.user?.$userColour }">
                                {{ candidate.displayName }}
                            </div>
                            <div class="truncate text-[11px] text-muted-foreground">
                                {{ t('view.charts.friend_footprints.candidate_visits', { count: candidate.visits }) }}
                                · {{ candidate.lastAt ? timeAgo(candidate.lastAt) : '—' }}
                            </div>
                        </div>
                    </button>
                </ScrollArea>
            </aside>

            <!-- 右栏：详情 -->
            <main class="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pb-6">
                <div v-if="!selectedId" class="mt-[120px] flex justify-center">
                    <DataTableEmpty type="nodata" />
                </div>

                <template v-else>
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex min-w-0 items-center gap-2">
                            <span
                                class="cursor-pointer truncate text-base font-medium hover:underline"
                                @click="showUserDialog(selectedId)">
                                {{ selectedName }}
                            </span>
                            <HoverCard>
                                <HoverCardTrigger as-child>
                                    <Info class="size-3.5 shrink-0 cursor-pointer opacity-70" />
                                </HoverCardTrigger>
                                <HoverCardContent side="bottom" align="start" class="w-80 text-xs">
                                    {{ t('view.charts.friend_footprints.tips.coverage') }}
                                    <template v-if="summary.firstAt">
                                        <br />
                                        {{
                                            t('view.charts.friend_footprints.tips.first_record', {
                                                date: formatDateFilter(summary.firstAt, 'long')
                                            })
                                        }}
                                    </template>
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
                                        ? t(`view.charts.friend_footprints.period.days_${option}`)
                                        : t('view.charts.friend_footprints.period.all')
                                }}
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    <div v-if="loading" class="mt-[100px] flex justify-center">
                        <RefreshCcw class="size-6 animate-spin text-muted-foreground" />
                    </div>

                    <div
                        v-else-if="!visits.length"
                        class="rounded-xl border border-dashed border-muted-foreground/30 p-6">
                        <span class="text-xs text-muted-foreground">
                            {{ t('view.charts.friend_footprints.empty') }}
                        </span>
                    </div>

                    <template v-else>
                        <!-- 概览 -->
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

                        <!-- 常去的地图 -->
                        <section class="rounded-xl border p-3">
                            <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {{ t('view.charts.friend_footprints.section.top_worlds') }}
                            </div>
                            <button
                                v-for="world in topWorlds"
                                :key="world.key"
                                type="button"
                                class="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
                                @click="world.worldId && showWorldDialog(world.worldId)">
                                <span
                                    class="w-6 shrink-0 text-right font-mono text-xs font-bold text-muted-foreground"
                                    :class="world.rank === 1 ? 'text-primary' : ''">
                                    #{{ world.rank }}
                                </span>
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-1.5">
                                        <span class="truncate text-sm group-hover:underline">{{
                                            worldLabel(world)
                                        }}</span>
                                        <span v-if="world.groupName" class="shrink-0 text-[10px] text-muted-foreground">
                                            {{ world.groupName }}
                                        </span>
                                    </div>
                                    <div
                                        class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                                        <div
                                            class="h-full rounded-full bg-black/25 transition-all duration-500 dark:bg-white/40"
                                            :style="{ width: `${Math.max(3, world.share * 100)}%` }"></div>
                                    </div>
                                </div>
                                <div class="shrink-0 text-right text-xs text-muted-foreground">
                                    <div>
                                        {{ t('view.charts.friend_footprints.unit.times', { count: world.visits }) }}
                                    </div>
                                    <div class="text-[10px] opacity-70">
                                        {{ world.durationMs ? timeToText(world.durationMs, false) : '—' }}
                                    </div>
                                </div>
                            </button>
                        </section>

                        <!-- 时段热力 -->
                        <section class="rounded-xl border p-3">
                            <div class="mb-2 flex items-center justify-between gap-2">
                                <span class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                    {{ t('view.charts.friend_footprints.section.heatmap') }}
                                </span>
                                <span v-if="heatmap.peak" class="text-[11px] text-muted-foreground">
                                    {{
                                        t('view.charts.friend_footprints.heatmap.peak', {
                                            day: weekdayLabels[heatmap.peak.day],
                                            hour: heatmap.peak.hour,
                                            count: heatmap.peak.visits
                                        })
                                    }}
                                </span>
                            </div>
                            <div class="overflow-x-auto">
                                <div class="min-w-[560px]">
                                    <div class="mb-1 flex gap-1 pl-9">
                                        <span
                                            v-for="h in 24"
                                            :key="h"
                                            class="flex-1 text-center text-[9px] text-muted-foreground/70">
                                            {{ h % 3 === 1 ? h - 1 : '' }}
                                        </span>
                                    </div>
                                    <div
                                        v-for="(row, day) in heatmap.counts"
                                        :key="day"
                                        class="mb-1 flex items-center gap-1">
                                        <span class="w-8 shrink-0 text-[10px] text-muted-foreground">
                                            {{ weekdayLabels[day].slice(0, 3) }}
                                        </span>
                                        <TooltipWrapper
                                            v-for="(count, hour) in row"
                                            :key="hour"
                                            :content="`${weekdayLabels[day]} ${hour}:00 - ${t('view.charts.friend_footprints.heatmap.visits', { count })}`">
                                            <div
                                                class="h-4 flex-1 rounded-[3px]"
                                                :class="count ? '' : 'bg-black/[0.05] dark:bg-white/[0.05]'"
                                                :style="count ? heatStyle(count) : ''"></div>
                                        </TooltipWrapper>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <!-- 常混的社群 -->
                        <section v-if="groupStats.length > 1 || groupStats[0]?.groupName" class="rounded-xl border p-3">
                            <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {{ t('view.charts.friend_footprints.section.groups') }}
                            </div>
                            <div class="flex flex-wrap gap-1.5">
                                <span
                                    v-for="group in groupStats.slice(0, 12)"
                                    :key="group.groupName || 'none'"
                                    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
                                    <template v-if="group.groupName">
                                        {{ group.groupName }}
                                        <span class="text-muted-foreground">×{{ group.visits }}</span>
                                    </template>
                                    <template v-else>{{ t('view.charts.friend_footprints.group_none') }}</template>
                                </span>
                            </div>
                        </section>

                        <!-- 时间线 -->
                        <section class="rounded-xl border p-3">
                            <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {{ t('view.charts.friend_footprints.section.timeline') }}
                            </div>
                            <div v-for="day in timelineDays" :key="day.dateKey" class="mb-3 last:mb-0">
                                <div class="mb-1 text-[11px] font-medium text-muted-foreground">
                                    {{ day.dateKey }}
                                </div>
                                <div
                                    v-for="visit in day.visits"
                                    :key="`${visit.key}-${visit.arrivedAt}`"
                                    class="flex items-center gap-2 border-l border-muted-foreground/20 py-1 pl-3">
                                    <span class="w-12 shrink-0 font-mono text-[11px] text-muted-foreground">
                                        {{ formatHour(visit.arrivedAt) }}
                                    </span>
                                    <span class="min-w-0 flex-1 truncate text-xs">
                                        {{ worldLabel(visit) }}
                                    </span>
                                    <span class="shrink-0 text-[11px] text-muted-foreground/80">
                                        {{
                                            visit.leftAt === null
                                                ? t('view.charts.friend_footprints.row.ongoing')
                                                : visit.durationKnown
                                                  ? timeToText(visit.durationMs, false)
                                                  : t('view.charts.friend_footprints.row.unknown')
                                        }}
                                    </span>
                                </div>
                            </div>
                        </section>
                    </template>
                </template>
            </main>
        </div>
    </div>
</template>

<script setup>
    import { computed, onMounted, ref, watch } from 'vue';
    import { Footprints, Info, RefreshCcw, User } from 'lucide-vue-next';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { DataTableEmpty } from '@/components/ui/data-table';
    import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
    import { Input } from '@/components/ui/input';
    import { ScrollArea } from '@/components/ui/scroll-area';
    import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { useRoute } from 'vue-router';

    import { useUserDisplay } from '@/composables/useUserDisplay';
    import { showUserDialog } from '@/coordinators/userCoordinator';
    import { showWorldDialog } from '@/coordinators/worldCoordinator';
    import { database } from '@/services/database';
    import { useFriendStore } from '@/stores';
    import {
        buildFootprintVisits,
        footprintByDay,
        footprintGroupStats,
        footprintHeatmap,
        footprintTimeline,
        formatDateFilter,
        summarizeFootprint,
        timeAgo,
        timeToText,
        topFootprintWorlds
    } from '@/shared/utils';

    const { t } = useI18n();
    const route = useRoute();
    const { friends } = storeToRefs(useFriendStore());
    const { userImage, userStatusClass } = useUserDisplay();

    const DAY_MS = 24 * 60 * 60 * 1000;
    const rangeOptions = [7, 30, 90, 0];

    const candidates = ref([]);
    const search = ref('');
    const selectedId = ref('');
    const rangeDays = ref(30);
    const loading = ref(false);
    const visits = ref([]);

    const filteredCandidates = computed(() => {
        const needle = search.value.trim().toLowerCase();
        if (!needle) {
            return candidates.value;
        }
        return candidates.value.filter(
            (candidate) =>
                candidate.displayName.toLowerCase().includes(needle) || candidate.userId.toLowerCase().includes(needle)
        );
    });

    const selectedName = computed(() => {
        const candidate = candidates.value.find((entry) => entry.userId === selectedId.value);
        if (candidate) {
            return candidate.displayName;
        }
        const friend = friends.value.get(selectedId.value);
        return friend?.ref?.displayName || friend?.name || selectedId.value;
    });

    const summary = computed(() => summarizeFootprint(visits.value));

    const topWorlds = computed(() => topFootprintWorlds(visits.value, 10));

    const heatmap = computed(() => footprintHeatmap(visits.value));

    const groupStats = computed(() => footprintGroupStats(visits.value));

    const timelineDays = computed(() => footprintByDay(footprintTimeline(visits.value, 80)));

    const weekdayLabels = computed(() => {
        const labels = [];
        // 2026-01-04 is a Monday; index by getDay() (0 = Sunday)
        for (let day = 0; day < 7; day++) {
            labels.push(new Date(2026, 0, 4 + day).toLocaleDateString(undefined, { weekday: 'short' }));
        }
        // shift so index 0 lines up with Sunday
        return [labels[6], ...labels.slice(0, 6)];
    });

    const statCards = computed(() => {
        const stats = summary.value;
        const cards = [
            {
                label: t('view.charts.friend_footprints.stats.worlds'),
                value: String(stats.worlds),
                hint: stats.privateVisits
                    ? t('view.charts.friend_footprints.stats.private_rooms', { count: stats.privateVisits })
                    : ''
            },
            {
                label: t('view.charts.friend_footprints.stats.visits'),
                value: String(stats.visits),
                hint: stats.instanceHops
                    ? t('view.charts.friend_footprints.stats.instance_hops', { count: stats.instanceHops })
                    : ''
            },
            {
                label: t('view.charts.friend_footprints.stats.duration'),
                value: stats.durationMs ? timeToText(stats.durationMs, false) : '—',
                hint: t('view.charts.friend_footprints.stats.duration_hint')
            },
            {
                label: t('view.charts.friend_footprints.stats.last_seen'),
                value: stats.lastAt ? timeAgo(stats.lastAt) : '—',
                hint: stats.lastAt ? formatDateFilter(stats.lastAt, 'long') : '',
                title: stats.lastAt ? formatDateFilter(stats.lastAt, 'long') : ''
            }
        ];
        if (topWorlds.value.length) {
            cards.push({
                label: t('view.charts.friend_footprints.stats.favourite'),
                value: worldLabel(topWorlds.value[0]),
                hint: t('view.charts.friend_footprints.unit.times', { count: topWorlds.value[0].visits }),
                title: worldLabel(topWorlds.value[0])
            });
        }
        cards.push({
            label: t('view.charts.friend_footprints.stats.active_days'),
            value: t('view.charts.friend_footprints.unit.days', { count: stats.activeDays }),
            hint: stats.newWorlds ? t('view.charts.friend_footprints.stats.new_worlds', { count: stats.newWorlds }) : ''
        });
        return cards;
    });

    /**
     * @param {object} world
     * @returns {string}
     */
    function worldLabel(world) {
        if (world.name) {
            return world.name;
        }
        if (world.kind === 'private') {
            return t('view.charts.friend_footprints.kind.private');
        }
        return t('view.charts.friend_footprints.kind.hidden');
    }

    /**
     * @param {number} count
     * @returns {string}
     */
    function heatStyle(count) {
        const ratio = Math.min(1, count / heatmap.value.max);
        return `background-color: color-mix(in oklab, var(--primary) ${Math.round(18 + ratio * 82)}%, transparent)`;
    }

    /**
     * @param {number} timestamp
     * @returns {string}
     */
    function formatHour(timestamp) {
        return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

    function handleRangeChange(value) {
        if (!value) {
            return;
        }
        rangeDays.value = parseInt(value, 10);
        loadVisits();
    }

    function selectFriend(userId) {
        if (selectedId.value === userId) {
            return;
        }
        selectedId.value = userId;
        loadVisits();
    }

    async function loadCandidates() {
        try {
            const since = rangeDays.value ? new Date(Date.now() - rangeDays.value * DAY_MS).toISOString() : '';
            const rows = await database.getPlayersWithGpsHistory(since);
            candidates.value = rows.map((row) => {
                const friend = friends.value.get(row.userId);
                return {
                    ...row,
                    user: friend?.ref || { id: row.userId, displayName: row.displayName },
                    displayName: friend?.ref?.displayName || friend?.name || row.displayName || row.userId
                };
            });
        } catch (error) {
            console.error('Failed to load footprint candidates', error);
            candidates.value = [];
        }
    }

    async function loadVisits() {
        const userId = selectedId.value;
        if (!userId) {
            visits.value = [];
            return;
        }
        loading.value = true;
        try {
            const since = rangeDays.value ? new Date(Date.now() - rangeDays.value * DAY_MS).toISOString() : '';
            const rows = await database.getGpsRowsForUserId(userId, since);
            // the dialog may have moved on to another friend while we waited
            if (selectedId.value !== userId) {
                return;
            }
            visits.value = buildFootprintVisits(rows);
        } catch (error) {
            console.error('Failed to load footprint', error);
            if (selectedId.value === userId) {
                visits.value = [];
            }
        } finally {
            if (selectedId.value === userId) {
                loading.value = false;
            }
        }
    }

    watch(
        () => friends.value.size,
        () => {
            if (!candidates.value.length) {
                loadCandidates();
            }
        }
    );

    onMounted(async () => {
        await loadCandidates();
        const wanted = String(route.query.user || '');
        if (wanted && wanted !== selectedId.value) {
            selectFriend(wanted);
            return;
        }
        if (!selectedId.value && candidates.value.length) {
            selectedId.value = candidates.value[0].userId;
            loadVisits();
        }
    });

    // arriving here from another player's profile while the page is already mounted
    watch(
        () => route.query.user,
        (value) => {
            const wanted = String(value || '');
            if (wanted && wanted !== selectedId.value) {
                selectFriend(wanted);
            }
        }
    );
</script>
