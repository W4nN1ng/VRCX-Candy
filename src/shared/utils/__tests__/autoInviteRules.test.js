import { describe, expect, test } from 'vitest';

import {
    decideAutoInvite,
    insideWindow,
    isOwnInviteRoom,
    minuteOfDayOf,
    normalizeAutoInviteRule,
    normalizeAutoInviteSettings,
    normalizeAutoInviteState
} from '../autoInviteRules';

const ME = 'usr_me';
const FRIEND = 'usr_friend';
const OTHER = 'usr_other';

/** A room the current user owns, which is the only shape this feature may act on. */
function myRoom(kind = 'friends') {
    const map = {
        friends: `wrld_1:10~friends(${ME})~region(jp)`,
        invite: `wrld_1:10~private(${ME})~region(jp)`,
        invitePlus: `wrld_1:10~private(${ME})~canRequestInvite~region(jp)`,
        hidden: `wrld_1:10~hidden(${ME})~region(jp)`
    };
    return map[kind];
}

function request(overrides = {}) {
    return { id: 'noti_1', type: 'requestInvite', senderUserId: FRIEND, ...overrides };
}

function settings(overrides = {}) {
    return { enabled: true, ...overrides };
}

function decide(overrides = {}) {
    return decideAutoInvite({
        notification: request(),
        settings: settings(),
        rules: [{ userId: FRIEND, enabled: true, displayName: 'A' }],
        context: { currentUserId: ME, locationTag: myRoom(), status: 'ask me', todayCount: 0 },
        now: new Date(2026, 8, 20, 3, 0).getTime(),
        ...overrides
    });
}

describe('normalizeAutoInviteRule', () => {
    test('keeps only rows that carry a real user id', () => {
        expect(normalizeAutoInviteRule({ userId: FRIEND })).toMatchObject({ userId: FRIEND, enabled: true });
        expect(normalizeAutoInviteRule({ userId: 'garbage' })).toBeNull();
        expect(normalizeAutoInviteRule({ userId: '' })).toBeNull();
        expect(normalizeAutoInviteRule(null)).toBeNull();
        expect(normalizeAutoInviteRule('usr_x')).toBeNull();
    });

    test('a disabled row stays disabled and an absent flag means enabled', () => {
        expect(normalizeAutoInviteRule({ userId: FRIEND, enabled: false }).enabled).toBe(false);
        expect(normalizeAutoInviteRule({ userId: FRIEND }).enabled).toBe(true);
    });

    test('clamps the name and derives an id when none was stored', () => {
        const rule = normalizeAutoInviteRule({ userId: FRIEND, displayName: 'x'.repeat(90) }, 3);
        expect(rule.displayName).toHaveLength(60);
        expect(rule.id).toContain('usr_friend');
    });
});

describe('normalizeAutoInviteSettings', () => {
    test('is off until it is switched on', () => {
        expect(normalizeAutoInviteSettings({}).enabled).toBe(false);
        expect(normalizeAutoInviteSettings({ enabled: 'yes' }).enabled).toBe(false);
        expect(normalizeAutoInviteSettings({ enabled: true }).enabled).toBe(true);
    });

    test('notifies by default and can be silenced', () => {
        expect(normalizeAutoInviteSettings({}).notify).toBe(true);
        expect(normalizeAutoInviteSettings({ notify: false }).notify).toBe(false);
    });

    test('keeps the daily limit inside its bounds', () => {
        expect(normalizeAutoInviteSettings({}).dailyLimit).toBe(10);
        expect(normalizeAutoInviteSettings({ dailyLimit: 0 }).dailyLimit).toBe(1);
        expect(normalizeAutoInviteSettings({ dailyLimit: 9999 }).dailyLimit).toBe(50);
        expect(normalizeAutoInviteSettings({ dailyLimit: 'nope' }).dailyLimit).toBe(10);
    });

    test('drops a half-shaped window object instead of throwing', () => {
        const state = normalizeAutoInviteSettings({ window: 'nope' });
        expect(state.window).toEqual({ enabled: false, fromMinute: 0, toMinute: 1439 });
    });
});

describe('insideWindow', () => {
    test('reads a normal window forwards', () => {
        expect(insideWindow(600, 540, 660)).toBe(true);
        expect(insideWindow(540, 540, 660)).toBe(true);
        expect(insideWindow(660, 540, 660)).toBe(false);
    });

    test('reads a window that runs through midnight', () => {
        // 22:00 to 08:00, the case the feature exists for
        expect(insideWindow(23 * 60, 22 * 60, 8 * 60)).toBe(true);
        expect(insideWindow(2 * 60, 22 * 60, 8 * 60)).toBe(true);
        expect(insideWindow(7 * 60 + 59, 22 * 60, 8 * 60)).toBe(true);
        expect(insideWindow(8 * 60, 22 * 60, 8 * 60)).toBe(false);
        expect(insideWindow(12 * 60, 22 * 60, 8 * 60)).toBe(false);
    });

    test('treats an empty window as all day', () => {
        expect(insideWindow(12 * 60, 60, 60)).toBe(true);
    });

    test('uses local minutes of the day', () => {
        expect(minuteOfDayOf(new Date(2026, 8, 20, 3, 20).getTime())).toBe(200);
    });
});

describe('isOwnInviteRoom', () => {
    test('accepts every room shape I own', () => {
        for (const kind of ['friends', 'invite', 'invitePlus', 'hidden']) {
            expect(isOwnInviteRoom(myRoom(kind), ME)).toBe(true);
        }
    });

    test('refuses public and group rooms, where an invite is not mine to give', () => {
        expect(isOwnInviteRoom('wrld_1:10~region(jp)', ME)).toBe(false);
        expect(isOwnInviteRoom('wrld_1:10~group(grp_1)~groupAccessType(public)~region(jp)', ME)).toBe(false);
    });

    test('refuses somebody else’s private room even if I am standing in it', () => {
        expect(isOwnInviteRoom(`wrld_1:10~friends(${OTHER})~region(jp)`, ME)).toBe(false);
    });

    test('refuses locations that are not a room at all', () => {
        expect(isOwnInviteRoom('', ME)).toBe(false);
        expect(isOwnInviteRoom('offline', ME)).toBe(false);
        expect(isOwnInviteRoom('traveling:traveling', ME)).toBe(false);
        expect(isOwnInviteRoom(myRoom(), '')).toBe(false);
        expect(isOwnInviteRoom(myRoom(), undefined)).toBe(false);
    });
});

describe('decideAutoInvite', () => {
    test('accepts when everything lines up', () => {
        expect(decide()).toEqual({
            action: 'accept',
            reason: 'accepted',
            rule: { userId: FRIEND, enabled: true, displayName: 'A' }
        });
    });

    test('says nothing about notifications that are not a knock on my door', () => {
        expect(decide({ notification: request({ type: 'invite' }) }).action).toBe('none');
        expect(decide({ notification: request({ type: 'friendRequest' }) }).action).toBe('none');
    });

    test('skips while the feature is off', () => {
        expect(decide({ settings: settings({ enabled: false }) }).reason).toBe('disabled');
    });

    test('skips a sender who is not on the list, and one whose row is switched off', () => {
        expect(decide({ notification: request({ senderUserId: OTHER }) }).reason).toBe('not-listed');
        expect(decide({ rules: [{ userId: FRIEND, enabled: false }] }).reason).toBe('not-listed');
    });

    test('skips unless the room is mine', () => {
        expect(decide({ context: { currentUserId: ME, locationTag: '', status: 'ask me' } }).reason).toBe(
            'not-own-instance'
        );
        expect(
            decide({
                context: { currentUserId: ME, locationTag: 'wrld_1:10~group(grp_1)~region(jp)', status: 'ask me' }
            }).reason
        ).toBe('not-own-instance');
    });

    test('honours the ask-me-only gate', () => {
        expect(
            decide({
                settings: settings({ askMeOnly: true }),
                context: { currentUserId: ME, locationTag: myRoom(), status: 'active' }
            }).reason
        ).toBe('status-gate');
        expect(decide({ settings: settings({ askMeOnly: true }) }).action).toBe('accept');
    });

    test('honours the time window', () => {
        const window = { enabled: true, fromMinute: 22 * 60, toMinute: 8 * 60 };
        expect(decide({ settings: settings({ window }) }).action).toBe('accept');
        expect(
            decide({
                settings: settings({ window }),
                context: { currentUserId: ME, locationTag: myRoom(), status: 'ask me' },
                now: new Date(2026, 8, 20, 14, 0).getTime()
            }).reason
        ).toBe('outside-window');
    });

    test('stops at the daily limit', () => {
        expect(
            decide({
                settings: settings({ dailyLimit: 2 }),
                context: { currentUserId: ME, locationTag: myRoom(), status: 'ask me', todayCount: 2 }
            }).reason
        ).toBe('daily-limit');
        expect(
            decide({
                settings: settings({ dailyLimit: 2 }),
                context: { currentUserId: ME, locationTag: myRoom(), status: 'ask me', todayCount: 1 }
            }).action
        ).toBe('accept');
    });

    test('will not re-invite the same friend inside the cooldown', () => {
        const now = new Date(2026, 8, 20, 3, 0).getTime();
        expect(
            decide({
                now,
                context: {
                    currentUserId: ME,
                    locationTag: myRoom(),
                    status: 'ask me',
                    todayCount: 0,
                    lastAcceptAt: now - 10000
                }
            }).reason
        ).toBe('cooldown');
        expect(
            decide({
                now,
                context: {
                    currentUserId: ME,
                    locationTag: myRoom(),
                    status: 'ask me',
                    todayCount: 0,
                    lastAcceptAt: now - 60000
                }
            }).action
        ).toBe('accept');
    });

    test('ignores a request that has already gone away', () => {
        expect(decide({ notification: request({ expired: true }) }).reason).toBe('already-handled');
    });

    test('never throws on a missing or hostile payload', () => {
        // no notification at all is not a knock on the door, so it is not even a skip
        expect(decideAutoInvite({}).action).toBe('none');
        expect(decideAutoInvite({ notification: request(), settings: null, rules: null, context: null }).reason).toBe(
            'disabled'
        );
        // a settings blob that came back as a number or a string must not throw either
        expect(decideAutoInvite({ notification: request(), settings: 5, rules: 'x', context: [] }).reason).toBe(
            'disabled'
        );
        expect(normalizeAutoInviteState(null).settings.enabled).toBe(false);
        expect(decide({ rules: [null, {}, { userId: FRIEND }] }).action).toBe('accept');
    });
});

describe('normalizeAutoInviteState', () => {
    test('drops unusable rows and keeps the rest in order', () => {
        const state = normalizeAutoInviteState({
            settings: { enabled: true },
            rules: [{ userId: FRIEND }, null, { userId: 'junk' }, { userId: OTHER, enabled: false }]
        });
        expect(state.rules.map((rule) => rule.userId)).toEqual([FRIEND, OTHER]);
        expect(state.settings.enabled).toBe(true);
    });
});
