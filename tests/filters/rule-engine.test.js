const { ContentModel } = require('../../src/core/content-model');
const { FilterRuleEngine } = require('../../src/filters/rule-engine');
const { Logger } = require('../../src/observability/logger');
const { SettingsSchema } = require('../../src/storage/settings-schema');

function createSettings(overrides = {}) {
  const schema = new SettingsSchema();
  const defaults = schema.createDefaults();
  return {
    ...defaults,
    ...overrides,
    filters: {
      ...defaults.filters,
      ...(overrides.filters || {}),
      username: {
        ...defaults.filters.username,
        ...((overrides.filters && overrides.filters.username) || {}),
      },
      verified: {
        ...defaults.filters.verified,
        ...((overrides.filters && overrides.filters.verified) || {}),
      },
      aiLabel: {
        ...defaults.filters.aiLabel,
        ...((overrides.filters && overrides.filters.aiLabel) || {}),
      },
      phrase: {
        ...defaults.filters.phrase,
        ...((overrides.filters && overrides.filters.phrase) || {}),
      },
    },
  };
}

describe('FilterRuleEngine', () => {
  test('blocks content by username match', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        username: {
          enabled: true,
          blockedHandles: ['blocked_user'],
        },
      },
    });
    const content = new ContentModel({
      authorHandle: '@blocked_user',
      text: 'hello world',
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toContain('username:blocked_user');
    expect(decision.matches).toEqual([
      { kind: 'username', mode: 'handle', pattern: 'blocked_user' },
    ]);
  });

  test('blocks content by username match from reposted source handles', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        username: {
          enabled: true,
          blockedHandles: ['quoted_source'],
        },
      },
    });
    const content = new ContentModel({
      authorHandle: '@reposter',
      postHandles: ['reposter', 'quoted_source'],
      text: 'reposted source text',
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toContain('username:quoted_source');
    expect(decision.matches).toContainEqual({
      kind: 'username',
      mode: 'handle',
      pattern: 'quoted_source',
    });
  });

  test('blocks suggested-follow modules when toggle is enabled', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        suggestedFollow: {
          enabled: true,
        },
      },
    });
    const content = new ContentModel({
      text: 'Suggested for you',
      isSuggestedFollow: true,
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toContain('suggested-follow:module');
  });

  test('blocks content with AI transparency metadata when enabled', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        aiLabel: {
          enabled: true,
        },
      },
    });
    const content = new ContentModel({
      text: 'image carousel',
      hasAiLabel: true,
      aiDetectionMethods: ['SELF_DISCLOSURE_FLOW'],
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toContain('ai-label:self_disclosure_flow');
    expect(decision.matches).toContainEqual({
      kind: 'ai-label',
      mode: 'detection-method',
      pattern: 'SELF_DISCLOSURE_FLOW',
    });
  });

  test('blocks all trending-tagged posts when trending hide-all toggle is enabled', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        trending: {
          enabled: false,
          hideAll: true,
          blockedTopics: [],
        },
      },
    });
    const content = new ContentModel({
      text: 'timeline content',
      isTrending: true,
      trendingTopics: ['daily deals'],
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toContain('trending:any');
    expect(decision.matches).toContainEqual({
      kind: 'trending',
      mode: 'topic',
      pattern: 'daily deals',
    });
  });

  test('blocks trending-tagged posts only for configured topics', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        trending: {
          enabled: false,
          hideAll: false,
          blockedTopics: ['daily deals'],
        },
      },
    });
    const matchedContent = new ContentModel({
      text: 'topic-matched content',
      isTrending: true,
      trendingTopics: ['daily deals'],
    });
    const unmatchedContent = new ContentModel({
      text: 'topic-miss content',
      isTrending: true,
      trendingTopics: ['travel ideas'],
    });

    const matchedDecision = engine.evaluate(matchedContent, settings);
    expect(matchedDecision.blocked).toBe(true);
    expect(matchedDecision.reasons).toContain('trending:daily deals');
    expect(matchedDecision.matches).toContainEqual({
      kind: 'trending',
      mode: 'topic',
      pattern: 'daily deals',
    });

    const unmatchedDecision = engine.evaluate(unmatchedContent, settings);
    expect(unmatchedDecision.blocked).toBe(false);
    expect(unmatchedDecision.reasons).toEqual([]);
  });

  test('allows whitelisted verified handles', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        verified: {
          enabled: true,
          hideVerified: true,
          hideBlueCheck: true,
          whitelistHandles: ['trusted_account'],
        },
      },
    });
    const content = new ContentModel({
      authorHandle: '@trusted_account',
      text: 'trusted update',
      isVerified: true,
      hasBlueCheck: true,
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(false);
    expect(decision.reasons).toEqual([]);
  });

  test('blocks repost rows when a non-whitelisted verified source handle is present', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        verified: {
          enabled: true,
          hideVerified: true,
          hideBlueCheck: true,
          whitelistHandles: [],
        },
      },
    });
    const content = new ContentModel({
      authorHandle: '@reposter',
      postHandles: ['reposter', 'verified_source'],
      verifiedPostHandles: ['verified_source'],
      text: 'reposted verified content',
      isVerified: false,
      hasBlueCheck: false,
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toContain('verified:badge');
  });

  test('allows repost rows when verified source handles are whitelisted', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        verified: {
          enabled: true,
          hideVerified: true,
          hideBlueCheck: true,
          whitelistHandles: ['verified_source'],
        },
      },
    });
    const content = new ContentModel({
      authorHandle: '@reposter',
      postHandles: ['reposter', 'verified_source'],
      verifiedPostHandles: ['verified_source'],
      text: 'reposted verified content',
      isVerified: false,
      hasBlueCheck: false,
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(false);
    expect(decision.reasons).toEqual([]);
  });

  test('blocks content by phrase in case-insensitive mode', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        phrase: {
          enabled: true,
          entries: [{ pattern: 'Hot Deal', isRegex: false }],
          caseSensitive: false,
        },
      },
    });
    const content = new ContentModel({
      authorHandle: 'random_user',
      text: 'this is the hottest hot deal available',
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toContain('phrase:hot deal');
    expect(decision.matches).toEqual([{ kind: 'phrase', mode: 'text', pattern: 'Hot Deal' }]);
  });

  test('skips invalid regex patterns without throwing', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        phrase: {
          enabled: true,
          entries: [
            { pattern: '([unclosed', isRegex: true },
            { pattern: 'safe-pattern', isRegex: true },
          ],
          caseSensitive: false,
        },
      },
    });
    const content = new ContentModel({
      authorHandle: 'random_user',
      text: 'neutral content',
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(false);
    expect(decision.reasons).toEqual([]);
    expect(decision.matches).toEqual([]);
  });

  test('captures regex match metadata for downstream signaling', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        phrase: {
          enabled: true,
          entries: [{ pattern: 'breaking\\s+news', isRegex: true }],
          caseSensitive: false,
        },
      },
    });
    const content = new ContentModel({
      authorHandle: 'random_user',
      text: 'breaking news from timeline',
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toEqual(['regex:breaking\\s+news']);
    expect(decision.matches).toEqual([
      { kind: 'phrase', mode: 'regex', pattern: 'breaking\\s+news' },
    ]);
  });

  test('supports mixed text and regex entries in one phrase list', () => {
    const engine = new FilterRuleEngine({ logger: new Logger({ level: 'silent' }) });
    const settings = createSettings({
      filters: {
        phrase: {
          enabled: true,
          entries: [
            { pattern: 'plain phrase', isRegex: false },
            { pattern: 'offer\\s+now', isRegex: true },
          ],
          caseSensitive: false,
        },
      },
    });
    const content = new ContentModel({
      authorHandle: 'random_user',
      text: 'limited OFFER now from this account',
    });

    const decision = engine.evaluate(content, settings);
    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toEqual(['regex:offer\\s+now']);
    expect(decision.matches).toEqual([{ kind: 'phrase', mode: 'regex', pattern: 'offer\\s+now' }]);
  });
});
