/**
 * @file Filter content that Threads marks with AI transparency metadata.
 */

/**
 * Apply AI-label policy against one content model.
 */
class AiLabelRule {
  /**
   * Evaluate AI-label filters against one content model.
   *
   * @param {import('../../core/content-model').ContentModel} contentModel - Canonical content model.
   * @param {object} settings - Normalized settings.
   * @returns {{
   *   blocked: boolean,
   *   reasons: string[],
   *   matches: Array<{ kind: string, mode: string, pattern: string }>
   * }}
   */
  evaluate(contentModel, settings) {
    const aiLabelSettings =
      settings &&
      settings.filters &&
      settings.filters.aiLabel &&
      typeof settings.filters.aiLabel === 'object'
        ? settings.filters.aiLabel
        : null;
    if (!aiLabelSettings || aiLabelSettings.enabled !== true) {
      return { blocked: false, reasons: [], matches: [] };
    }

    if (!contentModel || contentModel.hasAiLabel !== true) {
      return { blocked: false, reasons: [], matches: [] };
    }

    const detectionMethods = Array.isArray(contentModel.aiDetectionMethods)
      ? Array.from(
          new Set(
            contentModel.aiDetectionMethods
              .map((method) =>
                String(method || '')
                  .trim()
                  .toUpperCase()
              )
              .filter(Boolean)
          )
        )
      : [];
    if (detectionMethods.length === 0) {
      return {
        blocked: true,
        reasons: ['ai-label:present'],
        matches: [{ kind: 'ai-label', mode: 'metadata', pattern: 'present' }],
      };
    }

    return {
      blocked: true,
      reasons: detectionMethods.map((method) => `ai-label:${method.toLowerCase()}`),
      matches: detectionMethods.map((method) => ({
        kind: 'ai-label',
        mode: 'detection-method',
        pattern: method,
      })),
    };
  }
}

module.exports = {
  AiLabelRule,
};
