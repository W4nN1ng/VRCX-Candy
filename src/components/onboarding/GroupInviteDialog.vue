<template>
    <Dialog v-model:open="isOpen">
        <DialogContent
            class="border border-border bg-background/85 shadow-lg backdrop-blur-xl backdrop-saturate-[1.4] sm:max-w-md"
            :show-close-button="false"
            @escape-key-down="handleDecline"
            @pointer-down-outside="handleDecline"
            @interact-outside.prevent>
            <div class="pt-2 text-center">
                <div class="mb-3 flex justify-center">
                    <div class="flex size-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
                        <Users class="size-6" />
                    </div>
                </div>
                <h2 class="m-0 text-[20px] font-bold tracking-tight">
                    {{ t('view.onboarding.group_invite.title') }}
                </h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {{ t('view.onboarding.group_invite.description') }}
                </p>
            </div>

            <div class="mt-6 flex flex-col gap-2">
                <Button class="w-full text-sm font-semibold" size="lg" :disabled="isJoining" @click="handleJoin">
                    <Loader2 v-if="isJoining" class="size-4 animate-spin" />
                    {{ t('view.onboarding.group_invite.join') }}
                </Button>
                <Button class="w-full text-sm" variant="ghost" size="lg" :disabled="isJoining" @click="handleDecline">
                    {{ t('view.onboarding.group_invite.decline') }}
                </Button>
            </div>

            <p class="mt-3 text-center text-[11px] leading-snug text-muted-foreground">
                {{ t('view.onboarding.group_invite.once_only') }}
            </p>
        </DialogContent>
    </Dialog>
</template>

<script setup>
    import { onMounted, ref } from 'vue';
    import { Loader2, Users } from 'lucide-vue-next';
    import { useI18n } from 'vue-i18n';
    import { toast } from 'vue-sonner';

    import { Dialog, DialogContent } from '@/components/ui/dialog';
    import { Button } from '@/components/ui/button';
    import { GROUP_INVITE_GROUP_ID, GROUP_INVITE_GROUP_WAIT_MS, GROUP_INVITE_SEEN_KEY } from '@/shared/constants';
    import { groupRequest } from '@/api';
    import configRepository from '../../services/config';
    import { useGroupStore } from '@/stores';

    const { t } = useI18n();
    const groupStore = useGroupStore();

    const isOpen = ref(false);
    const isJoining = ref(false);

    /**
     * Wait for the group list to arrive.
     *
     * It is fetched after login rather than being part of it, so deciding before it
     * lands would read a member as a stranger and prompt them.
     *
     * @returns {Promise<boolean>} Whether the list loaded
     */
    async function waitForGroups() {
        const startedAt = Date.now();
        while (!groupStore.currentUserGroupsInit && Date.now() - startedAt < GROUP_INVITE_GROUP_WAIT_MS) {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return Boolean(groupStore.currentUserGroupsInit);
    }

    /**
     * @returns {boolean} Whether the signed in user already belongs to the group
     */
    function isAlreadyInGroup() {
        const group = groupStore.currentUserGroups.get(GROUP_INVITE_GROUP_ID);
        return Boolean(group) && group.membershipStatus === 'member';
    }

    async function markAsSeen() {
        await configRepository.setBool(GROUP_INVITE_SEEN_KEY, true);
    }

    async function handleJoin() {
        if (isJoining.value) {
            return;
        }
        isJoining.value = true;
        try {
            const args = await groupRequest.joinGroup({ groupId: GROUP_INVITE_GROUP_ID });
            if (args?.json?.membershipStatus === 'member') {
                toast.success(t('view.onboarding.group_invite.joined'));
            } else if (args?.json?.membershipStatus === 'requested') {
                toast.success(t('view.onboarding.group_invite.requested'));
            }
        } catch (error) {
            // The request layer has already surfaced the API error; the choice itself
            // still counts as made, so the prompt does not come back.
            console.error('Failed to join the invite group', error);
        } finally {
            isJoining.value = false;
            isOpen.value = false;
            await markAsSeen();
        }
    }

    async function handleDecline() {
        if (isJoining.value) {
            return;
        }
        isOpen.value = false;
        await markAsSeen();
    }

    onMounted(async () => {
        if (!GROUP_INVITE_GROUP_ID) {
            return;
        }
        if (await configRepository.getBool(GROUP_INVITE_SEEN_KEY, false)) {
            return;
        }
        // If the list never arrives, say nothing rather than risk asking someone who
        // is already a member.
        if (!(await waitForGroups())) {
            return;
        }
        if (isAlreadyInGroup()) {
            await markAsSeen();
            return;
        }
        isOpen.value = true;
    });
</script>
