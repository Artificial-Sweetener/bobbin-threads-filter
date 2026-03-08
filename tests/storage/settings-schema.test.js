const { SettingsSchema } = require('../../src/storage/settings-schema');

describe('SettingsSchema', () => {
  test('normalizes unknown input into defaults', () => {
    const schema = new SettingsSchema();
    const settings = schema.normalize(null);

    expect(settings.schemaVersion).toBe(1);
    expect(settings.filters.enabled).toBe(true);
    expect(settings.filters.username.blockedHandles).toEqual([]);
    expect(settings.filters.username.notInterested.enabledHandles).toEqual([]);
    expect(settings.filters.verified.enabled).toBe(true);
    expect(settings.filters.verified.hideVerified).toBe(true);
    expect(settings.filters.verified.hideBlueCheck).toBe(true);
    expect(settings.filters.verified.hideBadges).toBe(false);
    expect(settings.filters.verified.whitelistHandles).toEqual([]);
    expect(settings.filters.aiLabel.enabled).toBe(false);
    expect(settings.filters.suggestedFollow.enabled).toBe(false);
    expect(settings.filters.trending.enabled).toBe(false);
    expect(settings.filters.trending.hideAll).toBe(false);
    expect(settings.filters.trending.blockedTopics).toEqual([]);
    expect(settings.filters.trending.notInterested.enabledTopics).toEqual([]);
    expect(settings.filters.phrase.entries).toEqual([]);
    expect(settings.filters.phrase.notInterested.enabledEntries).toEqual([]);
    expect(settings.filters.phrase.notInterested.enabledPatterns).toEqual([]);
    expect(settings.filters.phrase.notInterested.rateLimit.minIntervalSeconds).toBe(8);
    expect(settings.filters.phrase.notInterested.rateLimit.maxPerMinute).toBe(6);
    expect(settings.observability.level).toBe('warn');
  });

  test('normalizes and deduplicates handle lists', () => {
    const schema = new SettingsSchema();
    const settings = schema.normalize({
      filters: {
        username: {
          blockedHandles: ['@Alice', 'alice', ' Bob ', '', null],
          notInterested: {
            enabledHandles: ['@Alice', '@ALICE', 'bob', '', null],
          },
        },
        verified: {
          hideBadges: true,
          whitelistHandles: ['@Trusted', 'trusted', 'Trusted', ''],
        },
      },
    });

    expect(settings.filters.username.blockedHandles).toEqual(['alice', 'bob']);
    expect(settings.filters.username.notInterested.enabledHandles).toEqual(['alice', 'bob']);
    expect(settings.filters.verified.hideBadges).toBe(true);
    expect(settings.filters.verified.whitelistHandles).toEqual(['trusted']);
  });

  test('normalizes suggested-follow toggle', () => {
    const schema = new SettingsSchema();
    const settings = schema.normalize({
      filters: {
        aiLabel: {
          enabled: true,
        },
        suggestedFollow: {
          enabled: true,
        },
      },
    });

    expect(settings.filters.aiLabel.enabled).toBe(true);
    expect(settings.filters.suggestedFollow.enabled).toBe(true);
  });

  test('normalizes trending filter settings and topic list', () => {
    const schema = new SettingsSchema();
    const settings = schema.normalize({
      filters: {
        trending: {
          enabled: true,
          hideAll: true,
          blockedTopics: [' Daily Deals ', 'daily   deals', 'Local Events', '', null],
          notInterested: {
            enabledTopics: [' Daily Deals', 'unknown topic', 'local   events', '', null],
          },
        },
      },
    });

    expect(settings.filters.trending.enabled).toBe(true);
    expect(settings.filters.trending.hideAll).toBe(true);
    expect(settings.filters.trending.blockedTopics).toEqual(['daily deals', 'local events']);
    expect(settings.filters.trending.notInterested.enabledTopics).toEqual([
      'daily deals',
      'local events',
    ]);
  });

  test('falls back to default observability level for unknown values', () => {
    const schema = new SettingsSchema();
    const settings = schema.normalize({
      observability: {
        level: 'trace',
      },
    });

    expect(settings.observability.level).toBe('warn');
  });

  test('normalizes phrase entry objects including regex flags', () => {
    const schema = new SettingsSchema();
    const settings = schema.normalize({
      filters: {
        phrase: {
          enabled: true,
          caseSensitive: true,
          entries: [
            { pattern: 'sale', isRegex: false },
            { pattern: 'sale', isRegex: false },
            { pattern: 'sale', isRegex: true },
            { pattern: 'promo', isRegex: false },
            { pattern: '', isRegex: false },
          ],
        },
      },
    });

    expect(settings.filters.phrase.enabled).toBe(true);
    expect(settings.filters.phrase.caseSensitive).toBe(true);
    expect(settings.filters.phrase.entries).toEqual([
      { pattern: 'sale', isRegex: false },
      { pattern: 'sale', isRegex: true },
      { pattern: 'promo', isRegex: false },
    ]);
  });

  test('migrates legacy patterns and useRegex into phrase entries', () => {
    const schema = new SettingsSchema();
    const settings = schema.normalize({
      filters: {
        phrase: {
          patterns: ['sale', 'sale', 'promo'],
          useRegex: true,
        },
      },
    });

    expect(settings.filters.phrase.entries).toEqual([
      { pattern: 'sale', isRegex: true },
      { pattern: 'promo', isRegex: true },
    ]);
  });

  test('derives mode-aware not-interested entries from legacy enabled patterns', () => {
    const schema = new SettingsSchema();
    const settings = schema.normalize({
      filters: {
        phrase: {
          entries: [
            { pattern: 'sale', isRegex: false },
            { pattern: 'sale', isRegex: true },
            { pattern: 'promo', isRegex: false },
          ],
          notInterested: {
            enabledPatterns: ['sale'],
          },
        },
      },
    });

    expect(settings.filters.phrase.notInterested.enabledEntries).toEqual([
      { pattern: 'sale', isRegex: false },
      { pattern: 'sale', isRegex: true },
    ]);
  });

  test('normalizes not-interested phrase settings and bounds rate limits', () => {
    const schema = new SettingsSchema();
    const settings = schema.normalize({
      filters: {
        phrase: {
          notInterested: {
            enabledEntries: [
              { pattern: 'sale', isRegex: true },
              { pattern: 'sale', isRegex: true },
              { pattern: 'promo', isRegex: false },
              { pattern: '', isRegex: false },
            ],
            enabledPatterns: ['sale', 'sale', 'promo', ''],
            rateLimit: {
              minIntervalSeconds: 0,
              jitterSeconds: 999,
              maxPerMinute: '12',
              maxPerDay: -4,
              circuitBreakerMinutes: 2000,
            },
          },
        },
      },
    });

    expect(settings.filters.phrase.notInterested.enabledEntries).toEqual([
      { pattern: 'sale', isRegex: true },
      { pattern: 'promo', isRegex: false },
    ]);
    expect(settings.filters.phrase.notInterested.enabledPatterns).toEqual(['sale', 'promo']);
    expect(settings.filters.phrase.notInterested.rateLimit.minIntervalSeconds).toBe(1);
    expect(settings.filters.phrase.notInterested.rateLimit.jitterSeconds).toBe(60);
    expect(settings.filters.phrase.notInterested.rateLimit.maxPerMinute).toBe(12);
    expect(settings.filters.phrase.notInterested.rateLimit.maxPerDay).toBe(1);
    expect(settings.filters.phrase.notInterested.rateLimit.circuitBreakerMinutes).toBe(1440);
  });
});
