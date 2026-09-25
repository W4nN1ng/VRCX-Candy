<template>
    <div id="chart" class="x-container">
        <div class="h-[calc(100vh-96px)] min-h-0 overflow-y-auto px-3 pb-8 pt-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                    <Users class="size-4 shrink-0 text-muted-foreground" />
                    <span class="truncate text-sm font-medium">{{ t('view.charts.friend_meetings.header') }}</span>
                    <HoverCard>
                        <HoverCardTrigger as-child>
                            <Info class="size-3.5 shrink-0 cursor-pointer opacity-70" />
                        </HoverCardTrigger>
                        <HoverCardContent align="start" class="w-80 text-xs leading-relaxed">
                            {{ t('view.charts.friend_meetings.tips.coverage') }}
                            <template v-if="record.firstAt">
                                <br />
                                {{
                                    t('view.charts.friend_meetings.tips.first_record', {
                                        date: formatDateFilter(record.firstAt, 'long')
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
                                ? t(`view.charts.friend_meetings.period.days_${option}`)
                                : t('view.charts.friend_meetings.period.all')
                        }}
                    </ToggleGroupItem>
                </ToggleGroup>
            </div>

            <div v-if="loading" class="mt-[100px] flex justify-center">
                <RefreshCcw class="size-6 animate-spin text-muted-foreground" />
            </div>

            <div
                v-else-if="!rangeMeetings.length"
                class="mt-6 rounded-xl border border-dashed border-muted-foreground/30 p-6">
                <span class="text-xs text-muted-foreground">
                    {{ t('view.charts.friend_meetings.empty') }}
                </span>
            </div>

            <template v-else>
                <div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div v-for="card in statCards" :key="card.label" class="rounded-xl border p-3">
                        <div class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {{ card.label }}
                        </div>
                        <div class="mt-1 truncate text-lg font-medium" :title="card.title || ''">{{ card.value }}</div>
                        <div v-if="card.hint" class="truncate text-[11px] text-muted-foreground">{{ card.hint }}</div>
                    </div>
                </div>

                <section class="mt-3 rounded-xl border p-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {{ t('view.charts.friend_meetings.section.frequency') }}
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] text-muted-foreground">{{ bucketUnitLabel }}</span>
                            <ToggleGroup
                                variant="outline"
                                type="single"
                                size="sm"
                                :model-value="metric"
                                @update:modelValue="handleMetricChange">
                                <ToggleGroupItem value="outings">{{
                                    t('view.charts.friend_meetings.metric.outings')
                                }}</ToggleGroupItem>
                                <ToggleGroupItem value="meetings">{{
                                    t('view.charts.friend_meetings.metric.meetings')
                                }}</ToggleGroupItem>
                                <ToggleGroupItem value="days">{{
                                    t('view.charts.friend_meetings.metric.days')
                                }}</ToggleGroupItem>
                                <ToggleGroupItem value="meetingMs">{{
                                    t('view.charts.friend_meetings.metric.hours')
                                }}</ToggleGroupItem>
                            </ToggleGroup>
                        </div>
                    </div>

                    <div ref="chartEl" class="mt-2 h-[260px] w-full"></div>

                    <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <button
                            v-for="line in chartLines"
                            :key="line.userId || 'total'"
                            type="button"
                            class="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:underline"
                            @click="focusFriend(line.userId)">
                            <span class="size-2 rounded-full" :style="{ background: line.colour }"></span>
                            {{ line.name }}
                        </button>
                    </div>
                    <div class="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {{
                            t('view.charts.friend_meetings.tips.metric', { metric: metricName, unit: bucketUnitLabel })
                        }}
                    </div>
                </section>

                <section class="mt-3 rounded-xl border p-3">
                    <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {{ t('view.charts.friend_meetings.section.ranking') }}
                    </div>
                    <div
                        v-for="(row, index) in ranking"
                        :key="row.userId"
                        class="x-hover-list flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                        :class="row.userId === focusId ? 'bg-accent' : ''">
                        <span class="w-5 flex-none text-center text-[11px] text-muted-foreground">{{ index + 1 }}</span>
                        <div
                            class="relative inline-block size-9 flex-none"
                            :class="userStatusClass(friendRecord(row.userId))">
                            <Avatar class="size-9">
                                <AvatarImage :src="userImage(friendRecord(row.userId), true)" class="object-cover" />
                                <AvatarFallback><User class="size-4 text-muted-foreground" /></AvatarFallback>
                            </Avatar>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2">
                                <span
                                    class="cursor-pointer truncate text-[13px] font-medium hover:underline"
                                    :style="{ color: friendRecord(row.userId)?.$userColour }"
                                    @click="showUserDialog(row.userId)">
                                    {{ displayName(row) }}
                                </span>
                                <span v-if="row.userId === focusId" class="flex-none text-[10px] text-muted-foreground">
                                    {{ t('view.charts.friend_meetings.state.focused') }}
                                </span>
                            </div>
                            <div class="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                    class="h-full rounded-full bg-primary"
                                    :style="{ width: `${Math.round(row.share * 100)}%` }"></div>
                            </div>
                            <div class="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {{
                                    t('view.charts.friend_meetings.row.detail', {
                                        outings: row.outings,
                                        meetings: row.meetings,
                                        hours: Math.round(row.meetingMs / HOUR_MS),
                                        worlds: row.worldCount,
                                        days: row.dayCount
                                    })
                                }}
                            </div>
                        </div>
                        <div class="flex-none text-right">
                            <div class="text-[13px] font-medium">{{ row.valueLabel }}</div>
                            <div class="text-[11px] text-muted-foreground">{{ Math.round(row.share * 100) }}%</div>
                        </div>
                        <button
                            type="button"
                            class="x-hover-list flex-none rounded-md border px-2 py-1 text-[11px] text-muted-foreground"
                            @click="focusFriend(row.userId)">
                            {{
                                row.userId === focusId
                                    ? t('view.charts.friend_meetings.state.clear')
                                    : t('view.charts.friend_meetings.state.focus')
                            }}
                        </button>
                    </div>
                </section>

                <div class="mt-3 grid gap-3 lg:grid-cols-2">
                    <section class="rounded-xl border p-3">
                        <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {{
                                focusId
                                    ? t('view.charts.friend_meetings.section.worlds_one')
                                    : t('view.charts.friend_meetings.section.worlds')
                            }}
                        </div>
                        <div v-if="!worldBoard.length" class="py-4 text-xs text-muted-foreground">
                            {{ t('view.charts.friend_meetings.empty_section') }}
                        </div>
                        <button
                            v-for="(world, index) in worldBoard"
                            :key="world.worldId || index"
                            type="button"
                            class="x-hover-list flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left"
                            @click="world.location && showWorldDialog(world.location)">
                            <span class="w-5 flex-none text-center text-[11px] text-muted-foreground"
                                >#{{ index + 1 }}</span
                            >
                            <div class="min-w-0 flex-1">
                                <div class="truncate text-[13px]">
                                    {{ world.worldName || t('view.charts.friend_meetings.kind.world') }}
                                </div>
                                <div class="truncate text-[11px] text-muted-foreground">
                                    {{
                                        t('view.charts.friend_meetings.world.detail', {
                                            meetings: world.meetings,
                                            hours: Math.round(world.meetingMs / HOUR_MS)
                                        })
                                    }}
                                    <template v-if="!focusId">
                                        ·
                                        {{
                                            t('view.charts.friend_meetings.world.with', {
                                                names: partnerNames(world.partners)
                                            })
                                        }}
                                    </template>
                                </div>
                            </div>
                            <div class="h-1 w-16 flex-none overflow-hidden rounded-full bg-muted">
                                <div
                                    class="h-full rounded-full bg-primary"
                                    :style="{
                                        width: `${Math.round((world.meetingMs / worldBoard[0].meetingMs) * 100)}%`
                                    }"></div>
                            </div>
                        </button>
                    </section>

                    <section class="rounded-xl border p-3">
                        <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {{ t('view.charts.friend_meetings.section.heatmap') }}
                        </div>
                        <div class="grid gap-1" :style="{ gridTemplateColumns: 'auto repeat(24, minmax(0, 1fr))' }">
                            <span></span>
                            <span
                                v-for="hour in 24"
                                :key="`h${hour}`"
                                class="text-center text-[9px] text-muted-foreground">
                                {{ (hour - 1) % 6 === 0 ? hour - 1 : '' }}
                            </span>
                            <template v-for="(row, day) in heatmap.grid" :key="`d${day}`">
                                <span class="mr-1 text-right text-[10px] leading-4 text-muted-foreground">
                                    {{ weekdayLabels[day] }}
                                </span>
                                <span
                                    v-for="(value, hour) in row"
                                    :key="`c${day}-${hour}`"
                                    class="aspect-square rounded-[2px]"
                                    :style="heatStyle(value)"
                                    :title="heatTitle(day, hour, value)"></span>
                            </template>
                        </div>
                        <div class="mt-2 text-[11px] text-muted-foreground">
                            {{
                                heatmap.peak
                                    ? t('view.charts.friend_meetings.heatmap.peak', {
                                          day: weekdayLabels[heatmap.peak.day],
                                          hour: heatmap.peak.hour,
                                          minutes: heatmap.peak.value
                                      })
                                    : t('view.charts.friend_meetings.empty_section')
                            }}
                        </div>
                    </section>
                </div>

                <div class="mt-3 grid gap-3 lg:grid-cols-2">
                    <section class="rounded-xl border p-3">
                        <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {{ t('view.charts.friend_meetings.section.recent') }}
                        </div>
                        <div v-if="!recentOutings.length" class="py-4 text-xs text-muted-foreground">
                            {{ t('view.charts.friend_meetings.empty_section') }}
                        </div>
                        <div
                            v-for="outing in recentOutings"
                            :key="`${outing.userId}-${outing.startAt}`"
                            class="flex items-start gap-2 border-b border-muted-foreground/15 py-1.5 last:border-0">
                            <div class="min-w-0 flex-1">
                                <div class="truncate text-[13px]">
                                    <span
                                        class="cursor-pointer hover:underline"
                                        :style="{ color: friendRecord(outing.userId)?.$userColour }"
                                        @click="showUserDialog(outing.userId)">
                                        {{ outing.displayName }}
                                    </span>
                                    <span class="text-muted-foreground">
                                        · {{ outing.worldName || t('view.charts.friend_meetings.kind.world') }}
                                    </span>
                                </div>
                                <div class="truncate text-[11px] text-muted-foreground">
                                    {{ formatDateFilter(outing.startAt, 'long') }} ·
                                    {{
                                        t('view.charts.friend_meetings.outing.detail', {
                                            hours: Math.round(outing.durationMs / HOUR_MS),
                                            stops: outing.meetings,
                                            worlds: outing.worldIds.size
                                        })
                                    }}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="rounded-xl border p-3">
                        <div class="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {{ t('view.charts.friend_meetings.section.stale') }}
                        </div>
                        <div v-if="!staleRows.length" class="py-4 text-xs text-muted-foreground">
                            {{ t('view.charts.friend_meetings.empty_section') }}
                        </div>
                        <div v-for="row in staleRows" :key="row.userId" class="flex items-center gap-2 py-1.5">
                            <div
                                class="relative inline-block size-7 flex-none"
                                :class="userStatusClass(friendRecord(row.userId))">
                                <Avatar class="size-7">
                                    <AvatarImage
                                        :src="userImage(friendRecord(row.userId), true)"
                                        class="object-cover" />
                                    <AvatarFallback><User class="size-3 text-muted-foreground" /></AvatarFallback>
                                </Avatar>
                            </div>
                            <div class="min-w-0 flex-1">
                                <span
                                    class="cursor-pointer truncate text-[13px] hover:underline"
                                    :style="{ color: friendRecord(row.userId)?.$userColour }"
                                    @click="showUserDialog(row.userId)">
                                    {{ row.name }}
                                </span>
                                <div class="truncate text-[11px] text-muted-foreground">
                                    {{
                                        t('view.charts.friend_meetings.stale.last', {
                                            days: row.daysAgo,
                                            meetings: row.meetings
                                        })
                                    }}
                                </div>
                            </div>
                        </div>
                        <div
                            v-if="neverMetCount"
                            class="mt-2 border-t border-muted-foreground/15 pt-2 text-[11px] text-muted-foreground">
                            {{ t('view.charts.friend_meetings.stale.never_met', { count: neverMetCount }) }}
                        </div>
                    </section>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
    import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { Info, RefreshCcw, User, Users } from 'lucide-vue-next';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
    import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

    import { showUserDialog } from '@/coordinators/userCoordinator';
    import { showWorldDialog } from '@/coordinators/worldCoordinator';
    import { useAppearanceSettingsStore, useFriendStore } from '@/stores';
    import { useUserDisplay } from '@/composables/useUserDisplay';
    import { database } from '@/services/database';
    import {
        buildFriendStays,
        buildMeetings,
        buildOutings,
        formatDateFilter,
        loadEcharts,
        meetingFrequency,
        meetingGaps,
        meetingHeatmap,
        meetingRanking,
        meetingWorldBoard,
        summarizeMeetings,
        timeAgo,
        timeToText
    } from '@/shared/utils';

    defineOptions({ name: 'ChartsFriendMeetings' });

    const { t } = useI18n();
    const { userImage, userStatusClass } = useUserDisplay();
    const { friends } = storeToRefs(useFriendStore());
    const { isDarkMode } = storeToRefs(useAppearanceSettingsStore());

    const HOUR_MS = 60 * 60 * 1000;
    const DAY_MS = 24 * HOUR_MS;

    const rangeOptions = [7, 30, 90, 365, 730, 0];
    const rangeDays = ref(30);
    const metric = ref('outings');
    const focusId = ref('');
    const loading = ref(false);
    const meetings = ref([]);
    const outings = ref([]);

    let chart = null;
    let resizeObserver = null;
    const chartEl = ref(null);

    const weekdayLabels = computed(() => {
        // Monday first, matching the heatmap grid.
        return [...Array(7)].map((_, index) => {
            const date = new Date(2026, 0, 5 + index);
            return date.toLocaleDateString(undefined, { weekday: 'short' });
        });
    });

    /** The roster, read lazily so the two-pass friend load cannot freeze it. */
    const friendIds = computed(() => new Set(friends.value.keys()));

    /** Everything inside the chosen range, so the range buttons change the whole page. */
    const rangeMeetings = computed(() => {
        if (!rangeDays.value) {
            return meetings.value;
        }
        const cutoff = Date.now() - rangeDays.value * DAY_MS;
        return meetings.value.filter((meeting) => meeting.startAt >= cutoff);
    });

    const rangeOutings = computed(() => {
        if (!rangeDays.value) {
            return outings.value;
        }
        const cutoff = Date.now() - rangeDays.value * DAY_MS;
        return outings.value.filter((outing) => outing.startAt >= cutoff);
    });

    const summary = computed(() => summarizeMeetings(rangeMeetings.value, rangeOutings.value));

    const record = computed(() => {
        const list = meetings.value;
        if (!list.length) {
            return { firstAt: 0, lastAt: 0 };
        }
        return { firstAt: list[0].startAt, lastAt: list[list.length - 1].endAt };
    });

    const ranking = computed(() =>
        meetingRanking(summary.value, { metric: metric.value, limit: 50 }).map((row) => ({
            ...row,
            valueLabel: formatMetric(row.value, metric.value)
        }))
    );

    const focusMeetings = computed(() =>
        focusId.value ? rangeMeetings.value.filter((meeting) => meeting.userId === focusId.value) : rangeMeetings.value
    );

    const worldBoard = computed(() => meetingWorldBoard(focusMeetings.value, { limit: 10 }));

    const heatmap = computed(() => meetingHeatmap(focusMeetings.value));

    const recentOutings = computed(() => {
        const list = focusId.value
            ? rangeOutings.value.filter((outing) => outing.userId === focusId.value)
            : rangeOutings.value;
        return [...list].sort((a, b) => b.startAt - a.startAt).slice(0, 12);
    });

    const gaps = computed(() => meetingGaps(summary.value, friendIds.value));

    const staleRows = computed(() => gaps.value.stale.filter((row) => row.daysAgo >= 3).slice(0, 10));

    const neverMetCount = computed(() => gaps.value.neverMet.length);

    const frequency = computed(() =>
        meetingFrequency(rangeOutings.value, { rangeDays: rangeDays.value, metric: metric.value })
    );

    const bucketUnitLabel = computed(() => t(`view.charts.friend_meetings.bucket.${frequency.value.unit}`));

    const metricName = computed(() => t(`view.charts.friend_meetings.metric.${metric.value}`));

    const statCards = computed(() => {
        const stats = summary.value;
        const top = ranking.value[0];
        return [
            {
                label: t('view.charts.friend_meetings.stats.outings'),
                value: stats.outings,
                hint: t('view.charts.friend_meetings.stats.meetings_hint', { count: stats.meetings })
            },
            {
                label: t('view.charts.friend_meetings.stats.hours'),
                value: timeToText(stats.meetingMs),
                hint: t('view.charts.friend_meetings.stats.per_outing', {
                    value: stats.outings ? timeToText(Math.round(stats.meetingMs / stats.outings)) : '—'
                })
            },
            {
                label: t('view.charts.friend_meetings.stats.partners'),
                value: stats.partners,
                hint: t('view.charts.friend_meetings.stats.of_friends', { count: friendIds.value.size })
            },
            {
                label: t('view.charts.friend_meetings.stats.top'),
                value: top ? displayName(top) : '—',
                hint: top ? formatMetric(top.value, metric.value) : '',
                title: top ? displayName(top) : ''
            }
        ];
    });

    /**
     * @param {string} userId
     * @returns {object | null} The live friend record, or null while it has not arrived
     */
    function friendRecord(userId) {
        return friends.value.get(userId)?.ref || null;
    }

    /**
     * @param {{ userId: string; name?: string; displayName?: string }} row
     * @returns {string}
     */
    function displayName(row) {
        return friendRecord(row.userId)?.displayName || row.name || row.displayName || row.userId;
    }

    /**
     * @param {number} value
     * @param {string} unit
     * @returns {string}
     */
    function formatMetric(value, unit) {
        if (unit === 'meetingMs') {
            return timeToText(value * HOUR_MS);
        }
        return String(value);
    }

    /**
     * @param {object[]} partners
     * @returns {string}
     */
    function partnerNames(partners) {
        const names = (partners || []).map((partner) => displayName(partner));
        if (names.length <= 3) {
            return names.join('、') || '—';
        }
        return t('view.charts.friend_meetings.world.and_more', {
            names: names.slice(0, 3).join('、'),
            count: names.length - 3
        });
    }

    /**
     * @param {number} minutes
     * @returns {string} CSS for one heatmap cell
     */
    function heatStyle(minutes) {
        if (!minutes) {
            return 'background-color: color-mix(in oklab, var(--muted) 45%, transparent)';
        }
        const ratio = Math.min(1, minutes / Math.max(1, heatmap.value.maxMinutes));
        return `background-color: color-mix(in oklab, var(--primary) ${Math.round(18 + ratio * 82)}%, transparent)`;
    }

    /**
     * @param {number} day
     * @param {number} hour
     * @param {number} minutes
     * @returns {string}
     */
    function heatTitle(day, hour, minutes) {
        return `${weekdayLabels.value[day]} ${hour}:00 · ${minutes} ${t('view.charts.friend_meetings.unit.minutes')}`;
    }

    /**
     * One line for the whole range plus one per friend worth drawing.
     *
     * Five is where the legend stops being readable and the colours stop being
     * tellable apart; the ranking list under it is where the rest live.
     */ const chartLines = computed(() => {
        const lines = [{ userId: '', name: t('view.charts.friend_meetings.line.total'), colour: '#9aa0a6' }];
        if (focusId.value) {
            const picked = ranking.value.find((row) => row.userId === focusId.value);
            if (picked) {
                lines.push({ userId: picked.userId, name: displayName(picked), colour: pickColour(0) });
            }
            return lines;
        }
        for (let index = 0; index < Math.min(5, ranking.value.length); index++) {
            const row = ranking.value[index];
            lines.push({ userId: row.userId, name: displayName(row), colour: pickColour(index) });
        }
        return lines;
    });

    const LINE_COLOURS = ['#2563eb', '#e97c03', '#2ed319', '#c80928', '#a855f7'];

    /**
     * @param {number} index
     * @returns {string}
     */
    function pickColour(index) {
        return LINE_COLOURS[index % LINE_COLOURS.length];
    }

    async function loadData() {
        loading.value = true;
        try {
            const since = rangeDays.value ? new Date(Date.now() - rangeDays.value * DAY_MS).toISOString() : '';
            const [presenceRows, selfSegments] = await Promise.all([
                database.getFriendPresenceRows(since),
                database.getSelfLocationSegments(since)
            ]);
            const stays = buildFriendStays(presenceRows, friendIds.value);
            const all = buildMeetings(selfSegments, stays);
            meetings.value = all;
            outings.value = buildOutings(all);
        } catch (error) {
            console.error('Failed to load meeting history', error);
            meetings.value = [];
            outings.value = [];
        } finally {
            loading.value = false;
        }
        renderChart();
    }

    function handleRangeChange(value) {
        if (!value && value !== '0') {
            return;
        }
        const next = parseInt(value, 10);
        if (next === rangeDays.value) {
            return;
        }
        rangeDays.value = next;
        loadData();
    }

    function handleMetricChange(value) {
        if (!value) {
            return;
        }
        metric.value = value;
    }

    /**
     * Focus the whole page on one friend. Clicking the same friend again clears it.
     *
     * @param {string} userId
     */
    function focusFriend(userId) {
        focusId.value = focusId.value === userId ? '' : userId;
    }

    async function renderChart() {
        await nextTick();
        const dom = chartEl.value;
        if (!dom || !rangeMeetings.value.length) {
            disposeChart();
            return;
        }
        const echarts = await loadEcharts();
        if (chart && chart.getDom() !== dom) {
            disposeChart();
        }
        if (!chart) {
            chart = echarts.init(dom, isDarkMode.value ? 'dark' : null);
            resizeObserver = new ResizeObserver(() => {
                chart?.resize();
            });
            resizeObserver.observe(dom);
        }
        chart.setOption(buildOption(), { notMerge: true });
    }

    /**
     * @returns {object} Chart option
     */
    function buildOption() {
        const series = chartLines.value.map((line) => {
            const list = line.userId
                ? rangeOutings.value.filter((outing) => outing.userId === line.userId)
                : rangeOutings.value;
            const data = meetingFrequency(list, { rangeDays: rangeDays.value, metric: metric.value });
            return {
                name: line.name,
                type: 'line',
                smooth: false,
                symbol: 'circle',
                symbolSize: 5,
                showSymbol: data.points.length <= 60,
                itemStyle: { color: line.colour },
                lineStyle: { width: line.userId ? 2 : 1.5, type: line.userId ? 'solid' : 'dashed' },
                data: data.points.map((point) => point.value)
            };
        });
        const labels = frequency.value.points.map((point) => point.label);
        return {
            animation: false,
            grid: { top: 24, right: 12, bottom: 24, left: 40 },
            tooltip: {
                trigger: 'axis',
                confine: true
            },
            legend: { show: false },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: labels,
                axisLabel: {
                    fontSize: 10,
                    interval: (index, value) => {
                        void value;
                        const step = Math.max(1, Math.ceil(labels.length / 9));
                        return index % step === 0;
                    }
                }
            },
            yAxis: {
                type: 'value',
                minInterval: 1,
                axisLabel: { fontSize: 10 }
            },
            series
        };
    }

    function disposeChart() {
        resizeObserver?.disconnect();
        resizeObserver = null;
        chart?.dispose();
        chart = null;
    }

    watch([metric, focusId, rangeMeetings], renderChart);
    watch(isDarkMode, renderChart);

    onMounted(loadData);
    onBeforeUnmount(disposeChart);
</script>
