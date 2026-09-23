/**
 * Settings and CSS for the custom window wallpaper.
 *
 * The one hard requirement is that the picture always fills the window, whatever
 * shape the window is. `cover` is what guarantees that: it scales the image until it
 * covers the box and crops the overflow, so a window dragged out to 1:9 still has no
 * empty edge. `contain` is the only thing that can letterbox, which is why the
 * "show the whole picture" mode paints a blurred copy underneath instead of leaving
 * the gap empty.
 *
 * Zoom is applied as a transform rather than a background size so that it scales
 * around the chosen focal point: zooming in keeps whatever you centred centred.
 * Blur is why the layer is allowed to bleed past the window edges - a blur softens
 * the element's own border, and without the bleed that soft edge would show up as a
 * faded rim around the picture.
 */

const DEFAULTS = {
    enabled: false,
    path: '',
    brightness: 1,
    blur: 0,
    zoom: 1,
    positionX: 50,
    positionY: 50,
    fitMode: 'cover',
    contentOpacity: 0.85,
    sidebarOpacity: 0.9
};

const FIT_MODES = ['cover', 'contain'];

const MIME_TYPES = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    avif: 'image/avif'
};

// How far the layer is allowed to spill past the window so a blur has somewhere to
// fade out. Two pixels of blur need about two pixels of room on each side.
const BLUR_BLEED_FACTOR = 2;
const BLUR_BLEED_BASE = 4;

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

/**
 * Coerce whatever came out of the config table into usable settings.
 *
 * Out of range values are clamped rather than rejected, and the two opacities are
 * kept as fractions so the caller can decide how to render them.
 *
 * @param {object} [input]
 * @returns {object}
 */
function normalizeWallpaperSettings(input = {}) {
    const source = input || {};
    return {
        enabled: source.enabled === true || source.enabled === 1 || source.enabled === 'true',
        path: String(source.path || ''),
        // Below 1 the picture would shrink away from the edges, so zoom only ever
        // scales up.
        brightness: clampNumber(source.brightness, 0.1, 2, DEFAULTS.brightness),
        blur: clampNumber(source.blur, 0, 40, DEFAULTS.blur),
        zoom: clampNumber(source.zoom, 1, 3, DEFAULTS.zoom),
        positionX: clampNumber(source.positionX, 0, 100, DEFAULTS.positionX),
        positionY: clampNumber(source.positionY, 0, 100, DEFAULTS.positionY),
        fitMode: FIT_MODES.includes(source.fitMode) ? source.fitMode : DEFAULTS.fitMode,
        contentOpacity: clampNumber(source.contentOpacity, 0, 1, DEFAULTS.contentOpacity),
        sidebarOpacity: clampNumber(source.sidebarOpacity, 0, 1, DEFAULTS.sidebarOpacity)
    };
}

/**
 * @param {string} filePath
 * @returns {string} A MIME type for the data URL, defaulting to png
 */
function wallpaperMimeType(filePath) {
    const match = /\.([a-zA-Z0-9]+)$/.exec(String(filePath || ''));
    const extension = match ? match[1].toLowerCase() : '';
    return MIME_TYPES[extension] || 'image/png';
}

/**
 * Build the data URL for a picture read off disk.
 *
 * VRCX hands back bare base64 with no prefix, so the type has to be added here.
 *
 * @param {string} filePath
 * @param {string} base64
 * @returns {string} An empty string when there is nothing to show
 */
function wallpaperDataUrl(filePath, base64) {
    const body = String(base64 || '').trim();
    if (!body) {
        return '';
    }
    return `data:${wallpaperMimeType(filePath)};base64,${body}`;
}

/**
 * How far the layer spills past the window so a blur has room to fade.
 *
 * @param {number} blur
 * @returns {number} Pixels
 */
function wallpaperBleed(blur) {
    const amount = clampNumber(blur, 0, 40, 0);
    return amount > 0 ? amount * BLUR_BLEED_FACTOR + BLUR_BLEED_BASE : 0;
}

/**
 * The CSS for the picture layer.
 *
 * @param {object} settings - Already normalized
 * @param {string} imageUrl - Data URL of the picture
 * @returns {object} A Vue style binding
 */
function wallpaperImageStyle(settings, imageUrl) {
    const bleed = wallpaperBleed(settings.blur);
    return {
        backgroundImage: imageUrl ? `url("${imageUrl}")` : 'none',
        backgroundSize: settings.fitMode === 'contain' ? 'contain' : 'cover',
        backgroundPosition: `${settings.positionX}% ${settings.positionY}%`,
        backgroundRepeat: 'no-repeat',
        filter: `brightness(${settings.brightness}) blur(${settings.blur}px)`,
        transform: `scale(${settings.zoom})`,
        transformOrigin: `${settings.positionX}% ${settings.positionY}%`,
        inset: `-${bleed}px`
    };
}

/**
 * The CSS for the blurred backdrop that stops "show the whole picture" from leaving
 * empty bands beside the image.
 *
 * @param {string} imageUrl
 * @returns {object}
 */
function wallpaperFillStyle(imageUrl) {
    return {
        backgroundImage: imageUrl ? `url("${imageUrl}")` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        filter: 'blur(48px) brightness(0.55)',
        transform: 'scale(1.1)'
    };
}

/**
 * @param {object} settings - Already normalized
 * @returns {{ brightness: string; blur: string; contentOpacity: string; sidebarOpacity: string }}
 */
function wallpaperCssVariables(settings) {
    return {
        brightness: String(settings.brightness),
        blur: `${settings.blur}px`,
        contentOpacity: `${settings.contentOpacity * 100}%`,
        sidebarOpacity: `${settings.sidebarOpacity * 100}%`
    };
}

export {
    DEFAULTS as WALLPAPER_DEFAULTS,
    FIT_MODES as WALLPAPER_FIT_MODES,
    normalizeWallpaperSettings,
    wallpaperBleed,
    wallpaperCssVariables,
    wallpaperDataUrl,
    wallpaperFillStyle,
    wallpaperImageStyle,
    wallpaperMimeType
};
