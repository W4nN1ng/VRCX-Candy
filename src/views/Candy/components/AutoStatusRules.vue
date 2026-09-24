<template>
    <div class="auto-status-page flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-8">
        <div class="pt-4 text-base font-medium">{{ t('view.candy.auto_status.tab_label') }}</div>
        <p class="page-intro">{{ t('view.candy.auto_status.intro') }}</p>

        <AutoStatusRulesSection />

        <FieldSeparator class="my-2" />

        <Field orientation="vertical">
            <FieldLabel>{{ t('view.candy.auto_status.legacy_title') }}</FieldLabel>
            <FieldContent>
                <p class="page-intro">{{ t('view.candy.auto_status.legacy_hint') }}</p>
                <Button class="w-fit" size="sm" @click="toolsStore.openDialog('autoChangeStatus')">
                    {{ t('view.candy.auto_status.legacy_open') }}
                </Button>
            </FieldContent>
        </Field>
    </div>
</template>

<script setup>
    import { useI18n } from 'vue-i18n';

    import { useToolsStore } from '../../../stores';
    import { Button } from '@/components/ui/button';
    import { Field, FieldContent, FieldLabel, FieldSeparator } from '@/components/ui/field';

    import AutoStatusRulesSection from './AutoStatusRulesSection.vue';

    defineOptions({ name: 'CandyAutoStatus' });

    const { t } = useI18n();
    const toolsStore = useToolsStore();
</script>

<style scoped>
    .page-intro {
        font-size: 12px;
        line-height: 1.6;
        color: var(--text-muted, rgba(255, 255, 255, 0.55));
    }
</style>
