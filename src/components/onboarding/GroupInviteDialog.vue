<template>
    <Dialog v-model:open="isOpen">
        <DialogContent
            class="border border-border bg-background/85 shadow-lg backdrop-blur-xl backdrop-saturate-[1.4] sm:max-w-md"
            :show-close-button="false"
            @escape-key-down="handleDecline"
            @pointer-down-outside="handleDecline"
            @interact-outside.prevent>
            <!-- The card is the point of the dialog: without it nobody can tell what
                 they are being asked to join. -->
            <div v-if="group" class="overflow-hidden rounded-xl border">
                <div class="relative aspect-17/6 bg-accent">
                    <img
                        v-if="group.bannerUrl && !bannerFailed"
                        class="absolute inset-0 h-full w-full object-cover"
                        :src="group.bannerUrl"
                        alt=""
                        loading="lazy"
                        @error="bannerFailed = true" />
                </div>
                <div class="flex items-center gap-3 px-3 pt-3">
                    <Avatar class="size-12 shrink-0 rounded-lg">
                        <AvatarImage :src="group.iconUrl" class="rounded-lg object-cover" />
                        <AvatarFallback class="rounded-lg"><Users class="size-5" /></AvatarFallback>
                    </Avatar>
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-semibold">{{ group.name }}</div>
                        <div v-if="group.memberCount" class="truncate text-[11px] text-muted-foreground">
                            {{ t('view.onboarding.group_invite.members', { count: group.memberCount }) }}
                        </div>
                    </div>
                </div>
                <p
                    v-if="group.description"
                    class="max-h-28 overflow-y-auto whitespace-pre-wrap px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                    {{ group.description }}
                </p>
                <div v-else class="pb-3"></div>
            </div>

            <div v-else class="flex h-24 items-center justify-center">
                <Loader2 class="size-5 animate-spin text-muted-foreground" />
            </div>

            <div class="mt-4 text-center">
                <h2 class="m-0 text-[18px] font-bold tracking-tight">
                    {{ t('view.onboarding.group_invite.title') }}
                </h2>
                <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {{ t('view.onboarding.group_invite.description') }}
                </p>
            </div>

            <div class="mt-4 flex flex-col gap-2">
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
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import { GROUP_INVITE_GROUP_ID, GROUP_INVITE_SEEN_KEY } from '@/shared/constants';
    import { groupRequest } from '@/api';
    import configRepository from '../../services/config';
    import { groupInviteSettled } from '@/services/onboardingState';
    import { decideGroupInvite, GROUP_INVITE_ALREADY_SETTLED, GROUP_INVITE_ASK } from '@/shared/utils';

    const { t } = useI18n();

    const isOpen = ref(false);
    const isJoining = ref(false);
    const group = ref(null);
    const bannerFailed = ref(false);

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
            groupInviteSettled.value = true;
            await markAsSeen();
        }
    }

    async function handleDecline() {
        if (isJoining.value) {
            return;
        }
        isOpen.value = false;
        groupInviteSettled.value = true;
        await markAsSeen();
    }

    onMounted(async () => {
        try {
            if (!GROUP_INVITE_GROUP_ID) {
                return;
            }
            const seen = await configRepository.getBool(GROUP_INVITE_SEEN_KEY, false);

            // The group is read straight from the API, never from the list held in the
            // store. That list is still the previous session's membership at this
            // point in the login - it is seeded from a config row and only replaced
            // once the fresh one arrives - so somebody who left the group in between
            // is listed there as a member. Being taken for a member is the one way
            // this can go wrong: the prompt is swallowed silently and never returns.
            let args = null;
            try {
                args = await groupRequest.getGroup({ groupId: GROUP_INVITE_GROUP_ID });
            } catch (error) {
                // Nothing was decided, so the flag is left alone and the next launch
                // asks again. Saying nothing is what being unsure looks like.
                console.error('Failed to read the invite group', error);
                return;
            }

            const decision = decideGroupInvite({
                seen,
                membershipStatus: args?.json?.membershipStatus
            });
            console.log(`[VRCX-Candy] group invite: ${decision} (seen ${seen})`);

            if (decision === GROUP_INVITE_ALREADY_SETTLED) {
                await markAsSeen();
                return;
            }
            if (decision !== GROUP_INVITE_ASK) {
                return;
            }

            // The same response is what draws the card, so there is nothing left to
            // fetch before showing what is being offered.
            group.value = args?.ref || null;
            isOpen.value = true;
        } finally {
            // Nothing was put on screen, so the help screen does not have to wait.
            if (!isOpen.value) {
                groupInviteSettled.value = true;
            }
        }
    });
</script>
