const DEFAULT_FOLDER_ICON = 'ri-folder-line';

// Everything this fork added to the Charts section, lifted into its own folder that
// sits at the very top of the menu. The keys keep their `charts-` prefix on purpose:
// renaming them would orphan the copies already saved in people's custom layouts,
// and the gate below would then drop the entire Charts folder.
const CANDY_FOLDER_ID = 'default-folder-candy';
const CANDY_KEYS = [
    'candy-auto-status',
    'charts-friend-footprints',
    'charts-friend-status-lights',
    'charts-friend-together'
];
const CHARTS_KEYS = ['charts-instance', 'charts-mutual', 'charts-hot-worlds'];

/**
 * Move the Candy pages into a single folder at the top of the menu.
 *
 * This runs as a pass over an already normalized layout rather than as a case inside
 * each branch, because a Candy key can arrive from four different places: the saved
 * layout's own Charts folder, a person's hand made folder, a leftover standalone item,
 * or the auto-append of definitions nobody has placed yet. Handling them in one place
 * is what makes the folder appear for people who already have a custom layout saved -
 * and a saved layout replaces the defaults completely, so without this the folder
 * would only ever show up for a fresh install.
 *
 * @param {Array} normalized - Layout to rewrite in place
 * @param {Map} definitionMap - Map of valid nav definition keys
 * @param {Set} hiddenSet - Keys the person has hidden
 * @param {Function} t - I18n translation function
 */
function relocateCandyEntries(normalized, definitionMap, hiddenSet, t) {
    const available = CANDY_KEYS.filter((key) => definitionMap.has(key) && !hiddenSet.has(key));
    if (!available.length) {
        return;
    }

    // Whatever order the person had, keep it; a folder that already exists wins
    // over the standalone items that might also name the same pages.
    const ordered = [];
    const keep = (key) => {
        if (available.includes(key) && !ordered.includes(key)) {
            ordered.push(key);
        }
    };

    // An existing folder is rewritten where it stands. Only a layout that has never
    // seen Candy gets it forced to the top - otherwise a person who deliberately
    // dragged it somewhere else would have it snap back on every load.
    const existing = normalized.find((e) => e.type === 'folder' && e.id === CANDY_FOLDER_ID) || null;
    if (existing && Array.isArray(existing.items)) {
        existing.items.forEach(keep);
    }

    for (const entry of normalized) {
        if (entry === existing || entry.type !== 'folder' || !Array.isArray(entry.items)) {
            continue;
        }
        entry.items = entry.items.filter((key) => {
            if (!CANDY_KEYS.includes(key)) {
                return true;
            }
            keep(key);
            return false;
        });
    }

    // Two passes on purpose. The order the pages end up in comes from a forward walk;
    // the removal has to go backwards or the indices shift under the splice.
    normalized.forEach((entry) => {
        if (entry.type === 'item' && CANDY_KEYS.includes(entry.key)) {
            keep(entry.key);
        }
    });

    for (let i = normalized.length - 1; i >= 0; i--) {
        const entry = normalized[i];
        if (entry.type === 'item' && CANDY_KEYS.includes(entry.key)) {
            normalized.splice(i, 1);
            continue;
        }
        if (entry.type === 'folder' && entry !== existing && Array.isArray(entry.items) && entry.items.length === 0) {
            normalized.splice(i, 1);
        }
    }

    if (!ordered.length) {
        return;
    }

    if (existing) {
        existing.items = ordered;
        return;
    }

    normalized.unshift({
        type: 'folder',
        id: CANDY_FOLDER_ID,
        nameKey: 'nav_tooltip.candy',
        name: t('nav_tooltip.candy'),
        icon: 'ri-cake-2-line',
        items: ordered
    });
}

/**
 * Deduplicate and validate hidden navigation keys against the definition map.
 *
 * @param {string[]} hiddenKeys - Keys to normalize
 * @param {Map} definitionMap - Map of valid nav definition keys
 * @returns {string[]} Normalized, deduplicated array of valid keys
 */
export function normalizeHiddenKeys(hiddenKeys, definitionMap) {
    if (!Array.isArray(hiddenKeys)) {
        return [];
    }
    const seen = new Set();
    const normalized = [];
    hiddenKeys.forEach((key) => {
        if (!key || seen.has(key) || !definitionMap.has(key)) {
            return;
        }
        seen.add(key);
        normalized.push(key);
    });
    return normalized;
}

/**
 * Normalize a saved navigation layout: dedup items, create folders, append missing definitions.
 *
 * @param {Array} layout - Raw layout from storage
 * @param {string[]} hiddenKeys - Keys that should be hidden
 * @param {Map} definitionMap - Map of all valid nav definition keys
 * @param {Array} allDefinitions - Array of all nav definitions (for appending missing)
 * @param {Function} t - I18n translation function
 * @param {Function} generateFolderId - Function to generate unique folder IDs
 * @returns {Array} Sanitized layout
 */
export function sanitizeLayout(layout, hiddenKeys, definitionMap, allDefinitions, t, generateFolderId) {
    const usedKeys = new Set();
    const normalizedHiddenKeys = normalizeHiddenKeys(hiddenKeys, definitionMap);
    const hiddenSet = new Set(normalizedHiddenKeys);
    const normalized = [];
    const chartsKeys = CHARTS_KEYS;

    const appendItemEntry = (key, target = normalized) => {
        if (!key || usedKeys.has(key) || !definitionMap.has(key)) {
            return;
        }
        target.push({ type: 'item', key });
        usedKeys.add(key);
    };

    const appendChartsFolder = (target = normalized) => {
        if (chartsKeys.some((key) => usedKeys.has(key))) {
            return;
        }
        if (!chartsKeys.every((key) => definitionMap.has(key))) {
            return;
        }
        chartsKeys.forEach((key) => usedKeys.add(key));
        target.push({
            type: 'folder',
            id: 'default-folder-charts',
            nameKey: 'nav_tooltip.charts',
            name: t('nav_tooltip.charts'),
            icon: 'ri-pie-chart-line',
            items: [...chartsKeys]
        });
    };

    if (Array.isArray(layout)) {
        layout.forEach((entry) => {
            if (entry?.type === 'item') {
                if (entry.key === 'charts') {
                    appendChartsFolder();
                    return;
                }
                appendItemEntry(entry.key);
                return;
            }

            if (entry?.type === 'folder') {
                const folderItems = [];
                (entry.items || []).forEach((key) => {
                    if (!key || usedKeys.has(key) || !definitionMap.has(key)) {
                        return;
                    }
                    folderItems.push(key);
                    usedKeys.add(key);
                });

                if (folderItems.length >= 1) {
                    const folderNameKey = entry.nameKey || null;
                    const folderName = folderNameKey ? t(folderNameKey) : entry.name || '';
                    normalized.push({
                        type: 'folder',
                        id: entry.id || generateFolderId(),
                        name: folderName,
                        nameKey: folderNameKey,
                        icon: entry.icon || DEFAULT_FOLDER_ICON,
                        items: folderItems
                    });
                }
            }
        });
    }

    allDefinitions.forEach((item) => {
        if (!usedKeys.has(item.key) && !hiddenSet.has(item.key)) {
            if (chartsKeys.includes(item.key)) {
                const chartsFolder = normalized.find(
                    (entry) => entry.type === 'folder' && entry.id === 'default-folder-charts'
                );
                if (chartsFolder && Array.isArray(chartsFolder.items)) {
                    chartsFolder.items.push(item.key);
                    usedKeys.add(item.key);
                    return;
                }
            }
            appendItemEntry(item.key);
        }
    });

    if (!chartsKeys.some((key) => usedKeys.has(key)) && !chartsKeys.some((key) => hiddenSet.has(key))) {
        appendChartsFolder();
    }

    // Before the direct-access fixup, so the pinned-to-the-bottom entry stays pinned.
    relocateCandyEntries(normalized, definitionMap, hiddenSet, t);

    // Ensure direct-access is always the last item
    const directAccessIdx = normalized.findIndex((entry) => entry.type === 'item' && entry.key === 'direct-access');
    if (directAccessIdx !== -1 && directAccessIdx !== normalized.length - 1) {
        const [directAccessEntry] = normalized.splice(directAccessIdx, 1);
        normalized.push(directAccessEntry);
    }

    return normalized;
}

/**
 * Find the first routable navigation key in a layout.
 *
 * @param {Array} layout - Navigation layout
 * @param {Map} definitionMap - Map of nav definitions
 * @returns {string | null} The route name of the first routable entry, or null
 */
export function getFirstNavRoute(layout, definitionMap) {
    for (const entry of layout) {
        if (entry.type === 'item') {
            const definition = definitionMap.get(entry.key);
            if (definition?.routeName) {
                return definition.routeName;
            }
        }
        if (entry.type === 'folder' && entry.items?.length) {
            const definition = entry.items.map((key) => definitionMap.get(key)).find((def) => def?.routeName);
            if (definition?.routeName) {
                return definition.routeName;
            }
        }
    }
    return null;
}

/**
 * Check if a navigation entry has a notification indicator.
 *
 * @param {object} entry - Navigation entry object
 * @param {string[]} notifiedMenus - List of menu keys with notifications
 * @returns {boolean}
 */
export function isEntryNotified(entry, notifiedMenus) {
    if (!entry) {
        return false;
    }
    const targets = [];
    if (entry.index) {
        targets.push(entry.index);
    }
    if (entry.routeName) {
        targets.push(entry.routeName);
    }
    if (entry.path) {
        const lastSegment = entry.path.split('/').pop();
        if (lastSegment) {
            targets.push(lastSegment);
        }
    }
    if (!Array.isArray(notifiedMenus)) {
        return false;
    }
    return targets.some((key) => notifiedMenus.includes(key));
}
