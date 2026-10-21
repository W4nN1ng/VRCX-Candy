<template>
    <div class="hidden-friends-page x-container flex flex-col gap-2 pb-8">
        <div class="pt-4 text-base font-medium">{{ t('view.candy.hidden_friends.tab_label') }}</div>
        <p class="page-intro">{{ t('view.candy.hidden_friends.intro') }}</p>

        <!-- The one thing a person is likely to worry about after hiding somebody, so it
             is stated up top rather than left to be discovered: hiding is not deleting,
             and nothing that happened while they were hidden is lost. -->
        <p class="page-intro">{{ t('view.candy.hidden_friends.keeps_recording') }}</p>

        <Field orientation="vertical">
            <FieldLabel>
                {{ t('view.candy.hidden_friends.list_title') }}
                <span class="count" v-if="hidden.length">({{ hidden.length }})</span>
            </FieldLabel>
            <FieldContent>
                <div v-if="!hidden.length" class="page-intro">{{ t('view.candy.hidden_friends.list_empty') }}</div>

                <div v-for="entry in hidden" :key="entry.userId" class="friend-row">
                    <Avatar class="size-7 flex-none">
                        <AvatarImage :src="userImage(friendRecord(entry.userId), true)" class="object-cover" />
                        <AvatarFallback><User class="size-3 text-muted-foreground" /></AvatarFallback>
                    </Avatar>
                    <div class="min-w-0 flex-1">
                        <div
                            class="truncate text-[13px] font-medium"
                            :style="{ color: friendRecord(entry.userId)?.$userColour }">
                            {{ displayName(entry) }}
                        </div>
                        <div class="truncate text-[11px] text-muted-foreground">
                            <!-- The id is shown on purpose: a hidden person who later
                                 unfriends you has no record left to look up, and without
                                 this line there is nothing to tell two of them apart. -->
                            {{ entry.userId }}
                        </div>
                    </div>
                    <span v-if="entry.at" class="page-intro flex-none">{{ formatHiddenAt(entry.at) }}</span>
                    <Button
                        size="sm"
                        variant="ghost"
                        :aria-label="t('view.candy.hidden_friends.unhide')"
                        @click="unhide(entry.userId)">
                        <Eye class="size-3.5" />
                    </Button>
                </div>

                <div class="add-row">
                    <Select v-model="draftUserId">
                        <SelectTrigger size="sm" class="min-w-40 max-w-96 flex-1">
                            <SelectValue :placeholder="t('view.candy.hidden_friends.pick_friend')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="option in friendOptions" :key="option.id" :value="option.id">
                                {{ option.name }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <Button size="sm" :disabled="!draftUserId" @click="hideDraft">
                        {{ t('view.candy.hidden_friends.hide') }}
                    </Button>
                </div>
                <p class="page-intro mt-1">{{ t('view.candy.hidden_friends.pick_from_sidebar') }}</p>

                <div v-if="hidden.length" class="add-row">
                    <Button size="sm" variant="outline" @click="unhideAll">
                        {{ t('view.candy.hidden_friends.unhide_all') }}
                    </Button>
                    <span class="page-intro">{{ t('view.candy.hidden_friends.unhide_all_hint') }}</span>
                </div>
            </FieldContent>
        </Field>

        <FieldSeparator />

        <Field orientation="vertical">
            <FieldLabel>{{ t('view.candy.hidden_friends.scope_title') }}</FieldLabel>
            <FieldContent>
                <ul class="scope-list">
                    <li v-for="line in scopeLines" :key="line">{{ line }}</li>
                </ul>
            </FieldContent>
        </Field>
    </div>
</template>

<script setup>
    import { computed, ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import { Eye, User } from 'lucide-vue-next';

    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { Button } from '@/components/ui/button';
    import { Field, FieldContent, FieldLabel, FieldSeparator } from '@/components/ui/field';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

    import { useFriendStore, useHiddenFriendsStore, useModalStore } from '../../../stores';
    import { useUserDisplay } from '@/composables/useUserDisplay';

    defineOptions({ name: 'CandyHiddenFriends' });

    const { t } = useI18n();
    const { userImage } = useUserDisplay();
    const friendStore = useFriendStore();
    const modalStore = useModalStore();
    const store = useHiddenFriendsStore();
    const { hidden } = storeToRefs(store);

    const draftUserId = ref('');

    /**
     * Where hiding has an effect, written out because "hidden" is easy to over-read as
     * "blocked". It is not: the person can still find your room, still be in the same
     * instance, and still get through to you in game.
     */
    const scopeLines = computed(() => [
        t('view.candy.hidden_friends.scope_list'),
        t('view.candy.hidden_friends.scope_feed'),
        t('view.candy.hidden_friends.scope_charts'),
        t('view.candy.hidden_friends.scope_not_game')
    ]);

    const friendOptions = computed(() =>
        [...friendStore.friends.entries()]
            .map(([id, user]) => ({ id, name: user?.displayName || user?.name || user?.id || id }))
            .filter((option) => !store.hiddenIds.has(option.id))
            .sort((a, b) => a.name.localeCompare(b.name))
    );

    /**
     * @param {string} userId
     * @returns {object | null} The live friend record, looked up while rendering so the
     *   avatar arrives on the second pass of the friend load rather than never.
     */
    function friendRecord(userId) {
        return friendStore.friends.get(userId)?.ref || null;
    }

    /**
     * @param {{ userId: string; displayName?: string }} entry
     * @returns {string}
     */
    function displayName(entry) {
        return friendRecord(entry.userId)?.displayName || entry.displayName || entry.userId;
    }

    function hideDraft() {
        if (!draftUserId.value) {
            return;
        }
        const friend = friendStore.friends.get(draftUserId.value);
        store.hide(draftUserId.value, friend?.ref?.displayName || friend?.displayName || '');
        draftUserId.value = '';
    }

    /**
     * @param {string} userId
     */
    function unhide(userId) {
        store.unhide(userId);
        // Say what happens next, because the whole value of this feature is that the
        // history comes back and a silent unhide would leave it unclear whether it did.
        modalStore.alert({
            title: t('view.candy.hidden_friends.unhidden_toast'),
            description: t('view.candy.hidden_friends.unhidden_toast_hint')
        });
    }

    function unhideAll() {
        modalStore
            .confirm({
                title: t('view.candy.hidden_friends.unhide_all'),
                description: t('view.candy.hidden_friends.unhide_all_confirm', { count: hidden.value.length })
            })
            .then(({ ok }) => ok && store.clearAll())
            .catch(() => {});
    }

    /**
     * @param {number} at
     * @returns {string}
     */
    function formatHiddenAt(at) {
        const date = new Date(at);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' });
    }
</script>

<style scoped>
    .page-intro {
        font-size: 12px;
        line-height: 1.6;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
    }

    .friend-row,
    .add-row {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .friend-row {
        padding: 6px 0;
        border-bottom: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
    }

    .add-row {
        margin-top: 10px;
    }

    .count {
        margin-left: 4px;
        font-weight: 400;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
    }

    .scope-list {
        margin: 4px 0 0;
        padding-left: 18px;
        font-size: 12px;
        line-height: 1.7;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
        list-style: disc;
    }
</style>
