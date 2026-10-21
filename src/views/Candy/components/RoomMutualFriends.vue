<template>
    <div class="room-mutuals-page x-container flex flex-col gap-2 pb-8">
        <div class="pt-4 text-base font-medium">{{ t('view.candy.room_mutuals.tab_label') }}</div>
        <p class="page-intro">{{ t('view.candy.room_mutuals.intro') }}</p>

        <!-- Opting out of shared connections in VRChat's own settings makes every one of
             these lookups answer nothing at all, so saying so here is the difference
             between a page that reads as broken and a page that explains itself. -->
        <div v-if="optedOut" class="notice warn">
            {{ t('view.candy.room_mutuals.opted_out') }}
        </div>
        <div v-else-if="!inRoom" class="notice">
            {{ t('view.candy.room_mutuals.no_room') }}
        </div>

        <Field orientation="vertical">
            <FieldLabel>
                {{ t('view.candy.room_mutuals.list_title') }}
                <span v-if="roomName" class="room-name">{{ roomName }}</span>
            </FieldLabel>
            <FieldContent>
                <div class="summary-row">
                    <span class="page-intro">
                        {{
                            t('view.candy.room_mutuals.summary', {
                                players: summary.players,
                                withMutuals: summary.withMutuals,
                                friends: summary.friends
                            })
                        }}
                    </span>
                    <label class="filter-row">
                        <Switch :model-value="onlyShared" @update:modelValue="(v) => store.setOnlyShared(v)" />
                        <span class="text-xs">{{ t('view.candy.room_mutuals.only_shared') }}</span>
                    </label>
                    <Button size="sm" variant="ghost" :disabled="store.scanning" @click="refresh">
                        <RefreshCw class="size-3.5" :class="{ spinning: store.scanning }" />
                        {{ t('view.candy.room_mutuals.refresh') }}
                    </Button>
                </div>

                <div v-if="!visibleRows.length" class="page-intro mt-1">
                    {{ t(rows.length ? 'view.candy.room_mutuals.no_shared' : 'view.candy.room_mutuals.empty') }}
                </div>

                <div v-for="row in visibleRows" :key="row.userId" class="player-block">
                    <div class="player-row" @click="toggle(row)">
                        <div class="relative inline-block size-8 flex-none" :class="userStatusClass(userFor(row))">
                            <Avatar class="size-8">
                                <AvatarImage :src="userImage(userFor(row), true)" class="object-cover" />
                                <AvatarFallback><User class="size-3.5 text-muted-foreground" /></AvatarFallback>
                            </Avatar>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="truncate text-[13px] font-medium" :style="{ color: userFor(row)?.$userColour }">
                                {{ row.displayName }}
                            </div>
                            <div class="truncate text-[11px] text-muted-foreground">
                                {{ stateText(row) }}
                            </div>
                        </div>
                        <span v-if="row.mutualCount" class="count-badge">{{ row.mutualCount }}</span>
                        <ChevronDown
                            v-if="row.mutualCount"
                            class="size-3.5 flex-none text-muted-foreground transition-transform"
                            :class="{ rotated: expandedId === row.userId }" />
                    </div>

                    <div v-if="expandedId === row.userId" class="names">
                        <div v-if="namesLoading" class="page-intro">
                            {{ t('view.candy.room_mutuals.loading_names') }}
                        </div>
                        <div v-else-if="!expandedNames.length" class="page-intro">
                            {{ t('view.candy.room_mutuals.no_names') }}
                        </div>
                        <button
                            v-for="mutual in expandedNames"
                            v-else
                            :key="mutual.userId"
                            type="button"
                            class="name-chip"
                            @click.stop="openUser(mutual.userId)">
                            {{ mutual.displayName }}
                        </button>
                    </div>
                </div>
            </FieldContent>
        </Field>

        <FieldSeparator />

        <Field orientation="vertical">
            <FieldLabel>{{ t('view.candy.room_mutuals.settings_title') }}</FieldLabel>
            <FieldContent>
                <label class="option-row">
                    <Switch :model-value="store.enabled" @update:modelValue="(v) => store.setEnabled(v)" />
                    <span>
                        {{ t('view.candy.room_mutuals.enable') }}
                        <span class="page-intro block">{{ t('view.candy.room_mutuals.enable_hint') }}</span>
                    </span>
                </label>
                <label class="option-row">
                    <Switch :model-value="store.notify" @update:modelValue="(v) => store.setNotify(v)" />
                    <span>
                        {{ t('view.candy.room_mutuals.notify') }}
                        <span class="page-intro block">{{ t('view.candy.room_mutuals.notify_hint') }}</span>
                    </span>
                </label>
                <div class="option-row">
                    <span class="flex-1">
                        {{ t('view.candy.room_mutuals.limit') }}
                        <span class="page-intro block">{{ t('view.candy.room_mutuals.limit_hint') }}</span>
                    </span>
                    <Input
                        class="limit-input"
                        type="number"
                        min="1"
                        :max="ROOM_MUTUAL_MAX_PLAYERS"
                        :model-value="store.limit"
                        @update:modelValue="(v) => store.setLimit(v)" />
                </div>
                <p class="page-intro mt-2">{{ t('view.candy.room_mutuals.cost_hint') }}</p>
            </FieldContent>
        </Field>
    </div>
</template>

<script setup>
    import { computed, ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { ChevronDown, RefreshCw, User } from 'lucide-vue-next';

    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { Button } from '@/components/ui/button';
    import { Field, FieldContent, FieldLabel, FieldSeparator } from '@/components/ui/field';
    import { Input } from '@/components/ui/input';
    import { Switch } from '@/components/ui/switch';

    import { useFriendStore, useLocationStore, useRoomMutualsStore, useUserStore } from '../../../stores';
    import { loadRoomMutualNames, scanRoomForMutuals } from '../../../coordinators/roomMutualsCoordinator';
    import { showUserDialog } from '../../../coordinators/userCoordinator';
    import { useUserDisplay } from '@/composables/useUserDisplay';
    import { ROOM_MUTUAL_MAX_PLAYERS } from '../../../shared/constants/roomMutuals';
    import { ROOM_MUTUAL_STATE } from '../../../shared/utils/roomMutuals';

    defineOptions({ name: 'CandyRoomMutuals' });

    const { t } = useI18n();
    const { userImage, userStatusClass } = useUserDisplay();
    const store = useRoomMutualsStore();
    const locationStore = useLocationStore();
    const friendStore = useFriendStore();
    const userStore = useUserStore();
    const { currentUser } = storeToRefs(userStore);
    const { rows, summary, onlyShared } = storeToRefs(store);

    const expandedId = ref('');
    const expandedNames = ref([]);
    const namesLoading = ref(false);

    const roomName = computed(() => String(locationStore.lastLocation.name || ''));

    /**
     * A 72 person room is not a list worth scrolling through to find the five names that
     * matter, so the relevant rows can be shown on their own. The summary line above
     * still counts everybody, so nothing looks like it went missing.
     */
    const visibleRows = computed(() =>
        onlyShared.value ? rows.value.filter((row) => row.state === ROOM_MUTUAL_STATE.Mutual) : rows.value
    );
    const inRoom = computed(() => Boolean(locationStore.lastLocation.location));
    const optedOut = computed(() => Boolean(currentUser.value?.hasSharedConnectionsOptOut));

    /**
     * The user record behind a row, read while rendering so the avatar lands as soon as
     * the profile is known rather than freezing at whatever the scan saw.
     *
     * The room roster only carries a name and an id - the picture has to come from the
     * friend feed or the user cache, and a stranger you have never opened is legitimately
     * without one until you do.
     *
     * @param {object} row
     * @returns {object | null}
     */
    function userFor(row) {
        if (row.userId === currentUser.value?.id) {
            return currentUser.value;
        }
        return friendStore.friends.get(row.userId)?.ref || userStore.cachedUsers.get(row.userId) || null;
    }

    /**
     * @param {object} row
     * @returns {string}
     */
    function stateText(row) {
        switch (row.state) {
            case ROOM_MUTUAL_STATE.Mutual:
                return row.mutualGroups
                    ? t('view.candy.room_mutuals.state_mutual_with_groups', {
                          friends: row.mutualCount,
                          groups: row.mutualGroups
                      })
                    : t('view.candy.room_mutuals.state_mutual', { friends: row.mutualCount });
            case ROOM_MUTUAL_STATE.None:
                return t('view.candy.room_mutuals.state_none');
            case ROOM_MUTUAL_STATE.Friend:
                return t('view.candy.room_mutuals.state_friend');
            case ROOM_MUTUAL_STATE.Pending:
                return t('view.candy.room_mutuals.state_pending');
            case ROOM_MUTUAL_STATE.Skipped:
                return t('view.candy.room_mutuals.state_skipped');
            case ROOM_MUTUAL_STATE.Denied:
                return t('view.candy.room_mutuals.state_denied');
            default:
                return row.userId;
        }
    }

    /**
     * @param {object} row
     */
    async function toggle(row) {
        if (!row.mutualCount) {
            return;
        }
        if (expandedId.value === row.userId) {
            expandedId.value = '';
            expandedNames.value = [];
            return;
        }
        expandedId.value = row.userId;
        const cached = store.namesFor(row.userId);
        if (cached && !cached.denied) {
            expandedNames.value = cached.list || [];
            return;
        }
        namesLoading.value = true;
        const list = await loadRoomMutualNames(row.userId);
        // A second click while this was in flight means the answer is no longer wanted.
        if (expandedId.value === row.userId) {
            expandedNames.value = list;
            namesLoading.value = false;
        }
    }

    /**
     * @param {string} userId
     */
    function openUser(userId) {
        showUserDialog({ userId });
    }

    function refresh() {
        scanRoomForMutuals().catch((error) => {
            console.error('Failed to refresh shared friends', error);
        });
    }
</script>

<style scoped>
    .page-intro {
        font-size: 12px;
        line-height: 1.6;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
    }

    .notice {
        font-size: 12px;
        line-height: 1.6;
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text-muted, rgba(255, 255, 255, 0.65));
    }

    .notice.warn {
        border-color: rgba(233, 124, 3, 0.5);
    }

    .summary-row,
    .option-row,
    .player-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .summary-row {
        margin-bottom: 4px;
    }

    /* The filter sits on the same line as the summary, so it must not carry the
       .option-row margin the settings block below relies on. */
    .filter-row {
        display: flex;
        flex: none;
        align-items: center;
        gap: 6px;
    }

    .player-block {
        border-bottom: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
    }

    .player-row {
        padding: 6px 0;
        cursor: pointer;
    }

    .count-badge {
        flex: none;
        min-width: 22px;
        text-align: center;
        font-size: 12px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(46, 211, 25, 0.16);
        color: #2ed319;
    }

    .names {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 0 0 8px 38px;
    }

    .name-chip {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: transparent;
        cursor: pointer;
    }

    .name-chip:hover {
        background: color-mix(in oklab, var(--border) 40%, transparent);
    }

    .room-name {
        margin-left: 8px;
        font-weight: 400;
        font-size: 12px;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
    }

    .limit-input {
        width: 72px;
    }

    .rotated {
        transform: rotate(180deg);
    }

    .spinning {
        animation: room-mutuals-spin 1s linear infinite;
    }

    @keyframes room-mutuals-spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
