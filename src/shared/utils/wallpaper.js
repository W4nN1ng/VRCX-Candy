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

// An 8K picture decodes to 7680x4320x4 = 127 MB of raw pixels per copy, and the
// wallpaper is painted twice when "show the whole picture" is on, so a single
// screenshot could push the renderer past 3 GB. 4K is plenty for a window.
const MAX_WALLPAPER_WIDTH = 3840;
const MAX_WALLPAPER_HEIGHT = 2160;
const MAX_WALLPAPER_PIXELS = MAX_WALLPAPER_WIDTH * MAX_WALLPAPER_HEIGHT;
// Anything past this is refused before it is read off disk at all.
const MAX_WALLPAPER_BYTES = 64 * 1024 * 1024;

/**
 * Read the intrinsic size of a picture straight out of its header, without decoding it.
 *
 * Only the leading bytes are needed, so this costs nothing next to an image decode.
 *
 * @param {string} base64 - Bare base64 of the file, as VRCX returns it.
 * @returns {{ width: number; height: number; format: string } | null} Null when unreadable
 */
function parseImageSize(base64) {
    const body = String(base64 || '').trim();
    if (body.length < 64) {
        return null;
    }
    let bytes;
    try {
        // decode a prefix only; the header never lives deeper than a few KB apart
        // from the EXIF block handled below
        const binary = atob(body.slice(0, 262144));
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
    } catch {
        return null;
    }

    const at = (offset) => bytes[offset] ?? 0;
    const be16 = (offset) => (at(offset) << 8) | at(offset + 1);
    const be32 = (offset) =>
        ((at(offset) << 24) | (at(offset + 1) << 16) | (at(offset + 2) << 8) | at(offset + 3)) >>> 0;
    const le16 = (offset) => at(offset) | (at(offset + 1) << 8);
    const le32 = (offset) =>
        (at(offset) | (at(offset + 1) << 8) | (at(offset + 2) << 16) | (at(offset + 3) << 24)) >>> 0;
    const tag = (offset, count) => String.fromCharCode(...bytes.subarray(offset, offset + count));

    if (bytes.length < 24) {
        return null;
    }

    // PNG
    if (be32(0) === 0x89504e47 && tag(12, 4) === 'IHDR') {
        return { width: be32(16), height: be32(20), format: 'png' };
    }
    // GIF
    if (tag(0, 4) === 'GIF8') {
        return { width: le16(6), height: le16(8), format: 'gif' };
    }
    // BMP
    if (tag(0, 2) === 'BM') {
        return { width: le32(18), height: Math.abs(le32(22)), format: 'bmp' };
    }
    // WebP: RIFF....WEBP + VP8 / VP8L / VP8X chunk
    if (tag(0, 4) === 'RIFF' && tag(8, 4) === 'WEBP') {
        const chunk = tag(12, 4);
        if (chunk === 'VP8 ') {
            return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff, format: 'webp' };
        }
        if (chunk === 'VP8L') {
            const bits = le32(21);
            return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: 'webp' };
        }
        if (chunk === 'VP8X') {
            // payload starts at 20: one flags byte, then 24-bit canvas size minus one
            return {
                width: (at(21) | (at(22) << 8) | (at(23) << 16)) + 1,
                height: (at(24) | (at(25) << 8) | (at(26) << 16)) + 1,
                format: 'webp'
            };
        }
        return null;
    }
    // JPEG: walk the marker segments until a start-of-frame is found
    if (be16(0) === 0xffd8) {
        let offset = 2;
        while (offset + 9 < bytes.length) {
            if (at(offset) !== 0xff) {
                offset++;
                continue;
            }
            const marker = at(offset + 1);
            // standalone markers carry no length
            if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
                offset += 2;
                continue;
            }
            const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
            if (isStartOfFrame) {
                return { height: be16(offset + 5), width: be16(offset + 7), format: 'jpeg' };
            }
            offset += 2 + be16(offset + 2);
        }
        return null;
    }
    return null;
}

/**
 * Decide whether a chosen wallpaper is small enough to be worth loading.
 *
 * @param {object} input
 * @param {number} [sizeBytes] - File size on disk, -1 when unknown.
 * @param {string} [base64] - Bare base64 contents, when the file has already been read.
 * @returns {{ ok: boolean; reason: string; width: number; height: number }} Reason is one of
 *   "", "too_many_bytes", "too_many_pixels"
 */
function checkWallpaperSize(sizeBytes, base64) {
    const bytes = Number(sizeBytes);
    if (Number.isFinite(bytes) && bytes >= 0 && bytes > MAX_WALLPAPER_BYTES) {
        return { ok: false, reason: 'too_many_bytes', width: 0, height: 0 };
    }

    const size = parseImageSize(base64);
    if (!size || !size.width || !size.height) {
        // formats whose header we do not read (avif) still get the byte gate above,
        // and refusing them outright would break a picture that is probably fine
        return { ok: true, reason: '', width: 0, height: 0 };
    }
    if (size.width > MAX_WALLPAPER_WIDTH || size.height > MAX_WALLPAPER_HEIGHT) {
        return { ok: false, reason: 'too_many_pixels', width: size.width, height: size.height };
    }
    if (size.width * size.height > MAX_WALLPAPER_PIXELS) {
        return { ok: false, reason: 'too_many_pixels', width: size.width, height: size.height };
    }
    return { ok: true, reason: '', width: size.width, height: size.height };
}

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
    MAX_WALLPAPER_BYTES,
    MAX_WALLPAPER_HEIGHT,
    MAX_WALLPAPER_WIDTH,
    checkWallpaperSize,
    normalizeWallpaperSettings,
    parseImageSize,
    wallpaperBleed,
    wallpaperCssVariables,
    wallpaperDataUrl,
    wallpaperFillStyle,
    wallpaperImageStyle,
    wallpaperMimeType
};
