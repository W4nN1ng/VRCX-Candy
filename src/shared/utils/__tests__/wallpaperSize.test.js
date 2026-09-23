import { describe, expect, test } from 'vitest';

import { MAX_WALLPAPER_BYTES, checkWallpaperSize, parseImageSize, wallpaperMimeType } from '../wallpaper';

/**
 * @param {number[]} bytes
 * @returns {string}
 */
function toBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

function pad(bytes, total) {
    const out = [...bytes];
    while (out.length < total) {
        out.push(0);
    }
    return out;
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function png(width, height) {
    const bytes = [
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a, // signature
        0x00,
        0x00,
        0x00,
        0x0d, // IHDR chunk length
        0x49,
        0x48,
        0x44,
        0x52, // "IHDR"
        (width >>> 24) & 0xff,
        (width >>> 16) & 0xff,
        (width >>> 8) & 0xff,
        width & 0xff,
        (height >>> 24) & 0xff,
        (height >>> 16) & 0xff,
        (height >>> 8) & 0xff,
        height & 0xff,
        8,
        6,
        0,
        0,
        0
    ];
    return toBase64(pad(bytes, 64));
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function jpeg(width, height) {
    const bytes = [
        0xff,
        0xd8, // SOI
        // a DQT segment the walker has to skip: length 3 counts itself plus one payload byte
        0xff,
        0xdb,
        0x00,
        0x03,
        0x01,
        0xff,
        0xc0,
        0x00,
        0x11,
        0x08, // SOF0: length, precision
        (height >>> 8) & 0xff,
        height & 0xff,
        (width >>> 8) & 0xff,
        width & 0xff
    ];
    return toBase64(pad(bytes, 64));
}

function gif(width, height) {
    return toBase64(
        pad(
            [
                0x47,
                0x49,
                0x46,
                0x38,
                0x39,
                0x61,
                width & 0xff,
                (width >> 8) & 0xff,
                height & 0xff,
                (height >> 8) & 0xff
            ],
            64
        )
    );
}

function bmp(width, height) {
    const bytes = [0x42, 0x4d];
    bytes.push(...new Array(16).fill(0));
    bytes.push(width & 0xff, (width >> 8) & 0xff, (width >> 16) & 0xff, (width >> 24) & 0xff);
    bytes.push(height & 0xff, (height >> 8) & 0xff, (height >> 16) & 0xff, (height >> 24) & 0xff);
    return toBase64(pad(bytes, 64));
}

function webpExtended(width, height) {
    const w = width - 1;
    const h = height - 1;
    const bytes = [
        0x52,
        0x49,
        0x46,
        0x46,
        0x00,
        0x00,
        0x00,
        0x00, // RIFF + size
        0x57,
        0x45,
        0x42,
        0x50, // WEBP
        0x56,
        0x50,
        0x38,
        0x58,
        0x0a,
        0x00,
        0x00,
        0x00, // "VP8X" + chunk size
        0x00,
        w & 0xff,
        (w >> 8) & 0xff,
        (w >> 16) & 0xff,
        h & 0xff,
        (h >> 8) & 0xff,
        (h >> 16) & 0xff
    ];
    return toBase64(pad(bytes, 64));
}

describe('parseImageSize', () => {
    test('reads png', () => {
        expect(parseImageSize(png(1234, 567))).toEqual({ width: 1234, height: 567, format: 'png' });
    });

    test('reads jpeg past a leading marker segment', () => {
        expect(parseImageSize(jpeg(8, 4))).toEqual({ width: 8, height: 4, format: 'jpeg' });
    });

    test('reads gif and bmp', () => {
        expect(parseImageSize(gif(640, 480))).toMatchObject({ width: 640, height: 480, format: 'gif' });
        expect(parseImageSize(bmp(800, 600))).toMatchObject({ width: 800, height: 600, format: 'bmp' });
    });

    test('reads webp VP8X, which stores size minus one', () => {
        expect(parseImageSize(webpExtended(1024, 768))).toMatchObject({ width: 1024, height: 768, format: 'webp' });
    });

    test('returns null for unknown or truncated input', () => {
        expect(parseImageSize('')).toBeNull();
        expect(parseImageSize(toBase64(pad([1, 2, 3], 10)))).toBeNull();
        expect(parseImageSize('not base64 at all!!!')).toBeNull();
    });
});

describe('checkWallpaperSize', () => {
    test('accepts a 4K picture', () => {
        expect(checkWallpaperSize(5_000_000, png(3840, 2160)).ok).toBe(true);
    });

    test('rejects an 8K screenshot by pixels', () => {
        const result = checkWallpaperSize(60_000_000, png(7680, 4320));
        expect(result).toMatchObject({ ok: false, reason: 'too_many_pixels', width: 7680, height: 4320 });
    });

    test('rejects an over-wide but short picture', () => {
        expect(checkWallpaperSize(1000, png(4000, 1000)).reason).toBe('too_many_pixels');
    });

    test('rejects a square that fits each edge but not the pixel budget', () => {
        expect(checkWallpaperSize(1000, png(3000, 3000)).reason).toBe('too_many_pixels');
    });

    test('refuses to even read a huge file', () => {
        const result = checkWallpaperSize(MAX_WALLPAPER_BYTES + 1, '');
        expect(result).toMatchObject({ ok: false, reason: 'too_many_bytes' });
    });

    test('lets through formats whose header we cannot parse', () => {
        // avif and friends are still bounded by the byte gate above
        expect(checkWallpaperSize(4_000_000, toBase64(pad([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70], 64))).ok).toBe(true);
    });

    test('treats an unknown file size as unknown rather than zero', () => {
        expect(checkWallpaperSize(-1, png(7680, 4320)).reason).toBe('too_many_pixels');
        expect(checkWallpaperSize(undefined, png(800, 600)).ok).toBe(true);
    });
});

describe('wallpaperMimeType', () => {
    test('maps the extensions the chooser offers', () => {
        expect(wallpaperMimeType('a/b/c.PNG')).toBe('image/png');
        expect(wallpaperMimeType('shot.jpeg')).toBe('image/jpeg');
        expect(wallpaperMimeType('anim.webp')).toBe('image/webp');
        expect(wallpaperMimeType('no-extension')).toBe('image/png');
    });
});
