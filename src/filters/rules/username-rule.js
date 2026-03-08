/**
 * @file Filter content by blocked username handles.
 */

const { normalizeHandle } = require('../../storage/settings-schema');

/**
 * Apply blocked-handle policy to content models.
 */
class UsernameRule {
  /**
   * Evaluate username filter policy and return deterministic decision data.
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
    if (!settings.filters.username.enabled) {
      return { blocked: false, reasons: [], matches: [] };
    }

    const blockedHandles = new Set(
      settings.filters.username.blockedHandles.map((handle) => normalizeHandle(handle))
    );
    const candidateHandles = Array.isArray(contentModel.postHandles)
      ? contentModel.postHandles.map((handle) => normalizeHandle(handle)).filter(Boolean)
      : [];
    const evaluatedHandles =
      candidateHandles.length > 0
        ? candidateHandles
        : [normalizeHandle(contentModel.authorHandle)].filter(Boolean);
    const matchedHandles = evaluatedHandles.filter((handle) => blockedHandles.has(handle));

    if (matchedHandles.length === 0) {
      return { blocked: false, reasons: [], matches: [] };
    }

    return {
      blocked: true,
      reasons: matchedHandles.map((matchedHandle) => `username:${matchedHandle}`),
      matches: matchedHandles.map((matchedHandle) => ({
        kind: 'username',
        mode: 'handle',
        pattern: matchedHandle,
      })),
    };
  }
}

module.exports = {
  UsernameRule,
};
