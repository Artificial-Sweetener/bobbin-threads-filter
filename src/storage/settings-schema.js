/**
 * @file Define normalization and defaults for persistent settings.
 */

const SETTINGS_SCHEMA_VERSION = 1;
const SETTINGS_STORAGE_KEY = 'btf:settings';

const ALLOWED_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'silent']);

/**
 * Normalize a candidate handle for case-insensitive matching.
 *
 * @param {unknown} value - Candidate handle text.
 * @returns {string}
 */
function normalizeHandle(value) {
  return String(value === null || value === undefined ? '' : value)
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

/**
 * Normalize one trending-topic label for case-insensitive matching.
 *
 * @param {unknown} value - Candidate topic text.
 * @returns {string}
 */
function normalizeTopic(value) {
  return String(value === null || value === undefined ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Normalize list values into unique, non-empty strings.
 *
 * @param {unknown} value - Candidate array-like input.
 * @param {(item: unknown) => string} transformer - Item normalizer.
 * @returns {string[]}
 */
function normalizeStringList(value, transformer) {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueValues = new Set();
  for (const item of value) {
    const normalizedValue = transformer(item);
    if (normalizedValue) {
      uniqueValues.add(normalizedValue);
    }
  }

  return Array.from(uniqueValues);
}

/**
 * Normalize one phrase filter entry into a validated value/mode pair.
 *
 * @param {unknown} value - Candidate phrase entry.
 * @param {boolean} defaultIsRegex - Regex fallback when mode is unspecified.
 * @returns {{ pattern: string, isRegex: boolean } | null}
 */
function normalizePhraseEntry(value, defaultIsRegex) {
  const candidate =
    value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : null;
  const rawPattern =
    candidate !== null
      ? candidate.pattern !== undefined
        ? candidate.pattern
        : candidate.value
      : value;
  const pattern = String(rawPattern === null || rawPattern === undefined ? '' : rawPattern).trim();
  if (!pattern) {
    return null;
  }

  const rawRegexFlag =
    candidate !== null
      ? candidate.isRegex !== undefined
        ? candidate.isRegex
        : candidate.regex
      : defaultIsRegex;
  const isRegex = typeof rawRegexFlag === 'boolean' ? rawRegexFlag : defaultIsRegex;

  return {
    pattern,
    isRegex,
  };
}

/**
 * Build a stable phrase-entry key for mode-aware dedupe and lookups.
 *
 * @param {string} pattern - Normalized phrase text.
 * @param {boolean} isRegex - Regex-mode flag.
 * @returns {string}
 */
function buildPhraseEntryKey(pattern, isRegex) {
  return `${isRegex ? 'regex' : 'text'}:${pattern}`;
}

/**
 * Normalize phrase entries into unique, ordered entry objects.
 *
 * @param {unknown} value - Candidate phrase entry list.
 * @param {boolean} defaultIsRegex - Regex fallback for legacy string entries.
 * @returns {Array<{ pattern: string, isRegex: boolean }>}
 */
function normalizePhraseEntryList(value, defaultIsRegex) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedEntries = [];
  const seenKeys = new Set();
  for (const item of value) {
    const entry = normalizePhraseEntry(item, defaultIsRegex);
    if (!entry) {
      continue;
    }

    const dedupeKey = buildPhraseEntryKey(entry.pattern, entry.isRegex);
    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    normalizedEntries.push(entry);
  }

  return normalizedEntries;
}

/**
 * Normalize unknown values into strict booleans.
 *
 * @param {unknown} value - Candidate boolean-like value.
 * @param {boolean} fallback - Fallback when value is not boolean.
 * @returns {boolean}
 */
function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Normalize unknown values into bounded integers.
 *
 * @param {unknown} value - Candidate numeric value.
 * @param {number} fallback - Fallback when value is invalid.
 * @param {{ min?: number, max?: number }} [bounds] - Optional numeric bounds.
 * @returns {number}
 */
function normalizeInteger(value, fallback, bounds = {}) {
  const numericCandidate = Number(value);
  if (!Number.isInteger(numericCandidate)) {
    return fallback;
  }

  if (typeof bounds.min === 'number' && numericCandidate < bounds.min) {
    return bounds.min;
  }

  if (typeof bounds.max === 'number' && numericCandidate > bounds.max) {
    return bounds.max;
  }

  return numericCandidate;
}

/**
 * Enforce defaulted, migration-safe settings shape for runtime logic.
 */
class SettingsSchema {
  /**
   * Initialize schema version identity.
   *
   * @param {number} [schemaVersion=SETTINGS_SCHEMA_VERSION] - Persisted schema version.
   */
  constructor(schemaVersion = SETTINGS_SCHEMA_VERSION) {
    this.schemaVersion = schemaVersion;
  }

  /**
   * Create canonical defaults so every subsystem shares one settings baseline.
   *
   * @returns {object}
   */
  createDefaults() {
    return {
      schemaVersion: this.schemaVersion,
      observability: {
        level: 'warn',
        debugMode: false,
      },
      filters: {
        enabled: true,
        username: {
          enabled: true,
          blockedHandles: [],
          notInterested: {
            enabledHandles: [],
          },
        },
        verified: {
          enabled: true,
          hideVerified: true,
          hideBlueCheck: true,
          hideBadges: false,
          whitelistHandles: [],
        },
        aiLabel: {
          enabled: false,
        },
        suggestedFollow: {
          enabled: false,
        },
        trending: {
          enabled: false,
          hideAll: false,
          blockedTopics: [],
          notInterested: {
            enabledTopics: [],
          },
        },
        phrase: {
          enabled: true,
          entries: [],
          caseSensitive: false,
          notInterested: {
            enabledEntries: [],
            enabledPatterns: [],
            rateLimit: {
              minIntervalSeconds: 8,
              jitterSeconds: 2,
              maxPerMinute: 6,
              maxPerDay: 120,
              circuitBreakerMinutes: 15,
            },
          },
        },
      },
    };
  }

  /**
   * Normalize unknown persisted values into trusted runtime settings.
   *
   * @param {unknown} rawSettings - Candidate settings object from persistence.
   * @returns {object}
   */
  normalize(rawSettings) {
    const defaults = this.createDefaults();
    const candidate =
      rawSettings && typeof rawSettings === 'object'
        ? /** @type {Record<string, unknown>} */ (rawSettings)
        : {};
    const observabilityCandidate =
      candidate.observability && typeof candidate.observability === 'object'
        ? /** @type {Record<string, unknown>} */ (candidate.observability)
        : {};
    const filtersCandidate =
      candidate.filters && typeof candidate.filters === 'object'
        ? /** @type {Record<string, unknown>} */ (candidate.filters)
        : {};
    const usernameCandidate =
      filtersCandidate.username && typeof filtersCandidate.username === 'object'
        ? /** @type {Record<string, unknown>} */ (filtersCandidate.username)
        : {};
    const usernameNotInterestedCandidate =
      usernameCandidate.notInterested && typeof usernameCandidate.notInterested === 'object'
        ? /** @type {Record<string, unknown>} */ (usernameCandidate.notInterested)
        : {};
    const verifiedCandidate =
      filtersCandidate.verified && typeof filtersCandidate.verified === 'object'
        ? /** @type {Record<string, unknown>} */ (filtersCandidate.verified)
        : {};
    const aiLabelCandidate =
      filtersCandidate.aiLabel && typeof filtersCandidate.aiLabel === 'object'
        ? /** @type {Record<string, unknown>} */ (filtersCandidate.aiLabel)
        : {};
    const phraseCandidate =
      filtersCandidate.phrase && typeof filtersCandidate.phrase === 'object'
        ? /** @type {Record<string, unknown>} */ (filtersCandidate.phrase)
        : {};
    const suggestedFollowCandidate =
      filtersCandidate.suggestedFollow && typeof filtersCandidate.suggestedFollow === 'object'
        ? /** @type {Record<string, unknown>} */ (filtersCandidate.suggestedFollow)
        : {};
    const trendingCandidate =
      filtersCandidate.trending && typeof filtersCandidate.trending === 'object'
        ? /** @type {Record<string, unknown>} */ (filtersCandidate.trending)
        : {};
    const trendingNotInterestedCandidate =
      trendingCandidate.notInterested && typeof trendingCandidate.notInterested === 'object'
        ? /** @type {Record<string, unknown>} */ (trendingCandidate.notInterested)
        : {};
    const phraseNotInterestedCandidate =
      phraseCandidate.notInterested && typeof phraseCandidate.notInterested === 'object'
        ? /** @type {Record<string, unknown>} */ (phraseCandidate.notInterested)
        : {};
    const phraseNotInterestedRateLimitCandidate =
      phraseNotInterestedCandidate.rateLimit &&
      typeof phraseNotInterestedCandidate.rateLimit === 'object'
        ? /** @type {Record<string, unknown>} */ (phraseNotInterestedCandidate.rateLimit)
        : {};
    const phraseEntries = Array.isArray(phraseCandidate.entries)
      ? normalizePhraseEntryList(phraseCandidate.entries, false)
      : normalizePhraseEntryList(
          Array.isArray(phraseCandidate.patterns) ? phraseCandidate.patterns : [],
          normalizeBoolean(phraseCandidate.useRegex, false)
        );
    const explicitNotInterestedEntries = normalizePhraseEntryList(
      phraseNotInterestedCandidate.enabledEntries,
      false
    ).map((entry) => ({
      pattern: entry.pattern,
      isRegex: entry.isRegex,
    }));
    const explicitNotInterestedEntryKeys = new Set(
      explicitNotInterestedEntries.map((entry) => buildPhraseEntryKey(entry.pattern, entry.isRegex))
    );
    const legacyEnabledPatterns = normalizeStringList(
      phraseNotInterestedCandidate.enabledPatterns,
      (value) => String(value === null || value === undefined ? '' : value).trim()
    );
    const derivedNotInterestedEntries = phraseEntries
      .filter(
        (entry) =>
          legacyEnabledPatterns.includes(entry.pattern) &&
          !explicitNotInterestedEntryKeys.has(buildPhraseEntryKey(entry.pattern, entry.isRegex))
      )
      .map((entry) => ({
        pattern: entry.pattern,
        isRegex: entry.isRegex,
      }));
    const enabledNotInterestedEntries = [
      ...explicitNotInterestedEntries,
      ...derivedNotInterestedEntries,
    ];
    const enabledNotInterestedPatterns = Array.from(
      new Set([
        ...legacyEnabledPatterns,
        ...enabledNotInterestedEntries.map((entry) => entry.pattern),
      ])
    );

    const levelCandidate = String(
      observabilityCandidate.level === undefined ? '' : observabilityCandidate.level
    )
      .trim()
      .toLowerCase();
    const normalizedLevel = ALLOWED_LOG_LEVELS.has(levelCandidate)
      ? levelCandidate
      : defaults.observability.level;
    const blockedTrendingTopics = normalizeStringList(
      trendingCandidate.blockedTopics,
      normalizeTopic
    );
    const enabledTrendingNotInterestedTopics = normalizeStringList(
      trendingNotInterestedCandidate.enabledTopics,
      normalizeTopic
    ).filter((topic) => blockedTrendingTopics.includes(topic));

    return {
      schemaVersion: this.schemaVersion,
      observability: {
        level: normalizedLevel,
        debugMode: normalizeBoolean(
          observabilityCandidate.debugMode,
          defaults.observability.debugMode
        ),
      },
      filters: {
        enabled: normalizeBoolean(filtersCandidate.enabled, defaults.filters.enabled),
        username: {
          enabled: normalizeBoolean(usernameCandidate.enabled, defaults.filters.username.enabled),
          blockedHandles: normalizeStringList(usernameCandidate.blockedHandles, normalizeHandle),
          notInterested: {
            enabledHandles: normalizeStringList(
              usernameNotInterestedCandidate.enabledHandles,
              normalizeHandle
            ),
          },
        },
        verified: {
          enabled: normalizeBoolean(verifiedCandidate.enabled, defaults.filters.verified.enabled),
          hideVerified: normalizeBoolean(
            verifiedCandidate.hideVerified,
            defaults.filters.verified.hideVerified
          ),
          hideBlueCheck: normalizeBoolean(
            verifiedCandidate.hideBlueCheck,
            defaults.filters.verified.hideBlueCheck
          ),
          hideBadges: normalizeBoolean(
            verifiedCandidate.hideBadges,
            defaults.filters.verified.hideBadges
          ),
          whitelistHandles: normalizeStringList(
            verifiedCandidate.whitelistHandles,
            normalizeHandle
          ),
        },
        aiLabel: {
          enabled: normalizeBoolean(aiLabelCandidate.enabled, defaults.filters.aiLabel.enabled),
        },
        suggestedFollow: {
          enabled: normalizeBoolean(
            suggestedFollowCandidate.enabled,
            defaults.filters.suggestedFollow.enabled
          ),
        },
        trending: {
          enabled: normalizeBoolean(trendingCandidate.enabled, defaults.filters.trending.enabled),
          hideAll: normalizeBoolean(trendingCandidate.hideAll, defaults.filters.trending.hideAll),
          blockedTopics: blockedTrendingTopics,
          notInterested: {
            enabledTopics: enabledTrendingNotInterestedTopics,
          },
        },
        phrase: {
          enabled: normalizeBoolean(phraseCandidate.enabled, defaults.filters.phrase.enabled),
          entries: phraseEntries,
          caseSensitive: normalizeBoolean(
            phraseCandidate.caseSensitive,
            defaults.filters.phrase.caseSensitive
          ),
          notInterested: {
            enabledEntries: enabledNotInterestedEntries,
            enabledPatterns: enabledNotInterestedPatterns,
            rateLimit: {
              minIntervalSeconds: normalizeInteger(
                phraseNotInterestedRateLimitCandidate.minIntervalSeconds,
                defaults.filters.phrase.notInterested.rateLimit.minIntervalSeconds,
                { min: 1, max: 300 }
              ),
              jitterSeconds: normalizeInteger(
                phraseNotInterestedRateLimitCandidate.jitterSeconds,
                defaults.filters.phrase.notInterested.rateLimit.jitterSeconds,
                { min: 0, max: 60 }
              ),
              maxPerMinute: normalizeInteger(
                phraseNotInterestedRateLimitCandidate.maxPerMinute,
                defaults.filters.phrase.notInterested.rateLimit.maxPerMinute,
                { min: 1, max: 600 }
              ),
              maxPerDay: normalizeInteger(
                phraseNotInterestedRateLimitCandidate.maxPerDay,
                defaults.filters.phrase.notInterested.rateLimit.maxPerDay,
                { min: 1, max: 10000 }
              ),
              circuitBreakerMinutes: normalizeInteger(
                phraseNotInterestedRateLimitCandidate.circuitBreakerMinutes,
                defaults.filters.phrase.notInterested.rateLimit.circuitBreakerMinutes,
                { min: 1, max: 1440 }
              ),
            },
          },
        },
      },
    };
  }
}

module.exports = {
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  SettingsSchema,
  normalizeHandle,
  normalizeTopic,
};
