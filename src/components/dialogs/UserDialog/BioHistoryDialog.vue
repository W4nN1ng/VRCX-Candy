<template>
    <Dialog
        :open="props.visible"
        @update:open="
            (open) => {
                if (!open) cancel();
            }
        ">
        <DialogContent class="x-dialog sm:max-w-160 translate-y-0" style="top: 8vh" :show-close-button="false">
            <DialogHeader>
                <DialogTitle>
                    {{ t('dialog.user.bio_history.header') }}
                    <span v-if="userDialog.ref?.displayName" class="text-muted-foreground font-normal">
                        · {{ userDialog.ref.displayName }}
                    </span>
                </DialogTitle>
            </DialogHeader>

            <div class="flex min-h-0 flex-col gap-2.5">
                <div class="rounded-xl bg-muted p-3">
                    <div class="mb-2 flex items-center justify-between border-b border-muted-foreground/20 pb-2">
                        <span class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{{
                            t('dialog.user.bio_history.current')
                        }}</span>
                        <span v-if="lastChangedAt" class="text-xs text-muted-foreground">
                            {{ t('dialog.user.bio_history.updated', { time: timeAgo(lastChangedAt) }) }}
                        </span>
                    </div>
                    <pre
                        class="text-xs font-[inherit]"
                        style="white-space: pre-wrap; max-height: 160px; overflow-y: auto"
                        >{{ currentBio || '—' }}</pre>
                </div>

                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs text-muted-foreground">
                        {{ t('dialog.user.bio_history.changes', { count: history.length }) }}
                    </span>
                    <Button
                        v-if="history.length"
                        variant="ghost"
                        size="sm"
                        class="h-6 text-xs"
                        @click="showFullText = !showFullText">
                        <GitCompareArrows v-if="showFullText" class="mr-1 h-3.5 w-3.5" />
                        <AlignLeft v-else class="mr-1 h-3.5 w-3.5" />
                        {{
                            showFullText
                                ? t('dialog.user.bio_history.show_diff')
                                : t('dialog.user.bio_history.show_full')
                        }}
                    </Button>
                </div>

                <ScrollArea class="max-h-[45vh] pr-2">
                    <div v-if="userDialog.bioHistoryLoading" class="flex items-center gap-2 p-3 text-xs">
                        <Spinner class="size-3.5" />
                        <span class="text-muted-foreground">{{ t('dialog.user.bio_history.loading') }}</span>
                    </div>
                    <div
                        v-else-if="!history.length"
                        class="rounded-xl border border-dashed border-muted-foreground/30 p-4">
                        <span class="text-xs text-muted-foreground">{{ t('dialog.user.bio_history.empty') }}</span>
                        <br />
                        <span class="text-[11px] text-muted-foreground">{{
                            t('dialog.user.bio_history.empty_hint')
                        }}</span>
                    </div>
                    <div v-else class="flex flex-col gap-2.5">
                        <article
                            v-for="(entry, index) in history"
                            :key="entry.rowId ?? `${entry.created_at}-${index}`"
                            class="rounded-xl border border-muted-foreground/20 p-3">
                            <div class="mb-2 flex items-center justify-between gap-2">
                                <span class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                    {{ t('dialog.user.bio_history.version', { number: history.length - index }) }}
                                </span>
                                <TooltipWrapper side="left" :content="formatDateFilter(entry.created_at, 'long')">
                                    <span class="text-xs text-muted-foreground">{{ timeAgo(entry.created_at) }}</span>
                                </TooltipWrapper>
                            </div>

                            <template v-if="showFullText">
                                <div class="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {{ t('dialog.user.bio_history.previous') }}
                                </div>
                                <pre
                                    class="mb-2 text-xs font-[inherit] text-muted-foreground"
                                    style="white-space: pre-wrap"
                                    >{{ entry.previousBio || '—' }}</pre>
                                <div class="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {{ t('dialog.user.bio_history.next') }}
                                </div>
                                <pre class="text-xs font-[inherit]" style="white-space: pre-wrap">{{
                                    entry.bio || '—'
                                }}</pre>
                            </template>
                            <pre
                                v-else
                                class="text-xs leading-5.5 font-[inherit]"
                                style="white-space: pre-wrap"
                                v-html="formatDifference(entry.previousBio, entry.bio)"></pre>
                        </article>
                    </div>
                </ScrollArea>
            </div>

            <DialogFooter>
                <Button variant="secondary" @click="cancel">{{ t('dialog.user.bio_history.close') }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup>
    import { computed, ref } from 'vue';
    import { AlignLeft, GitCompareArrows } from 'lucide-vue-next';
    import { Button } from '@/components/ui/button';
    import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
    import { ScrollArea } from '@/components/ui/scroll-area';
    import { Spinner } from '@/components/ui/spinner';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import { formatDateFilter, formatDifference, timeAgo } from '../../../shared/utils';
    import { useUserStore } from '../../../stores';

    const { userDialog } = storeToRefs(useUserStore());

    const { t } = useI18n();

    const props = defineProps({
        visible: {
            type: Boolean,
            required: true
        }
    });

    const emit = defineEmits(['update:visible']);

    const showFullText = ref(false);

    // stored oldest first, shown newest first
    const history = computed(() => userDialog.value.bioHistory.slice().reverse());

    const currentBio = computed(() => String(userDialog.value.publicProfileRef?.bio ?? ''));

    const lastChangedAt = computed(() => (history.value.length ? history.value[0].created_at : ''));

    function cancel() {
        emit('update:visible', false);
    }
</script>
