<template>
    <!-- z-index -1 keeps the picture above the body background but below every
         surface the interface draws, so nothing else has to be reordered. -->
    <div
        v-if="wallpaperImageUrl"
        class="pointer-events-none fixed overflow-hidden"
        :style="{ ...imageStyle, zIndex: -1 }">
        <div v-if="isContain" class="absolute inset-0" :style="fillStyle"></div>
    </div>
</template>

<script setup>
    import { computed, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { useAppearanceSettingsStore } from '@/stores';
    import { checkWallpaperSize, wallpaperDataUrl, wallpaperFillStyle, wallpaperImageStyle } from '@/shared/utils';

    const { t } = useI18n();
    const appearanceSettingsStore = useAppearanceSettingsStore();
    const { wallpaper, wallpaperImageUrl } = storeToRefs(appearanceSettingsStore);

    const isContain = computed(() => wallpaper.value.fitMode === 'contain');

    const imageStyle = computed(() => wallpaperImageStyle(wallpaper.value, wallpaperImageUrl.value));

    const fillStyle = computed(() => wallpaperFillStyle(wallpaperImageUrl.value));

    const visible = computed(() => wallpaper.value.enabled && Boolean(wallpaper.value.path));

    /**
     * Read the chosen picture off disk.
     *
     * VRCX hands back bare base64, so the data URL prefix is added here. Only the
     * path is ever persisted - a full window sized image has no business sitting in
     * the config table. The decoded picture goes into the store so the settings
     * preview can show the same one without reading the file twice.
     */
    async function loadImage() {
        const path = wallpaper.value.path;
        appearanceSettingsStore.setWallpaperImageUrl('');
        if (!visible.value || !path) {
            return;
        }
        try {
            const base64 = await AppApi.GetFileBase64(path);
            const url = wallpaperDataUrl(path, base64);
            if (!url) {
                throw new Error('empty file');
            }
            // A picture bigger than 4K decodes to hundreds of megabytes of pixels and
            // is painted twice in "show the whole picture" mode, so it is refused here
            // too - the stored path may predate the limit or the file may have changed.
            const check = checkWallpaperSize(-1, base64);
            if (!check.ok) {
                refuseWallpaper(check.reason, check.width, check.height);
                return;
            }
            appearanceSettingsStore.setWallpaperImageUrl(url);
        } catch (error) {
            console.error('Failed to load wallpaper', error);
            // Leaving this switched on with no picture would let the app surfaces see
            // through to nothing, so it is turned back off rather than left that way.
            appearanceSettingsStore.setWallpaperValue('enabled', false);
            toast.error(t('view.settings.appearance.wallpaper.missing'));
        }
    }

    /**
     * @param {string} reason
     * @param {number} width
     * @param {number} height
     */
    function refuseWallpaper(reason, width, height) {
        console.log(`wallpaper refused: ${reason} (${width}x${height})`);
        appearanceSettingsStore.setWallpaperValue('enabled', false);
        const message =
            reason === 'too_many_pixels'
                ? t('view.settings.appearance.wallpaper.too_big', { width, height })
                : t('view.settings.appearance.wallpaper.missing');
        toast.error(message);
    }

    watch(() => [wallpaper.value.enabled, wallpaper.value.path], loadImage, { immediate: true });
</script>
