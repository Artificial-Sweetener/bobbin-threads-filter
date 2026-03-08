/**
 * @file Filter content by phrase and regex policy.
 */

/**
 * Apply phrase and regex matching with fail-safe invalid pattern handling.
 */
class PhraseRule {
  /**
   * Initialize optional logger dependency for diagnostics.
   *
   * @param {{ logger?: { warn: Function } }} [options] - Rule options.
   */
  constructor(options = {}) {
    const { logger = { warn: () => {} } } = options;
    this.logger = logger;
  }

  /**
   * Evaluate phrase and regex filters against one content model.
   *
   * @param {import('../../core/content-model').ContentModel} contentModel - Canonical content model.
   * @param {object} settings - Normalized settings.
   * @returns {{ blocked: boolean, reasons: string[] }}
   */
  evaluate(contentModel, settings) {
    if (!settings.filters.phrase.enabled) {
      return { blocked: false, reasons: [], matches: [] };
    }

    const entries = this.#resolvePhraseEntries(settings);
    if (entries.length === 0) {
      return { blocked: false, reasons: [], matches: [] };
    }

    const text = String(contentModel.searchText || '');
    const caseSensitive = settings.filters.phrase.caseSensitive;
    const regexFlags = caseSensitive ? '' : 'i';
    const sourceText = caseSensitive ? text : text.toLowerCase();
    for (const entry of entries) {
      const pattern = String(entry.pattern || '').trim();
      if (!pattern) {
        continue;
      }

      if (entry.isRegex) {
        try {
          const regex = new RegExp(pattern, regexFlags);
          if (regex.test(text)) {
            return {
              blocked: true,
              reasons: [`regex:${pattern}`],
              matches: [{ kind: 'phrase', mode: 'regex', pattern }],
            };
          }
        } catch (error) {
          this.logger.warn('Skipped invalid regex pattern.', {
            pattern,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        continue;
      }

      const candidatePattern = caseSensitive ? pattern : String(pattern).toLowerCase();
      if (candidatePattern && sourceText.includes(candidatePattern)) {
        return {
          blocked: true,
          reasons: [`phrase:${candidatePattern}`],
          matches: [{ kind: 'phrase', mode: 'text', pattern }],
        };
      }
    }

    return { blocked: false, reasons: [], matches: [] };
  }

  /**
   * Resolve phrase entries from normalized settings and legacy shape.
   *
   * @param {object} settings - Normalized settings.
   * @returns {Array<{ pattern: string, isRegex: boolean }>}
   */
  #resolvePhraseEntries(settings) {
    const phraseSettings =
      settings && settings.filters && settings.filters.phrase ? settings.filters.phrase : {};
    if (Array.isArray(phraseSettings.entries)) {
      return phraseSettings.entries
        .map((entry) => {
          const candidate =
            entry && typeof entry === 'object'
              ? /** @type {Record<string, unknown>} */ (entry)
              : null;
          const pattern =
            candidate === null
              ? ''
              : String(
                  candidate.pattern === undefined || candidate.pattern === null
                    ? ''
                    : candidate.pattern
                ).trim();
          if (!pattern) {
            return null;
          }

          return {
            pattern,
            isRegex: Boolean(candidate.isRegex),
          };
        })
        .filter(Boolean);
    }

    const patterns = Array.isArray(phraseSettings.patterns) ? phraseSettings.patterns : [];
    const useRegex = phraseSettings.useRegex === true;
    return patterns
      .map((pattern) => String(pattern === null || pattern === undefined ? '' : pattern).trim())
      .filter(Boolean)
      .map((pattern) => ({ pattern, isRegex: useRegex }));
  }
}

module.exports = {
  PhraseRule,
};
