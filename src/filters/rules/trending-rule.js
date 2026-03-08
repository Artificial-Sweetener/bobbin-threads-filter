/**
 * @file Filter timeline posts tagged with Threads trending topics.
 */

const { normalizeTopic } = require('../../storage/settings-schema');

/**
 * Apply trending-topic policy against one content model.
 */
class TrendingRule {
  /**
   * Evaluate trending filters against one content model.
   *
   * @param {import('../../core/content-model').ContentModel} contentModel - Canonical content model.
   * @param {object} settings - Normalized settings.
   * @returns {{
   *   blocked: boolean,
   *   reasons: string[],
   *   matches?: Array<{ kind: string, mode: string, pattern: string }>
   * }}
   */
  evaluate(contentModel, settings) {
    const trendingSettings =
      settings &&
      settings.filters &&
      settings.filters.trending &&
      typeof settings.filters.trending === 'object'
        ? settings.filters.trending
        : null;
    if (!trendingSettings) {
      return { blocked: false, reasons: [] };
    }

    if (!contentModel || contentModel.isTrending !== true) {
      return { blocked: false, reasons: [] };
    }

    const rowTopics = Array.isArray(contentModel.trendingTopics)
      ? contentModel.trendingTopics.map((topic) => normalizeTopic(topic)).filter(Boolean)
      : [];
    if (rowTopics.length === 0) {
      return { blocked: false, reasons: [] };
    }

    if (trendingSettings.hideAll === true) {
      return {
        blocked: true,
        reasons: ['trending:any'],
        matches: rowTopics.map((topic) => ({
          kind: 'trending',
          mode: 'topic',
          pattern: topic,
        })),
      };
    }

    const blockedTopics = new Set(
      Array.isArray(trendingSettings.blockedTopics)
        ? trendingSettings.blockedTopics.map((topic) => normalizeTopic(topic)).filter(Boolean)
        : []
    );
    if (blockedTopics.size === 0) {
      return { blocked: false, reasons: [] };
    }

    const matchedTopics = rowTopics.filter((topic) => blockedTopics.has(topic));
    if (matchedTopics.length === 0) {
      return { blocked: false, reasons: [] };
    }

    return {
      blocked: true,
      reasons: matchedTopics.map((topic) => `trending:${topic}`),
      matches: matchedTopics.map((topic) => ({
        kind: 'trending',
        mode: 'topic',
        pattern: topic,
      })),
    };
  }
}

module.exports = {
  TrendingRule,
};
