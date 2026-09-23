import { describe, expect, test } from 'vitest';

import { formatDifference } from '../diff';

describe('formatDifference', () => {
    test('marks added and removed words', () => {
        const html = formatDifference('我喜欢你', '我不喜欢你');

        expect(html).toContain('x-text-removed');
        expect(html).toContain('x-text-added');
    });

    test('keeps shared words unmarked', () => {
        const html = formatDifference('hello world', 'hello there');

        expect(html).toContain('hello');
        expect(html).not.toContain('>hello<');
        expect(html).toContain('x-text-added');
    });

    test('escapes html before diffing', () => {
        const html = formatDifference('<img src=x onerror=alert(1)>', 'safe');

        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    test('converts line breaks into br tags', () => {
        const html = formatDifference('line1\nline2', 'line1\nline3');

        expect(html).toContain('<br>');
    });

    test('supports custom markers', () => {
        const html = formatDifference('a b', 'a c', '[+{{text}}]', '[-{{text}}]');

        expect(html).toContain('[-b]');
        expect(html).toContain('[+c]');
    });

    test('handles missing input', () => {
        expect(formatDifference(null, undefined)).toBe('');
        expect(formatDifference('', 'added')).toContain('x-text-added');
    });
});
