import { describe, expect, test } from 'vitest';

import {
    decideGroupInvite,
    GROUP_INVITE_ALREADY_SEEN,
    GROUP_INVITE_ALREADY_SETTLED,
    GROUP_INVITE_ASK,
    GROUP_INVITE_SETTLED_STATES
} from '../groupInvite';

describe('decideGroupInvite', () => {
    test('asks a stranger to the group', () => {
        expect(decideGroupInvite({ seen: false, membershipStatus: 'none' })).toBe(GROUP_INVITE_ASK);
    });

    test('never asks somebody who is already in the group', () => {
        expect(decideGroupInvite({ seen: false, membershipStatus: 'member' })).toBe(GROUP_INVITE_ALREADY_SETTLED);
    });

    test('leaves alone anybody who already dealt with the group', () => {
        for (const status of GROUP_INVITE_SETTLED_STATES) {
            expect(decideGroupInvite({ seen: false, membershipStatus: status })).toBe(GROUP_INVITE_ALREADY_SETTLED);
        }
    });

    test('does not ask twice', () => {
        expect(decideGroupInvite({ seen: true, membershipStatus: 'none' })).toBe(GROUP_INVITE_ALREADY_SEEN);
    });

    test('reads the status the way the API actually spells it', () => {
        expect(decideGroupInvite({ membershipStatus: ' Member ' })).toBe(GROUP_INVITE_ALREADY_SETTLED);
        expect(decideGroupInvite({ membershipStatus: 'MEMBER' })).toBe(GROUP_INVITE_ALREADY_SETTLED);
    });

    test('an absent or unknown status is treated as a stranger, so the prompt survives', () => {
        expect(decideGroupInvite({ membershipStatus: undefined })).toBe(GROUP_INVITE_ASK);
        expect(decideGroupInvite({ membershipStatus: null })).toBe(GROUP_INVITE_ASK);
        expect(decideGroupInvite({ membershipStatus: '' })).toBe(GROUP_INVITE_ASK);
        expect(decideGroupInvite({ membershipStatus: 'something-new' })).toBe(GROUP_INVITE_ASK);
        expect(decideGroupInvite()).toBe(GROUP_INVITE_ASK);
    });

    test('the answer comes from the live status, never from a stored group list', () => {
        // Regression: the caller used to consult the group list in the store, which is
        // the previous session's membership written to a config row and only replaced
        // once the new list arrives. Somebody who had left the group in between was
        // still listed in it, was taken for a member, and so never saw the prompt.
        // There is deliberately no argument here that could carry that list.
        const withAStaleListInReach = {
            seen: false,
            membershipStatus: 'none',
            currentUserGroups: new Map([['grp_3d453804-fcd8-4187-9c36-1dc2a1d5b2ce', {}]])
        };

        expect(decideGroupInvite(withAStaleListInReach)).toBe(GROUP_INVITE_ASK);
    });
});
