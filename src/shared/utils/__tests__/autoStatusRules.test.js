import { describe, expect, test } from 'vitest';

import {
    decideAutoStatus,
    FRIEND_SCOPE,
    normalizeAutoStatusRule,
    outranks,
    parseAutoStatusRules,
    pickWinningRule,
    RULE_TYPE,
    ruleMatches,
    splitLocationTag
} from '../autoStatusRules';

const rule = (over = {}) =>
    normalizeAutoStatusRule({
        type: RULE_TYPE.Friend,
        targetId: 'usr_a',
        targetName: 'A',
        status: 'join me',
        ...over
    });

const ctx = (over = {}) => ({
    myTag: 'wrld_world1:1111~region=jp',
    occupants: new Map([['usr_a', 'A']]),
    occupantNames: new Map([['A', 'usr_a']]),
    friendTags: new Map(),
    ...over
});

describe('status priority', () => {
    test('red beats yellow beats green beats blue', () => {
        expect(outranks('busy', 'ask me')).toBe(true);
        expect(outranks('ask me', 'active')).toBe(true);
        expect(outranks('active', 'join me')).toBe(true);
        expect(outranks('join me', 'busy')).toBe(false);
    });

    test('an unknown light never outranks a real one', () => {
        expect(outranks('nonsense', 'busy')).toBe(false);
        expect(outranks('busy', 'nonsense')).toBe(true);
    });
});

describe('normalizeAutoStatusRule', () => {
    test('drops rules that would act on a condition nobody chose', () => {
        expect(normalizeAutoStatusRule({ type: RULE_TYPE.Friend, targetId: '', status: 'busy' })).toBeNull();
        expect(normalizeAutoStatusRule({ type: RULE_TYPE.Friend, targetId: 'usr_a', status: 'sleeping' })).toBeNull();
        expect(normalizeAutoStatusRule(null)).toBeNull();
        expect(normalizeAutoStatusRule('nope')).toBeNull();
    });

    test('refuses to write an empty signature', () => {
        const r = normalizeAutoStatusRule({
            targetId: 'usr_a',
            status: 'busy',
            descriptionEnabled: true,
            description: '  '
        });
        expect(r.descriptionEnabled).toBe(false);
    });

    test('caps the description at what VRChat accepts', () => {
        const r = normalizeAutoStatusRule({
            targetId: 'usr_a',
            status: 'busy',
            descriptionEnabled: true,
            description: 'x'.repeat(90)
        });
        expect(r.description.length).toBe(32);
    });

    test('a signature can actually be typed into a rule that never had one', () => {
        // Regression guard. The flag used to be stored independently of the text, and
        // the two deadlocked: the input only rendered while the flag was on, while the
        // flag was forced off whenever the text was empty - which is every new rule -
        // so the box could never appear and the signature was unreachable.
        const fresh = normalizeAutoStatusRule({ targetId: 'usr_a', status: 'busy' });
        expect(fresh.descriptionEnabled).toBe(false);

        const typed = normalizeAutoStatusRule({ ...fresh, description: '和A开会中' });
        expect(typed.descriptionEnabled).toBe(true);
        expect(typed.description).toBe('和A开会中');

        const cleared = normalizeAutoStatusRule({ ...typed, description: '   ' });
        expect(cleared.descriptionEnabled).toBe(false);
    });

    test('a stale flag cannot make an empty signature get written to the profile', () => {
        const out = decideAutoStatus({
            rules: [rule({ status: 'busy', descriptionEnabled: true, description: '' })],
            context: ctx()
        });
        expect(out.description).toBeNull();
    });

    test('treats a stored rule as enabled unless it says otherwise', () => {
        expect(normalizeAutoStatusRule({ targetId: 'usr_a', status: 'busy' }).enabled).toBe(true);
        expect(normalizeAutoStatusRule({ targetId: 'usr_a', status: 'busy', enabled: false }).enabled).toBe(false);
    });
});

describe('parseAutoStatusRules', () => {
    test('survives garbage instead of taking the settings store down with it', () => {
        expect(parseAutoStatusRules('not json')).toEqual([]);
        expect(parseAutoStatusRules(null)).toEqual([]);
        expect(parseAutoStatusRules('{"rules":"also not an array"}')).toEqual([]);
        expect(parseAutoStatusRules('{"rules":[null, 7, {"bogus":true}]}')).toEqual([]);
    });

    test('accepts both a bare array and the envelope', () => {
        const one = [{ targetId: 'usr_a', status: 'busy' }];
        expect(parseAutoStatusRules(JSON.stringify(one))).toHaveLength(1);
        expect(parseAutoStatusRules(JSON.stringify({ rules: one }))).toHaveLength(1);
    });
});

describe('splitLocationTag', () => {
    test('ignores everything after the instance id', () => {
        expect(splitLocationTag('wrld_w:9~region=jp~name(A)')).toEqual({ worldId: 'wrld_w', instanceId: '9' });
        expect(splitLocationTag('wrld_w')).toEqual({ worldId: 'wrld_w', instanceId: '0' });
        expect(splitLocationTag('')).toEqual({ worldId: '', instanceId: '' });
    });
});

describe('ruleMatches', () => {
    test('friend rule fires when that person is in my instance', () => {
        expect(ruleMatches(rule(), ctx())).toBe(true);
    });

    test('friend rule stays quiet when they are not here', () => {
        const context = ctx({ occupants: new Map([['usr_z', 'Z']]), occupantNames: new Map([['Z', 'usr_z']]) });
        expect(ruleMatches(rule(), context)).toBe(false);
    });

    test('falls back to the display name when the game log gave no id', () => {
        // gameLogCoordinator can produce an entry keyed by an empty string, so an
        // id-only match would silently never fire for that person.
        const context = ctx({ occupants: new Map([['', 'A']]), occupantNames: new Map([['A', '']]) });
        expect(ruleMatches(rule({ targetName: 'A' }), context)).toBe(true);
    });

    test('same-world scope works across instances when we know where the friend is', () => {
        const r = rule({ friendScope: FRIEND_SCOPE.World });
        const context = ctx({
            occupants: new Map(),
            occupantNames: new Map(),
            friendTags: new Map([['usr_a', 'wrld_world1:2222~region=us']])
        });
        expect(ruleMatches(r, context)).toBe(true);
    });

    test('same-world scope does not invent a match for a stranger', () => {
        const r = rule({ friendScope: FRIEND_SCOPE.World });
        const context = ctx({ occupants: new Map(), occupantNames: new Map() });
        expect(ruleMatches(r, context)).toBe(false);
    });

    test('world rule compares world ids, not the whole tag', () => {
        const r = rule({ type: RULE_TYPE.World, targetId: 'wrld_world1' });
        expect(ruleMatches(r, ctx({ occupants: new Map() }))).toBe(true);
        expect(ruleMatches(rule({ type: RULE_TYPE.World, targetId: 'wrld_other' }), ctx())).toBe(false);
    });

    test('a disabled rule cannot match anything', () => {
        expect(ruleMatches(rule({ enabled: false }), ctx())).toBe(false);
    });

    test('no location means no decision', () => {
        expect(ruleMatches(rule({ type: RULE_TYPE.World, targetId: 'wrld_world1' }), ctx({ myTag: '' }))).toBe(false);
    });
});

describe('conflict resolution', () => {
    // The scenario from the request: red because A is with me, but we are standing in
    // a world whose rule says blue. Red has to win, because its purpose is not being
    // found.
    test('a red friend rule beats a blue world rule', () => {
        const rules = [
            rule({ type: RULE_TYPE.World, targetId: 'wrld_world1', status: 'join me' }),
            rule({ status: 'busy' })
        ];
        expect(pickWinningRule(rules, ctx()).status).toBe('busy');
    });

    test('equal lights keep the order the person wrote them in', () => {
        const first = rule({ status: 'busy', name: 'first' });
        const second = rule({ targetId: 'usr_b', status: 'busy', name: 'second' });
        const context = ctx({
            occupants: new Map([
                ['usr_a', 'A'],
                ['usr_b', 'B']
            ])
        });
        expect(pickWinningRule([first, second], context).name).toBe('first');
        expect(pickWinningRule([second, first], context).name).toBe('second');
    });

    test('a pinned blue rule beats an unpinned red one', () => {
        const rules = [
            rule({ status: 'busy' }),
            rule({ targetId: 'wrld_world1', type: RULE_TYPE.World, status: 'join me', pin: true })
        ];
        expect(pickWinningRule(rules, ctx()).status).toBe('join me');
    });
});

describe('decideAutoStatus', () => {
    test('with no matching rule the old alone/company behaviour is used untouched', () => {
        const out = decideAutoStatus({
            rules: [rule({ enabled: false })],
            context: ctx(),
            legacy: { status: 'active', description: 'old text' }
        });
        expect(out).toEqual({ status: 'active', description: 'old text', source: 'legacy', label: '' });
    });

    test('a matching rule wins over the old behaviour by default', () => {
        const out = decideAutoStatus({
            rules: [rule({ status: 'busy', descriptionEnabled: true, description: 'busy with A' })],
            context: ctx(),
            legacy: { status: 'join me', description: 'come in' }
        });
        expect(out.status).toBe('busy');
        expect(out.description).toBe('busy with A');
        expect(out.source).toBe('rule');
    });

    test('in blend mode the stronger light wins even from the old behaviour', () => {
        const out = decideAutoStatus({
            rules: [rule({ status: 'active' })],
            context: ctx(),
            legacy: { status: 'busy', description: 'occupied' },
            blendLegacy: true
        });
        expect(out.status).toBe('busy');
        expect(out.source).toBe('legacy');
    });

    test('a rule without a signature leaves the current one alone', () => {
        const out = decideAutoStatus({ rules: [rule({ status: 'busy' })], context: ctx() });
        expect(out.description).toBeNull();
    });

    test('nothing to do when no rule matches and there is no legacy candidate', () => {
        expect(decideAutoStatus({ rules: [rule({ enabled: false })], context: ctx() })).toBeNull();
    });

    test('a garbage legacy status is ignored rather than sent', () => {
        const out = decideAutoStatus({ rules: [], context: ctx(), legacy: { status: 'asleep' } });
        expect(out).toBeNull();
    });
});
