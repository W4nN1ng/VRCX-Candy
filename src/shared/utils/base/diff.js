/**
 * Word level difference formatter shared by the feed and the bio history views.
 */

const DEFAULT_MARKER_ADDITION = '<span class="x-text-added">{{text}}</span>';
const DEFAULT_MARKER_DELETION = '<span class="x-text-removed">{{text}}</span>';

/**
 * Escape text so it can be injected as HTML while keeping line breaks.
 *
 * @param {any} value - Raw text.
 * @returns {string} Escaped text using `<br>` for line breaks.
 */
function escapeForHtml(value) {
    return String(value ?? '')
        .replaceAll(/&/g, '&amp;')
        .replaceAll(/</g, '&lt;')
        .replaceAll(/>/g, '&gt;')
        .replaceAll(/"/g, '&quot;')
        .replaceAll(/'/g, '&#039;')
        .replaceAll(/\n/g, '<br>');
}

/**
 * Format the differences between two strings with HTML tags.
 *
 * @param {any} oldString - Previous text.
 * @param {any} newString - Updated text.
 * @param {string} [markerAddition] - Template for added text, `{{text}}` is replaced.
 * @param {string} [markerDeletion] - Template for removed text, `{{text}}` is replaced.
 * @returns {string} HTML string containing both texts with the differences marked up.
 */
function formatDifference(
    oldString,
    newString,
    markerAddition = DEFAULT_MARKER_ADDITION,
    markerDeletion = DEFAULT_MARKER_DELETION
) {
    const escapedOldString = escapeForHtml(oldString);
    const escapedNewString = escapeForHtml(newString);

    const oldWords = escapedOldString.split(/\s+/).flatMap((word) => word.split(/(<br>)/));
    const newWords = escapedNewString.split(/\s+/).flatMap((word) => word.split(/(<br>)/));

    function findLongestMatch(oldStart, oldEnd, newStart, newEnd) {
        let bestOldStart = oldStart;
        let bestNewStart = newStart;
        let bestSize = 0;

        const lookup = new Map();
        for (let i = oldStart; i < oldEnd; i++) {
            const word = oldWords[i];
            if (!lookup.has(word)) lookup.set(word, []);
            lookup.get(word).push(i);
        }

        for (let j = newStart; j < newEnd; j++) {
            const word = newWords[j];
            if (!lookup.has(word)) continue;

            for (const i of lookup.get(word)) {
                let size = 0;
                while (i + size < oldEnd && j + size < newEnd && oldWords[i + size] === newWords[j + size]) {
                    size++;
                }
                if (size > bestSize) {
                    bestOldStart = i;
                    bestNewStart = j;
                    bestSize = size;
                }
            }
        }

        return {
            oldStart: bestOldStart,
            newStart: bestNewStart,
            size: bestSize
        };
    }

    function buildDiff(oldStart, oldEnd, newStart, newEnd) {
        const result = [];
        const match = findLongestMatch(oldStart, oldEnd, newStart, newEnd);

        if (match.size > 0) {
            // Handle differences before the match
            if (oldStart < match.oldStart || newStart < match.newStart) {
                result.push(...buildDiff(oldStart, match.oldStart, newStart, match.newStart));
            }

            // Add the matched words
            result.push(oldWords.slice(match.oldStart, match.oldStart + match.size).join(' '));

            // Handle differences after the match
            if (match.oldStart + match.size < oldEnd || match.newStart + match.size < newEnd) {
                result.push(...buildDiff(match.oldStart + match.size, oldEnd, match.newStart + match.size, newEnd));
            }
        } else {
            function build(words, start, end, pattern) {
                const r = [];
                const ts = words
                    .slice(start, end)
                    .filter((w) => w.length > 0)
                    .join(' ')
                    .split('<br>');
                for (let i = 0; i < ts.length; i++) {
                    if (i > 0) r.push('<br>');
                    if (ts[i].length < 1) continue;
                    r.push(pattern.replace('{{text}}', ts[i]));
                }
                return r;
            }

            // Add deletions
            if (oldStart < oldEnd) result.push(...build(oldWords, oldStart, oldEnd, markerDeletion));

            // Add insertions
            if (newStart < newEnd) result.push(...build(newWords, newStart, newEnd, markerAddition));
        }

        return result;
    }

    return buildDiff(0, oldWords.length, 0, newWords.length)
        .join(' ')
        .replace(/<br>[ ]+<br>/g, '<br><br>')
        .replace(/<br> /g, '<br>');
}

export { formatDifference };
