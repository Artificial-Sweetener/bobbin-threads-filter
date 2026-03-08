/**
 * @file Filter timeline "Suggested for you" follow modules.
 */

/**
 * Apply suggested-follow module policy against one content model.
 */
class SuggestedFollowRule {
  /**
   * Evaluate suggested-follow filter against one content model.
   *
   * @param {import('../../core/content-model').ContentModel} contentModel - Canonical content model.
   * @param {object} settings - Normalized settings.
   * @returns {{ blocked: boolean, reasons: string[] }}
   */
  evaluate(contentModel, settings) {
    const suggestedFollowSettings =
      settings &&
      settings.filters &&
      settings.filters.suggestedFollow &&
      typeof settings.filters.suggestedFollow === 'object'
        ? settings.filters.suggestedFollow
        : null;
    if (!suggestedFollowSettings || suggestedFollowSettings.enabled !== true) {
      return { blocked: false, reasons: [] };
    }

    if (!contentModel || contentModel.isSuggestedFollow !== true) {
      return { blocked: false, reasons: [] };
    }

    return {
      blocked: true,
      reasons: ['suggested-follow:module'],
    };
  }
}

module.exports = {
  SuggestedFollowRule,
};
