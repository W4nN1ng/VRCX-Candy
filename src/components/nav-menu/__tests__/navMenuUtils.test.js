import { describe, expect, test } from 'vitest';

import { getFirstNavRoute, isEntryNotified, normalizeHiddenKeys, sanitizeLayout } from '../navMenuUtils';

// Minimal nav definitions for testing
const testDefinitions = [
    { key: 'feed', routeName: 'feed' },
    { key: 'search', routeName: 'search' },
    { key: 'tools', routeName: 'tools' },
    { key: 'charts-instance', routeName: 'charts-instance' },
    { key: 'charts-mutual', routeName: 'charts-mutual' },
    { key: 'charts-hot-worlds', routeName: 'charts-hot-worlds' },
    { key: 'charts-friend-footprints', routeName: 'charts-friend-footprints' },
    { key: 'charts-friend-status-lights', routeName: 'charts-friend-status-lights' },
    { key: 'charts-friend-together', routeName: 'charts-friend-together' },
    { key: 'candy-auto-status', routeName: 'candy-auto-status' },
    { key: 'notification', routeName: 'notification' },
    { key: 'direct-access', action: 'direct-access' }
];
const testDefinitionMap = new Map(testDefinitions.map((d) => [d.key, d]));
const mockT = (key) => `translated:${key}`;
const mockGenerateFolderId = () => 'generated-folder-id';

// The folder also picks up any Candy page the auto-append pass had left loose, so the
// page-order assertions look at the three this feature moves rather than the whole list.
const candyPages = (items) => items.filter((key) => key.startsWith('charts-friend-'));

// ─── normalizeHiddenKeys ─────────────────────────────────────────────

describe('normalizeHiddenKeys', () => {
    test('returns empty array for non-array input', () => {
        expect(normalizeHiddenKeys(null, testDefinitionMap)).toEqual([]);
        expect(normalizeHiddenKeys(undefined, testDefinitionMap)).toEqual([]);
        expect(normalizeHiddenKeys('string', testDefinitionMap)).toEqual([]);
        expect(normalizeHiddenKeys(42, testDefinitionMap)).toEqual([]);
    });

    test('returns empty array for empty array', () => {
        expect(normalizeHiddenKeys([], testDefinitionMap)).toEqual([]);
    });

    test('filters out invalid keys', () => {
        expect(normalizeHiddenKeys(['feed', 'nonexistent', 'search'], testDefinitionMap)).toEqual(['feed', 'search']);
    });

    test('deduplicates keys', () => {
        expect(normalizeHiddenKeys(['feed', 'feed', 'search'], testDefinitionMap)).toEqual(['feed', 'search']);
    });

    test('filters out falsy values', () => {
        expect(normalizeHiddenKeys([null, '', undefined, 'feed'], testDefinitionMap)).toEqual(['feed']);
    });

    test('preserves order of valid keys', () => {
        expect(normalizeHiddenKeys(['tools', 'feed', 'search'], testDefinitionMap)).toEqual([
            'tools',
            'feed',
            'search'
        ]);
    });
});

// ─── getFirstNavRoute ────────────────────────────────────────────────

describe('getFirstNavRoute', () => {
    test('returns null for empty layout', () => {
        expect(getFirstNavRoute([], testDefinitionMap)).toBeNull();
    });

    test('returns first item routeName', () => {
        const layout = [{ type: 'item', key: 'feed' }];
        expect(getFirstNavRoute(layout, testDefinitionMap)).toBe('feed');
    });

    test('skips items without routeName', () => {
        const layout = [
            { type: 'item', key: 'direct-access' },
            { type: 'item', key: 'search' }
        ];
        expect(getFirstNavRoute(layout, testDefinitionMap)).toBe('search');
    });

    test('returns route from folder items', () => {
        const layout = [
            {
                type: 'folder',
                items: ['feed', 'search']
            }
        ];
        expect(getFirstNavRoute(layout, testDefinitionMap)).toBe('feed');
    });

    test('returns null when no routable items exist', () => {
        const layout = [{ type: 'item', key: 'direct-access' }];
        expect(getFirstNavRoute(layout, testDefinitionMap)).toBeNull();
    });

    test('returns null for unknown keys', () => {
        const layout = [{ type: 'item', key: 'unknown' }];
        expect(getFirstNavRoute(layout, testDefinitionMap)).toBeNull();
    });

    test('checks folder items for routable entry', () => {
        const layout = [
            {
                type: 'folder',
                items: ['direct-access', 'tools']
            }
        ];
        expect(getFirstNavRoute(layout, testDefinitionMap)).toBe('tools');
    });
});

// ─── isEntryNotified ─────────────────────────────────────────────────

describe('isEntryNotified', () => {
    test('returns false for null/undefined entry', () => {
        expect(isEntryNotified(null, ['feed'])).toBe(false);
        expect(isEntryNotified(undefined, ['feed'])).toBe(false);
    });

    test('matches by index', () => {
        const entry = { index: 'feed' };
        expect(isEntryNotified(entry, ['feed', 'search'])).toBe(true);
    });

    test('matches by routeName', () => {
        const entry = { routeName: 'search' };
        expect(isEntryNotified(entry, ['search'])).toBe(true);
    });

    test('matches by path last segment', () => {
        const entry = { path: '/app/settings' };
        expect(isEntryNotified(entry, ['settings'])).toBe(true);
    });

    test('returns false when no match', () => {
        const entry = { index: 'feed', routeName: 'feed' };
        expect(isEntryNotified(entry, ['search', 'tools'])).toBe(false);
    });

    test('matches any of multiple targets', () => {
        const entry = {
            index: 'feed',
            routeName: 'home',
            path: '/app/dashboard'
        };
        expect(isEntryNotified(entry, ['dashboard'])).toBe(true);
    });

    test('returns false for empty notifiedMenus', () => {
        const entry = { index: 'feed' };
        expect(isEntryNotified(entry, [])).toBe(false);
    });
});

// ─── sanitizeLayout ──────────────────────────────────────────────────

describe('sanitizeLayout', () => {
    const runSanitize = (layout, hiddenKeys = []) =>
        sanitizeLayout(layout, hiddenKeys, testDefinitionMap, testDefinitions, mockT, mockGenerateFolderId);

    test('returns default items for null/undefined layout', () => {
        const result = runSanitize(null);
        // Should include all non-chart items + charts folder
        expect(result.length).toBeGreaterThan(0);
        expect(result.some((e) => e.type === 'item' && e.key === 'feed')).toBe(true);
    });

    test('preserves valid item entries', () => {
        const layout = [{ type: 'item', key: 'feed' }];
        const result = runSanitize(layout);
        // Not result[0]: the Candy folder is created at the top of a layout that has
        // never seen it, which is the point of the feature.
        expect(result[0].id).toBe('default-folder-candy');
        expect(result.find((e) => e.type === 'item' && e.key === 'feed')).toEqual({ type: 'item', key: 'feed' });
    });

    test('skips invalid item keys', () => {
        const layout = [
            { type: 'item', key: 'feed' },
            { type: 'item', key: 'nonexistent' }
        ];
        const result = runSanitize(layout);
        expect(result.find((e) => e.key === 'nonexistent')).toBeUndefined();
    });

    test('deduplicates item keys', () => {
        const layout = [
            { type: 'item', key: 'feed' },
            { type: 'item', key: 'feed' }
        ];
        const result = runSanitize(layout);
        const feedEntries = result.filter((e) => e.type === 'item' && e.key === 'feed');
        expect(feedEntries.length).toBe(1);
    });

    test('creates folder entries from valid items', () => {
        const layout = [
            {
                type: 'folder',
                id: 'my-folder',
                name: 'My Folder',
                icon: 'ri-star-line',
                items: ['feed', 'search']
            }
        ];
        const result = runSanitize(layout);
        const folder = result.find((e) => e.type === 'folder' && e.id === 'my-folder');
        expect(folder).toBeDefined();
        expect(folder.items).toEqual(['feed', 'search']);
        expect(folder.name).toBe('My Folder');
    });

    test('generates folder ID when missing', () => {
        const layout = [
            {
                type: 'folder',
                name: 'No ID Folder',
                items: ['feed']
            }
        ];
        const result = runSanitize(layout);
        const folder = result.find((e) => e.type === 'folder' && e.id === 'generated-folder-id');
        expect(folder.id).toBe('generated-folder-id');
    });

    test('translates folder name from nameKey', () => {
        const layout = [
            {
                type: 'folder',
                id: 'f1',
                nameKey: 'nav_tooltip.favorites',
                items: ['feed']
            }
        ];
        const result = runSanitize(layout);
        const folder = result.find((e) => e.type === 'folder' && e.id === 'f1');
        expect(folder.name).toBe('translated:nav_tooltip.favorites');
    });

    test('appends missing definitions not in layout or hidden', () => {
        const layout = [{ type: 'item', key: 'feed' }];
        const result = runSanitize(layout);
        // All non-chart, non-hidden items should be present
        expect(result.some((e) => e.key === 'search')).toBe(true);
        expect(result.some((e) => e.key === 'tools')).toBe(true);
    });

    test('does not append hidden keys', () => {
        const layout = [{ type: 'item', key: 'feed' }];
        const result = runSanitize(layout, ['search', 'tools']);
        expect(result.find((e) => e.type === 'item' && e.key === 'search')).toBeUndefined();
        expect(result.find((e) => e.type === 'item' && e.key === 'tools')).toBeUndefined();
    });

    test('converts legacy "charts" item to charts folder', () => {
        const layout = [{ type: 'item', key: 'charts' }];
        const result = runSanitize(layout);
        const chartsFolder = result.find((e) => e.type === 'folder' && e.id === 'default-folder-charts');
        expect(chartsFolder).toBeDefined();
        // The three fork-authored pages left this folder for good; a layout saved
        // before they existed still must not lose them, so they surface under Candy.
        expect(chartsFolder.items).toEqual(['charts-instance', 'charts-mutual', 'charts-hot-worlds']);
        const candyFolder = result.find((e) => e.type === 'folder' && e.id === 'default-folder-candy');
        expect(candyPages(candyFolder.items)).toEqual([
            'charts-friend-footprints',
            'charts-friend-status-lights',
            'charts-friend-together'
        ]);
    });

    test('lifts candy pages out of a saved charts folder and puts them on top', () => {
        // This is the case that decides whether an existing install ever sees the
        // feature: a saved layout replaces the defaults completely.
        const layout = [
            { type: 'item', key: 'feed' },
            {
                type: 'folder',
                id: 'default-folder-charts',
                nameKey: 'nav_tooltip.charts',
                items: [
                    'charts-instance',
                    'charts-friend-footprints',
                    'charts-mutual',
                    'charts-friend-status-lights',
                    'charts-hot-worlds',
                    'charts-friend-together'
                ]
            }
        ];
        const result = runSanitize(layout);
        expect(result[0].id).toBe('default-folder-candy');
        const chartsFolder = result.find((e) => e.type === 'folder' && e.id === 'default-folder-charts');
        expect(chartsFolder.items).toEqual(['charts-instance', 'charts-mutual', 'charts-hot-worlds']);
        expect(candyPages(result[0].items)).toEqual([
            'charts-friend-footprints',
            'charts-friend-status-lights',
            'charts-friend-together'
        ]);
    });

    test('keeps a Candy folder where the person put it', () => {
        const layout = [
            { type: 'item', key: 'feed' },
            {
                type: 'folder',
                id: 'default-folder-candy',
                nameKey: 'nav_tooltip.candy',
                items: ['charts-friend-together', 'charts-friend-status-lights', 'charts-friend-footprints']
            },
            { type: 'item', key: 'tools' }
        ];
        const result = runSanitize(layout);
        // Already present, so it is left alone - and its own order is respected.
        expect(result[0].key).toBe('feed');
        expect(result[1].id).toBe('default-folder-candy');
        // the person's own order survives
        expect(candyPages(result[1].items)).toEqual([
            'charts-friend-together',
            'charts-friend-status-lights',
            'charts-friend-footprints'
        ]);
    });

    test('does not resurrect a hidden candy page', () => {
        const layout = [{ type: 'item', key: 'feed' }];
        const result = runSanitize(layout, ['charts-friend-together']);
        const candyFolder = result.find((e) => e.type === 'folder' && e.id === 'default-folder-candy');
        expect(candyPages(candyFolder.items)).toEqual(['charts-friend-footprints', 'charts-friend-status-lights']);
    });

    test('auto-appends charts folder when charts keys are neither used nor hidden', () => {
        const layout = [{ type: 'item', key: 'feed' }];
        const result = runSanitize(layout);
        const chartsFolder = result.find((e) => e.type === 'folder' && e.id === 'default-folder-charts');
        expect(chartsFolder).toBeDefined();
    });

    test('skips empty folders', () => {
        const layout = [
            {
                type: 'folder',
                id: 'empty-folder',
                name: 'Empty',
                items: []
            }
        ];
        const result = runSanitize(layout);
        expect(result.find((e) => e.id === 'empty-folder')).toBeUndefined();
    });
});
