/**
 * @file Define canonical content model consumed by filter rules.
 */

const { normalizeHandle, normalizeTopic } = require('../storage/settings-schema');

/**
 * Normalize extracted post data into deterministic rule-engine input.
 */
class ContentModel {
  /**
   * Initialize content model fields with normalized defaults.
   *
   * @param {{
   *   element?: HTMLElement|null,
   *   postCode?: string,
   *   postCodes?: string[],
   *   authorHandle?: string,
   *   postHandles?: string[],
   *   verifiedPostHandles?: string[],
   *   displayName?: string,
   *   text?: string,
   *   isVerified?: boolean,
   *   hasBlueCheck?: boolean,
   *   hasAiLabel?: boolean,
   *   aiDetectionMethods?: string[],
   *   isSuggestedFollow?: boolean
   *   isTrending?: boolean,
   *   trendingTopics?: string[]
   * }} [data] - Candidate content data.
   */
  constructor(data = {}) {
    this.element = data.element || null;
    this.postCodes = this.#resolvePostCodes(data.postCodes, data.postCode);
    this.postCode = this.postCodes[0] || '';
    this.authorHandle = normalizeHandle(data.authorHandle);
    this.postHandles = this.#resolvePostHandles(data.postHandles);
    this.verifiedPostHandles = this.#resolveVerifiedPostHandles(data.verifiedPostHandles);
    this.displayName = String(data.displayName || '').trim();
    this.text = String(data.text || '').trim();
    this.trendingTopics = this.#resolveTrendingTopics(data.trendingTopics);
    this.isTrending = Boolean(data.isTrending || this.trendingTopics.length > 0);
    this.isVerified = Boolean(
      data.isVerified || (this.authorHandle && this.verifiedPostHandles.includes(this.authorHandle))
    );
    this.hasBlueCheck = Boolean(data.hasBlueCheck || this.isVerified);
    this.aiDetectionMethods = this.#resolveAiDetectionMethods(data.aiDetectionMethods);
    this.hasAiLabel = Boolean(data.hasAiLabel || this.aiDetectionMethods.length > 0);
    this.isSuggestedFollow = Boolean(data.isSuggestedFollow);
    this.searchText = this.#buildSearchText();
  }

  /**
   * Normalize AI detection methods for deterministic metadata-backed filtering.
   *
   * @param {unknown} value - Candidate method list.
   * @returns {string[]}
   */
  #resolveAiDetectionMethods(value) {
    const normalizedMethods = [];
    const seenMethods = new Set();
    const candidateMethods = Array.isArray(value) ? value : [];
    for (const candidateMethod of candidateMethods) {
      const normalizedMethod = String(candidateMethod || '')
        .trim()
        .toUpperCase();
      if (!normalizedMethod || normalizedMethod === 'NONE' || seenMethods.has(normalizedMethod)) {
        continue;
      }

      seenMethods.add(normalizedMethod);
      normalizedMethods.push(normalizedMethod);
    }

    return normalizedMethods;
  }

  /**
   * Normalize trending-topic labels for deterministic rule matching.
   *
   * @param {unknown} value - Candidate topic list.
   * @returns {string[]}
   */
  #resolveTrendingTopics(value) {
    const normalizedTopics = [];
    const seenTopics = new Set();
    const candidateTopics = Array.isArray(value) ? value : [];
    for (const candidateTopic of candidateTopics) {
      const normalizedTopic = normalizeTopic(candidateTopic);
      if (!normalizedTopic || seenTopics.has(normalizedTopic)) {
        continue;
      }

      normalizedTopics.push(normalizedTopic);
      seenTopics.add(normalizedTopic);
    }

    return normalizedTopics;
  }

  /**
   * Normalize post codes so runtime can cascade-hide reply chains safely.
   *
   * @param {unknown} value - Candidate post-code list.
   * @param {unknown} primaryPostCode - Canonical post code fallback.
   * @returns {string[]}
   */
  #resolvePostCodes(value, primaryPostCode) {
    const normalizedCodes = [];
    const seenCodes = new Set();
    const normalizedPrimaryCode = String(primaryPostCode || '').trim();
    if (normalizedPrimaryCode) {
      normalizedCodes.push(normalizedPrimaryCode);
      seenCodes.add(normalizedPrimaryCode);
    }

    const candidateCodes = Array.isArray(value) ? value : [];
    for (const candidateCode of candidateCodes) {
      const normalizedCode = String(candidateCode || '').trim();
      if (!normalizedCode || seenCodes.has(normalizedCode)) {
        continue;
      }

      normalizedCodes.push(normalizedCode);
      seenCodes.add(normalizedCode);
    }

    return normalizedCodes;
  }

  /**
   * Normalize all post handles so rules can evaluate repost rows holistically.
   *
   * @param {unknown} value - Candidate post-handle list.
   * @returns {string[]}
   */
  #resolvePostHandles(value) {
    const normalizedHandles = [];
    const seenHandles = new Set();
    const candidateHandles = Array.isArray(value) ? value : [];
    for (const candidateHandle of candidateHandles) {
      const normalizedHandle = normalizeHandle(candidateHandle);
      if (!normalizedHandle || seenHandles.has(normalizedHandle)) {
        continue;
      }

      seenHandles.add(normalizedHandle);
      normalizedHandles.push(normalizedHandle);
    }

    if (this.authorHandle && !seenHandles.has(this.authorHandle)) {
      seenHandles.add(this.authorHandle);
      normalizedHandles.unshift(this.authorHandle);
    }

    return normalizedHandles;
  }

  /**
   * Normalize verified post handles and keep them aligned to known post handles.
   *
   * @param {unknown} value - Candidate verified-handle list.
   * @returns {string[]}
   */
  #resolveVerifiedPostHandles(value) {
    const knownHandles = new Set(this.postHandles);
    const normalizedHandles = [];
    const seenHandles = new Set();
    const candidateHandles = Array.isArray(value) ? value : [];
    for (const candidateHandle of candidateHandles) {
      const normalizedHandle = normalizeHandle(candidateHandle);
      if (!normalizedHandle || seenHandles.has(normalizedHandle)) {
        continue;
      }

      if (knownHandles.size > 0 && !knownHandles.has(normalizedHandle)) {
        continue;
      }

      seenHandles.add(normalizedHandle);
      normalizedHandles.push(normalizedHandle);
    }

    return normalizedHandles;
  }

  /**
   * Build normalized aggregate text used by phrase and regex rules.
   *
   * @returns {string}
   */
  #buildSearchText() {
    return [
      this.displayName,
      this.authorHandle,
      ...this.postHandles,
      ...this.trendingTopics,
      this.text,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ');
  }
}

module.exports = {
  ContentModel,
};
