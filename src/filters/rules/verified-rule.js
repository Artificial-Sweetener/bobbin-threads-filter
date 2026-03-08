/**
 * @file Filter content by verified and blue-check policies.
 */

const { normalizeHandle } = require('../../storage/settings-schema');

/**
 * Apply verified-account policy with configurable whitelist override.
 */
class VerifiedRule {
  /**
   * Evaluate verified and blue-check filters against one content model.
   *
   * @param {import('../../core/content-model').ContentModel} contentModel - Canonical content model.
   * @param {object} settings - Normalized settings.
   * @returns {{ blocked: boolean, reasons: string[] }}
   */
  evaluate(contentModel, settings) {
    if (!settings.filters.verified.enabled) {
      return { blocked: false, reasons: [] };
    }

    const whitelist = new Set(
      settings.filters.verified.whitelistHandles.map((handle) => normalizeHandle(handle))
    );
    const verifiedPostHandles = Array.isArray(contentModel.verifiedPostHandles)
      ? contentModel.verifiedPostHandles.map((handle) => normalizeHandle(handle)).filter(Boolean)
      : [];
    const nonWhitelistedVerifiedHandles = verifiedPostHandles.filter(
      (verifiedHandle) => !whitelist.has(verifiedHandle)
    );
    const reasons = [];
    if (nonWhitelistedVerifiedHandles.length > 0) {
      if (settings.filters.verified.hideVerified) {
        reasons.push('verified:badge');
      }
      if (settings.filters.verified.hideBlueCheck) {
        reasons.push('verified:blue-check');
      }

      return {
        blocked: reasons.length > 0,
        reasons,
      };
    }

    const normalizedHandle = normalizeHandle(contentModel.authorHandle);
    if (normalizedHandle && whitelist.has(normalizedHandle)) {
      return { blocked: false, reasons: [] };
    }

    if (settings.filters.verified.hideVerified && contentModel.isVerified) {
      reasons.push('verified:badge');
    }
    if (settings.filters.verified.hideBlueCheck && contentModel.hasBlueCheck) {
      reasons.push('verified:blue-check');
    }

    return {
      blocked: reasons.length > 0,
      reasons,
    };
  }
}

module.exports = {
  VerifiedRule,
};
