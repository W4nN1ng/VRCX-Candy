import { describe, expect, test } from 'vitest';

import {
    normalizeWallpaperSettings,
    wallpaperBleed,
    wallpaperCssVariables,
    wallpaperDataUrl,
    wallpaperFillStyle,
    wallpaperImageStyle,
    wallpaperMimeType
} from '../wallpaper';

describe('normalizeWallpaperSettings', () => {
    test('falls back to sensible defaults for nothing at all', () => {
        const settings = normalizeWallpaperSettings();

        expect(settings).toMatchObject({
            enabled: false,
            path: '',
            brightness: 1,
            blur: 0,
            zoom: 1,
            positionX: 50,
            positionY: 50,
            fitMode: 'cover'
        });
    });

    test('accepts the shapes a config row can come back as', () => {
        expect(normalizeWallpaperSettings({ enabled: true }).enabled).toBe(true);
        expect(normalizeWallpaperSettings({ enabled: 1 }).enabled).toBe(true);
        expect(normalizeWallpaperSettings({ enabled: 'true' }).enabled).toBe(true);
        expect(normalizeWallpaperSettings({ enabled: 'yes' }).enabled).toBe(false);
    });

    test('clamps values instead of trusting them', () => {
        const wild = normalizeWallpaperSettings({
            brightness: 99,
            blur: -5,
            zoom: 500,
            positionX: -20,
            positionY: 999,
            contentOpacity: 7,
            sidebarOpacity: -3
        });

        expect(wild.brightness).toBe(2);
        expect(wild.blur).toBe(0);
        expect(wild.zoom).toBe(3);
        expect(wild.positionX).toBe(0);
        expect(wild.positionY).toBe(100);
        expect(wild.contentOpacity).toBe(1);
        expect(wild.sidebarOpacity).toBe(0);
    });

    test('never lets zoom shrink below the window size', () => {
        // under 1 the picture would pull away from the edges and show the backdrop
        expect(normalizeWallpaperSettings({ zoom: 0.25 }).zoom).toBe(1);
    });

    test('rejects a fit mode it does not know', () => {
        expect(normalizeWallpaperSettings({ fitMode: 'stretch' }).fitMode).toBe('cover');
        expect(normalizeWallpaperSettings({ fitMode: 'contain' }).fitMode).toBe('contain');
    });

    test('survives junk values', () => {
        const settings = normalizeWallpaperSettings({ brightness: 'abc', blur: null, zoom: undefined });

        expect(settings.brightness).toBe(1);
        expect(settings.blur).toBe(0);
        expect(settings.zoom).toBe(1);
        expect(normalizeWallpaperSettings(null).brightness).toBe(1);
    });
});

describe('wallpaperMimeType and wallpaperDataUrl', () => {
    test('reads the type off the extension', () => {
        expect(wallpaperMimeType('C:\\pics\\a.PNG')).toBe('image/png');
        expect(wallpaperMimeType('C:\\pics\\a.jpg')).toBe('image/jpeg');
        expect(wallpaperMimeType('C:\\pics\\a.jpeg')).toBe('image/jpeg');
        expect(wallpaperMimeType('/home/me/a.webp')).toBe('image/webp');
    });

    test('defaults to png for an unknown or missing extension', () => {
        expect(wallpaperMimeType('C:\\pics\\a.tiff')).toBe('image/png');
        expect(wallpaperMimeType('')).toBe('image/png');
    });

    test('adds the prefix VRCX leaves off', () => {
        expect(wallpaperDataUrl('a.png', 'AAAA')).toBe('data:image/png;base64,AAAA');
        expect(wallpaperDataUrl('a.jpg', '  AAAA  ')).toBe('data:image/jpeg;base64,AAAA');
    });

    test('returns nothing to show for an empty file', () => {
        expect(wallpaperDataUrl('a.png', '')).toBe('');
        expect(wallpaperDataUrl('a.png', null)).toBe('');
    });
});

describe('wallpaperImageStyle', () => {
    /**
     * @param {object} [overrides]
     * @returns {object}
     */
    function style(overrides = {}) {
        return wallpaperImageStyle(normalizeWallpaperSettings(overrides), 'data:image/png;base64,AAAA');
    }

    test('covers the window by default, which is what rules out empty edges', () => {
        expect(style().backgroundSize).toBe('cover');
    });

    test('switches to contain only when the whole picture was asked for', () => {
        expect(style({ fitMode: 'contain' }).backgroundSize).toBe('contain');
    });

    test('puts the focal point on the background and on the zoom origin', () => {
        const positioned = style({ positionX: 20, positionY: 80 });

        expect(positioned.backgroundPosition).toBe('20% 80%');
        expect(positioned.transformOrigin).toBe('20% 80%');
    });

    test('spills past the window only when there is a blur to hide', () => {
        expect(style({ blur: 0 }).inset).toBe('-0px');
        expect(style({ blur: 10 }).inset).toBe('-24px');
    });

    test('carries brightness and blur into a single filter', () => {
        expect(style({ brightness: 0.5, blur: 4 }).filter).toBe('brightness(0.5) blur(4px)');
    });

    test('scales around the focal point so zoom does not drift', () => {
        expect(style({ zoom: 2 }).transform).toBe('scale(2)');
    });

    test('renders nothing rather than a broken url when there is no picture', () => {
        expect(wallpaperImageStyle(normalizeWallpaperSettings(), '').backgroundImage).toBe('none');
    });
});

describe('wallpaperFillStyle', () => {
    test('covers with a softened copy so the letterbox area is never empty', () => {
        const fill = wallpaperFillStyle('data:image/png;base64,AAAA');

        expect(fill.backgroundSize).toBe('cover');
        expect(fill.filter).toContain('blur');
    });

    test('renders nothing without a picture', () => {
        expect(wallpaperFillStyle('').backgroundImage).toBe('none');
    });
});

describe('wallpaperCssVariables', () => {
    test('turns the fractions into percentages for the surfaces', () => {
        const variables = wallpaperCssVariables(
            normalizeWallpaperSettings({ contentOpacity: 0.6, sidebarOpacity: 0.9 })
        );

        expect(variables.contentOpacity).toBe('60%');
        expect(variables.sidebarOpacity).toBe('90%');
        expect(variables.blur).toBe('0px');
    });
});

describe('wallpaperBleed', () => {
    test('is zero with no blur and grows with it', () => {
        expect(wallpaperBleed(0)).toBe(0);
        expect(wallpaperBleed(5)).toBe(14);
        expect(wallpaperBleed(-1)).toBe(0);
    });
});
