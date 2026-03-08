const {
  BlockedPostCatalog,
  normalizePostCodeList,
} = require('../../src/core/blocked-post-catalog');

describe('BlockedPostCatalog', () => {
  test('normalizes post-code lists into unique non-empty values', () => {
    expect(normalizePostCodeList('invalid')).toEqual([]);
    expect(normalizePostCodeList(['', '  ', 'A1', 'A1', 'B2'])).toEqual(['A1', 'B2']);
  });

  test('tracks blocked post codes until configured ttl expires', () => {
    let nowMs = 1_000;
    const catalog = new BlockedPostCatalog({
      blockTtlMs: 60_000,
      nowProvider: () => nowMs,
    });

    catalog.markBlockedPostCodes(['POST01']);
    expect(catalog.hasBlockedPostCode(['POST01'])).toBe(true);

    nowMs = 60_999;
    expect(catalog.hasBlockedPostCode(['POST01'])).toBe(true);

    nowMs = 61_001;
    expect(catalog.hasBlockedPostCode(['POST01'])).toBe(false);
  });

  test('evicts oldest entries when capacity is exceeded', () => {
    let nowMs = 1_000;
    const catalog = new BlockedPostCatalog({
      maxEntries: 100,
      nowProvider: () => nowMs,
    });

    for (let index = 0; index < 101; index += 1) {
      nowMs += 1;
      catalog.markBlockedPostCodes([`POST${index}`]);
    }

    expect(catalog.hasBlockedPostCode(['POST0'])).toBe(false);
    expect(catalog.hasBlockedPostCode(['POST100'])).toBe(true);
  });

  test('clears all state when reset is requested', () => {
    const catalog = new BlockedPostCatalog();
    catalog.markBlockedPostCodes(['POST01']);
    expect(catalog.hasBlockedPostCode(['POST01'])).toBe(true);

    catalog.reset();
    expect(catalog.hasBlockedPostCode(['POST01'])).toBe(false);
  });
});
