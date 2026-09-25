<template>
    <Dialog v-model:open="helpDialogOpen">
        <DialogContent class="sm:max-w-lg" @escape-key-down="handleClose" @pointer-down-outside="handleClose">
            <DialogHeader>
                <DialogTitle class="text-[19px]">{{ t('view.help.title') }}</DialogTitle>
                <DialogDescription class="text-xs leading-relaxed">{{ t('view.help.intro') }}</DialogDescription>
            </DialogHeader>

            <div class="-mx-1 max-h-[52vh] overflow-y-auto px-1">
                <div
                    v-for="feature in features"
                    :key="feature.key"
                    class="mb-2 flex gap-3 rounded-lg border p-3 last:mb-0">
                    <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                        <component :is="feature.icon" class="size-4" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="text-[13px] font-medium">
                            {{ t(`view.help.features.${feature.key}.title`) }}
                        </div>
                        <div class="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                            {{ t(`view.help.features.${feature.key}.description`) }}
                        </div>
                    </div>
                </div>
            </div>

            <p class="text-[11px] leading-snug text-muted-foreground">
                {{ t('view.help.reopen_hint') }}
            </p>

            <DialogFooter>
                <Button class="w-full text-sm font-semibold" size="lg" @click="handleClose">
                    {{ t('view.help.close') }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup>
    import { markRaw, onMounted, watch } from 'vue';
    import { Footprints, HandHeart, Image, Lightbulb, UserCog, UserSquare, Users } from 'lucide-vue-next';
    import { useI18n } from 'vue-i18n';

    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogHeader,
        DialogTitle
    } from '@/components/ui/dialog';
    import { Button } from '@/components/ui/button';
    import { closeHelpDialog, groupInviteSettled, helpDialogOpen } from '@/services/onboardingState';
    import configRepository from '../../services/config';

    const { t } = useI18n();

    const HELP_SEEN_KEY = 'VRCX_help_seen';

    const features = [
        { key: 'bio_history', icon: markRaw(UserSquare) },
        { key: 'footprints', icon: markRaw(Footprints) },
        { key: 'status_lights', icon: markRaw(Lightbulb) },
        { key: 'together', icon: markRaw(Users) },
        { key: 'meetings', icon: markRaw(HandHeart) },
        { key: 'wallpaper', icon: markRaw(Image) },
        { key: 'auto_status', icon: markRaw(UserCog) }
    ];

    async function handleClose() {
        closeHelpDialog();
        await configRepository.setBool(HELP_SEEN_KEY, true);
    }

    onMounted(async () => {
        if (await configRepository.getBool(HELP_SEEN_KEY, false)) {
            return;
        }
        // Waits for the group invite to have its turn. The flag is set on every path
        // that dialog can take, so this cannot hang when the invite is switched off.
        if (!groupInviteSettled.value) {
            await new Promise((resolve) => {
                const stop = watch(groupInviteSettled, (settled) => {
                    if (settled) {
                        stop();
                        resolve();
                    }
                });
            });
        }
        helpDialogOpen.value = true;
    });
</script>
