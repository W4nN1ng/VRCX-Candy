<template>
    <div id="chart" class="x-container">
        <div class="flex h-[calc(100vh-96px)] min-h-0 gap-3 pt-3">
            <!-- 左栏：从好友里挑一个 -->
            <aside class="flex w-72 flex-none flex-col gap-2 border-r border-muted-foreground/20 pr-3 min-h-0">
                <div class="flex items-center gap-2">
                    <Lightbulb class="size-4 shrink-0 text-muted-foreground" />
                    <span class="truncate text-sm font-medium">{{ t('view.charts.friend_status_lights.header') }}</span>
                    <HoverCard>
                        <HoverCardTrigger as-child>
                            <Info class="size-3.5 shrink-0 cursor-pointer opacity-70" />
                        </HoverCardTrigger>
                        <HoverCardContent side="bottom" align="start" class="w-80 text-xs">
                            {{ t('view.charts.friend_status_lights.tips.coverage') }}
                        </HoverCardContent>
                    </HoverCard>
                </div>

                <Input v-model="search" :placeholder="t('view.charts.friend_status_lights.search_placeholder')" />

                <ScrollArea class="min-h-0 flex-1 pr-1">
                    <div v-if="!filteredCandidates.length" class="px-2 py-6 text-xs text-muted-foreground">
                        {{ t('view.charts.friend_status_lights.no_candidates') }}
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
                                {{
                                    t('view.charts.friend_status_lights.candidate_changes', {
                                        count: candidate.changes
                                    })
                                }}
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
                            <ToggleGroup
                                variant="outline"
                                type="single"
                                :model-value="String(rangeDays)"
                                @update:modelValue="handleRangeChange">
                                <ToggleGroupItem v-for="option in rangeOptions" :key="option" :value="String(option)">
                                    {{
                                        option
                                            ? t(`view.charts.friend_status_lights.period.days_${option}`)
                                            : t('view.charts.friend_status_lights.period.all')
                                    }}
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </div>

                        <div class="flex items-center gap-2">
                            <TooltipWrapper side="left" :content="t('view.charts.friend_status_lights.tips.inferred')">
                                <span class="cursor-help text-[11px] text-muted-foreground">
                                    {{ t('view.charts.friend_status_lights.toggle.inferred') }}
                                </span>
                            </TooltipWrapper>
                            <Switch v-model="includeInferred" />
                        </div>
                    </div>

                    <div v-if="loading" class="mt-[100px] flex justify-center">
                        <RefreshCcw class="size-6 animate-spin text-muted-foreground" />
                    </div>

                    <div
                        v-else-if="!intervals.length"
                        class="rounded-xl border border-dashed border-muted-foreground/30 p-6">
                        <span class="text-xs text-muted-foreground">
                            {{ t('view.charts.friend_status_lights.empty') }}
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

                        <!-- 四灯占比 -->
                        <section class="rounded-xl border p-3">
                            <div class="mb-2 flex items-center justify-between gap-2">
                                <span class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                    {{ t('view.charts.friend_status_lights.section.shares') }}
                                </span>
                                <HoverCard>
                                    <HoverCardTrigger as-child>
                                        <Info class="size-3.5 shrink-0 cursor-pointer opacity-70" />
                                    </HoverCardTrigger>
                                    <HoverCardContent side="left" align="end" class="w-80 text-xs">
                                        {{ t('view.charts.friend_status_lights.tips.shares') }}
                                    </HoverCardContent>
                                </HoverCard>
                            </div>

                            <div
                                v-if="shareTotalMs"
                                class="flex h-6 w-full overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.05]">
                                <TooltipWrapper
                                    v-for="row in visibleShares"
                                    :key="row.light"
                                    :content="`${lightLabel(row.light)} · ${timeToText(row.ms, false)}`">
                                    <div
                                        class="h-full transition-all duration-500"
                                        :style="{
                                            width: `${row.share * 100}%`,
                                            backgroundColor: row.colour,
                                            opacity: row.onlyInferred ? 0.45 : 1
                                        }"></div>
                                </TooltipWrapper>
                            </div>

                            <div class="mt-3 space-y-1.5">
                                <div v-for="row in shareRows" :key="row.light" class="flex items-center gap-2 text-xs">
                                    <i class="x-user-status shrink-0" :class="row.tone"></i>
                                    <span class="w-24 shrink-0 truncate">{{ lightLabel(row.light) }}</span>
                                    <div
                                        class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                                        <div
                                            class="h-full rounded-full transition-all duration-500"
                                            :style="{
                                                width: `${Math.max(row.share ? 2 : 0, row.share * 100)}%`,
                                                backgroundColor: row.colour,
                                                opacity: row.onlyInferred ? 0.45 : 1
                                            }"></div>
                                    </div>
                                    <span class="w-12 shrink-0 text-right font-mono text-[11px]">
                                        {{ row.ms ? `${Math.round(row.share * 100)}%` : '—' }}
                                    </span>
                                    <span class="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                                        {{ row.ms ? timeToText(row.ms, false) : '—' }}
                                    </span>
                                    <span class="w-20 shrink-0 text-right text-[11px] text-muted-foreground">
                                        {{
                                            row.runs
                                                ? t('view.charts.friend_status_lights.row.average', {
                                                      duration: timeToText(row.averageMs, false)
                                                  })
                                                : '—'
                                        }}
                                    </span>
                                </div>
                            </div>

                            <div
                                class="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                                <span>
                                    {{ t('view.charts.friend_status_lights.bucket.unknown_online') }}
                                    <span class="font-medium text-foreground">{{
                                        shortDuration(summary.unknownOnlineMs)
                                    }}</span>
                                </span>
                                <span>
                                    {{ t('view.charts.friend_status_lights.bucket.offline') }}
                                    <span class="font-medium text-foreground">{{
                                        shortDuration(summary.offlineMs)
                                    }}</span>
                                </span>
                                <span>
                                    {{ t('view.charts.friend_status_lights.bucket.unrecorded') }}
                                    <span class="font-medium text-foreground">{{
                                        shortDuration(summary.unrecordedMs)
                                    }}</span>
                                </span>
                                <TooltipWrapper
                                    side="top"
                                    :content="t('view.charts.friend_status_lights.tips.buckets')">
                                    <Info class="size-3.5 cursor-help opacity-70" />
                                </TooltipWrapper>
                            </div>
                        </section>

                        <!-- 状态时间线 -->
                        <section class="rounded-xl border p-3">
                            <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {{ t('view.charts.friend_status_lights.section.timeline') }}
                            </div>

                            <div class="mb-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                                <span v-for="meta in lightMeta" :key="meta.light" class="flex items-center gap-1">
                                    <i class="x-user-status" :class="meta.tone"></i>
                                    {{ lightLabel(meta.light) }}
                                </span>
                                <span class="flex items-center gap-1">
                                    <i class="x-user-status offline"></i>
                                    {{ t('view.charts.friend_status_lights.state.offline') }}
                                </span>
                                <span class="flex items-center gap-1">
                                    <i class="x-user-status"></i>
                                    {{ t('view.charts.friend_status_lights.state.unknown') }}
                                </span>
                            </div>

                            <div v-for="day in timelineDays" :key="day.dateKey" class="mb-3 last:mb-0">
                                <div class="mb-1 flex items-baseline justify-between gap-2">
                                    <span class="text-[11px] font-medium">{{ formatDayLabel(day.dateKey) }}</span>
                                    <span class="text-[10px] text-muted-foreground">
                                        {{
                                            t('view.charts.friend_status_lights.timeline.recorded', {
                                                duration: shortDuration(day.observedMs)
                                            })
                                        }}
                                    </span>
                                </div>

                                <div
                                    class="relative h-3 w-full overflow-hidden rounded-[3px] bg-black/[0.05] dark:bg-white/[0.05]">
                                    <TooltipWrapper
                                        v-for="(segment, index) in day.segments"
                                        :key="index"
                                        :content="segmentTooltip(segment)">
                                        <div
                                            class="absolute top-0 h-full"
                                            :style="{
                                                ...segmentStyle(segment),
                                                backgroundColor: segmentColour(segment),
                                                opacity: segmentOpacity(segment)
                                            }"></div>
                                    </TooltipWrapper>
                                </div>

                                <div
                                    v-for="(segment, index) in dayLightSegments(day)"
                                    :key="index"
                                    class="flex items-center gap-2 py-0.5 pl-1">
                                    <span class="w-11 shrink-0 font-mono text-[11px] text-muted-foreground">
                                        {{ segment.continuesFrom ? '…' : formatTime(segment.startAt) }}
                                    </span>
                                    <i class="x-user-status shrink-0" :class="segment.tone"></i>
                                    <span class="w-24 shrink-0 truncate text-xs">{{ lightLabel(segment.light) }}</span>
                                    <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                                        {{ segment.description }}
                                    </span>
                                    <span class="shrink-0 text-[11px] text-muted-foreground/80">
                                        {{ timeToText(segment.durationMs, false)
                                        }}{{ segment.continuesInto ? '+' : '' }}
                                    </span>
                                </div>

                                <div
                                    v-if="!dayLightSegments(day).length"
                                    class="py-0.5 pl-1 text-[11px] text-muted-foreground">
                                    {{ t('view.charts.friend_status_lights.timeline.no_change') }}
                                </div>
                            </div>
                        </section>

                        <!-- 什么时段挂什么灯 -->
                        <section class="rounded-xl border p-3">
                            <div class="mb-2 flex items-center justify-between gap-2">
                                <span class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                    {{ t('view.charts.friend_status_lights.section.hours') }}
                                </span>
                                <span v-if="peakHour" class="text-[11px] text-muted-foreground">
                                    {{ t('view.charts.friend_status_lights.hours.peak', peakHour) }}
                                </span>
                            </div>

                            <div class="flex items-end gap-[2px] pl-1">
                                <div
                                    class="flex h-24 w-8 shrink-0 flex-col justify-between text-[9px] text-muted-foreground/70">
                                    <span>{{ axisTop }}</span>
                                    <span>0</span>
                                </div>
                                <div class="flex min-w-0 flex-1 items-end gap-[2px]">
                                    <TooltipWrapper
                                        v-for="(bucket, hour) in hours.hours"
                                        :key="hour"
                                        :content="hourTooltip(hour, bucket)">
                                        <div
                                            class="flex h-24 min-w-0 flex-1 flex-col-reverse overflow-hidden rounded-[2px] bg-black/[0.05] dark:bg-white/[0.05]">
                                            <div
                                                v-for="meta in lightMeta"
                                                :key="meta.light"
                                                :style="{
                                                    height: bucketHeight(bucket[meta.light]),
                                                    backgroundColor: meta.colour
                                                }"></div>
                                        </div>
                                    </TooltipWrapper>
                                </div>
                            </div>
                            <div class="mt-1 flex gap-[2px] pl-9">
                                <span
                                    v-for="hour in 24"
                                    :key="hour"
                                    class="min-w-0 flex-1 text-center text-[9px] text-muted-foreground/70">
                                    {{ (hour - 1) % 3 === 0 ? hour - 1 : '' }}
                                </span>
                            </div>
                        </section>

                        <!-- 文案改动 -->
                        <section class="rounded-xl border p-3">
                            <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {{ t('view.charts.friend_status_lights.section.descriptions') }}
                            </div>
                            <div class="mb-2 text-[11px] text-muted-foreground">
                                {{ t('view.charts.friend_status_lights.descriptions.hint') }}
                            </div>

                            <div v-if="!descriptionChanges.length" class="text-[11px] text-muted-foreground">
                                {{ t('view.charts.friend_status_lights.descriptions.empty') }}
                            </div>
                            <div
                                v-for="(change, index) in descriptionChanges"
                                :key="index"
                                class="flex items-start gap-2 border-l border-muted-foreground/20 py-1 pl-3">
                                <i class="x-user-status mt-1 shrink-0" :class="change.tone"></i>
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-baseline gap-2 text-[11px] text-muted-foreground">
                                        <span>{{ formatDateFilter(change.at, 'short') }}</span>
                                        <span>{{ formatTime(change.at) }}</span>
                                    </div>
                                    <div class="break-words text-xs">
                                        <span
                                            v-if="change.previousDescription"
                                            class="text-muted-foreground line-through">
                                            {{ change.previousDescription }}
                                        </span>
                                        <span v-else class="text-muted-foreground">—</span>
                                        <span class="mx-1 text-muted-foreground">→</span>
                                        <span>{{ change.description || '—' }}</span>
                                    </div>
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
    import { Info, Lightbulb, RefreshCcw, User } from 'lucide-vue-next';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { DataTableEmpty } from '@/components/ui/data-table';
    import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
    import { Input } from '@/components/ui/input';
    import { ScrollArea } from '@/components/ui/scroll-area';
    import { Switch } from '@/components/ui/switch';
    import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
    import { TooltipWrapper } from '@/components/ui/tooltip';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { useRoute } from 'vue-router';

    import { useUserDisplay } from '@/composables/useUserDisplay';
    import { showUserDialog } from '@/coordinators/userCoordinator';
    import { database } from '@/services/database';
    import { useFriendStore } from '@/stores';
    import {
        STATUS_LIGHT_META,
        buildStatusIntervals,
        formatDateFilter,
        statusDescriptionChanges,
        statusLightDays,
        statusLightHours,
        statusLightShares,
        summarizeStatusLights,
        timeAgo,
        timeToText
    } from '@/shared/utils';

    import '@/styles/status-icon.css';

    const { t } = useI18n();
    const route = useRoute();
    const { friends } = storeToRefs(useFriendStore());
    const { userImage, userStatusClass } = useUserDisplay();

    const DAY_MS = 24 * 60 * 60 * 1000;
    const MINUTES_PER_DAY = 24 * 60;
    const rangeOptions = [7, 30, 90, 0];
    const lightMeta = STATUS_LIGHT_META;

    const candidates = ref([]);
    const search = ref('');
    const selectedId = ref('');
    const rangeDays = ref(30);
    const loading = ref(false);
    const statusRows = ref([]);
    const presenceRows = ref([]);
    const includeInferred = ref(false);

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

    const intervals = computed(() => buildStatusIntervals(statusRows.value, presenceRows.value));

    const summary = computed(() => summarizeStatusLights(intervals.value));

    const shares = computed(() => statusLightShares(summary.value, { includeInferred: includeInferred.value }));

    const hours = computed(() => statusLightHours(intervals.value));

    const timelineDays = computed(() => statusLightDays(intervals.value, 14));

    const descriptionChanges = computed(() => statusDescriptionChanges(statusRows.value, { onlySameLight: true }));

    /** Rows carry the style tone and colour the two charts need. */
    const shareRows = computed(() =>
        shares.value.rows.map((row) => {
            const stats = summary.value.lights[row.light] || {};
            const meta = lightMeta.find((entry) => entry.light === row.light) || {};
            return {
                ...row,
                colour: meta.colour,
                tone: meta.tone,
                runs: stats.runs || 0,
                averageMs: stats.averageMs || 0,
                onlyInferred: includeInferred.value && row.ms > 0 && !(stats.observedMs > 0)
            };
        })
    );

    const visibleShares = computed(() => shareRows.value.filter((row) => row.ms > 0));

    const shareTotalMs = computed(() => shares.value.totalMs);

    const lastRecordAt = computed(() => {
        let newest = 0;
        for (const row of statusRows.value) {
            const at = Date.parse(row.created_at);
            if (at > newest) {
                newest = at;
            }
        }
        for (const row of presenceRows.value) {
            const at = Date.parse(row.created_at);
            if (at > newest) {
                newest = at;
            }
        }
        return newest;
    });

    const statCards = computed(() => {
        const stats = summary.value;
        const top = [...shareRows.value].sort((a, b) => b.ms - a.ms)[0];
        const longest = lightMeta
            .map((meta) => stats.lights[meta.light])
            .filter(Boolean)
            .sort((a, b) => b.longestMs - a.longestMs)[0];
        return [
            {
                label: t('view.charts.friend_status_lights.stats.recorded'),
                value: stats.observedMs ? timeToText(stats.observedMs, false) : '—',
                hint: stats.firstAt
                    ? t('view.charts.friend_status_lights.stats.since', {
                          date: formatDateFilter(stats.firstAt, 'short')
                      })
                    : ''
            },
            {
                label: t('view.charts.friend_status_lights.stats.days'),
                value: String(stats.days),
                hint: lastRecordAt.value
                    ? t('view.charts.friend_status_lights.stats.last_change', {
                          time: timeAgo(lastRecordAt.value)
                      })
                    : ''
            },
            {
                label: t('view.charts.friend_status_lights.stats.most_used'),
                value: top && top.ms ? lightLabel(top.light) : '—',
                hint:
                    top && top.ms
                        ? t('view.charts.friend_status_lights.stats.most_used_hint', {
                              percent: Math.round(top.share * 100)
                          })
                        : ''
            },
            {
                label: t('view.charts.friend_status_lights.stats.switches'),
                value: String(stats.switches),
                hint:
                    longest && longest.longestMs
                        ? t('view.charts.friend_status_lights.stats.longest_hint', {
                              light: lightLabel(longest.light),
                              duration: timeToText(longest.longestMs, false)
                          })
                        : ''
            }
        ];
    });

    const peakHour = computed(() => {
        let best = null;
        hours.value.hours.forEach((bucket, hour) => {
            const total = Object.values(bucket).reduce((sum, ms) => sum + ms, 0);
            if (total > 0 && (!best || total > best.ms)) {
                best = { hour, ms: total };
            }
        });
        return best ? { hour: best.hour, duration: shortDuration(best.ms) } : null;
    });

    const axisTop = computed(() => shortDuration(hours.value.maxHourMs));

    /**
     * @param {number} ms
     * @returns {string} A compact duration, or an em dash for nothing
     */
    function shortDuration(ms) {
        return ms ? timeToText(ms, false) : '—';
    }

    /**
     * @param {string} light
     * @returns {string}
     */
    function lightLabel(light) {
        const key = lightMeta.find((entry) => entry.light === light);
        return key ? t(`view.charts.friend_status_lights.light.${key.tone}`) : light;
    }

    /**
     * @param {number} timestamp
     * @returns {string} Hour and minute, honouring the clock format setting
     */
    function formatTime(timestamp) {
        return formatDateFilter(timestamp, 'time');
    }

    /**
     * @param {string} dateKey - YYYY-MM-DD as produced by the aggregation layer
     * @returns {string}
     */
    function formatDayLabel(dateKey) {
        return formatDateFilter(`${dateKey}T00:00:00`, 'long');
    }

    /**
     * @param {number} timestamp
     * @returns {number} Minutes since local midnight
     */
    function minutesOfDay(timestamp) {
        const date = new Date(timestamp);
        return date.getHours() * 60 + date.getMinutes();
    }

    /**
     * Place a segment inside its day band, clamped to the day it was split into.
     *
     * @param {object} segment
     * @returns {{ left: string; width: string }}
     */
    function segmentStyle(segment) {
        const start = segment.continuesFrom ? 0 : minutesOfDay(segment.startAt);
        const end = segment.continuesInto ? MINUTES_PER_DAY : minutesOfDay(segment.endAt);
        const span = Math.max(end - start, 1);
        return {
            left: `${(start / MINUTES_PER_DAY) * 100}%`,
            width: `${Math.max(0.25, (span / MINUTES_PER_DAY) * 100)}%`
        };
    }

    /**
     * @param {object} segment
     * @returns {string}
     */
    function segmentColour(segment) {
        if (!segment.online) {
            return 'var(--status-offline)';
        }
        const meta = lightMeta.find((entry) => entry.light === segment.light);
        return meta ? meta.colour : 'var(--muted-foreground)';
    }

    /**
     * @param {object} segment
     * @returns {number}
     */
    function segmentOpacity(segment) {
        if (!segment.online) {
            return 0.45;
        }
        if (!segment.light) {
            return 0.2;
        }
        return segment.known ? 1 : 0.5;
    }

    /**
     * @param {object} segment
     * @returns {string}
     */
    function segmentTooltip(segment) {
        if (!segment.online) {
            return `${formatTime(segment.startAt)} · ${t('view.charts.friend_status_lights.state.offline')}`;
        }
        if (!segment.light) {
            return `${formatTime(segment.startAt)} · ${t('view.charts.friend_status_lights.state.unknown')}`;
        }
        const suffix = segment.known ? '' : ` (${t('view.charts.friend_status_lights.state.inferred')})`;
        return `${formatTime(segment.startAt)} · ${lightLabel(segment.light)} · ${timeToText(segment.durationMs, false)}${suffix}`;
    }

    /**
     * Only the stretches that actually show a light are worth listing; offline and
     * unknown stretches stay visible in the band above.
     *
     * @param {object} day
     * @returns {object[]}
     */
    function dayLightSegments(day) {
        return day.segments.filter((segment) => segment.online && segment.light);
    }

    /**
     * @param {object} bucket - Hour bucket keyed by light
     * @returns {string}
     */
    function bucketHeight(ms) {
        if (!ms) {
            return '0%';
        }
        return `${Math.min(100, (ms / hours.value.maxHourMs) * 100)}%`;
    }

    /**
     * @param {number} hour
     * @param {object} bucket
     * @returns {string}
     */
    function hourTooltip(hour, bucket) {
        const parts = lightMeta
            .filter((meta) => bucket[meta.light])
            .map((meta) => `${lightLabel(meta.light)} ${timeToText(bucket[meta.light], false)}`);
        const head = t('view.charts.friend_status_lights.hours.hour', { hour });
        return parts.length ? `${head}\n${parts.join('\n')}` : `${head} —`;
    }

    function handleRangeChange(value) {
        if (!value) {
            return;
        }
        rangeDays.value = parseInt(value, 10);
        loadHistory();
    }

    function selectFriend(userId) {
        if (selectedId.value === userId) {
            return;
        }
        selectedId.value = userId;
        loadHistory();
    }

    async function loadCandidates() {
        try {
            const since = rangeDays.value ? new Date(Date.now() - rangeDays.value * DAY_MS).toISOString() : '';
            const rows = await database.getPlayersWithStatusHistory(since);
            candidates.value = rows.map((row) => {
                const friend = friends.value.get(row.userId);
                return {
                    ...row,
                    user: friend?.ref || { id: row.userId, displayName: row.displayName },
                    displayName: friend?.ref?.displayName || friend?.name || row.displayName || row.userId
                };
            });
        } catch (error) {
            console.error('Failed to load status light candidates', error);
            candidates.value = [];
        }
    }

    async function loadHistory() {
        const userId = selectedId.value;
        if (!userId) {
            statusRows.value = [];
            presenceRows.value = [];
            return;
        }
        loading.value = true;
        try {
            const since = rangeDays.value ? new Date(Date.now() - rangeDays.value * DAY_MS).toISOString() : '';
            const [statuses, presences] = await Promise.all([
                database.getStatusRowsForUserId(userId, since),
                database.getPresenceRowsForUserId(userId, since)
            ]);
            // the left column may have moved on to another friend while we waited
            if (selectedId.value !== userId) {
                return;
            }
            statusRows.value = statuses;
            presenceRows.value = presences;
        } catch (error) {
            console.error('Failed to load status light history', error);
            if (selectedId.value === userId) {
                statusRows.value = [];
                presenceRows.value = [];
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
            loadHistory();
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
