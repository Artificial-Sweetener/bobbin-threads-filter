/**
 * @file Track recently blocked post codes for reply-cascade filtering.
 */

const DEFAULT_BLOCK_TTL_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * Normalize post-code candidates into unique non-empty values.
 *
 * @param {unknown} value - Candidate post-code list.
 * @returns {string[]}
 */
function normalizePostCodeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueCodes = new Set();
  for (const candidateCode of value) {
    const normalizedCode = String(candidateCode || '').trim();
    if (normalizedCode) {
      uniqueCodes.add(normalizedCode);
    }
  }

  return Array.from(uniqueCodes);
}

/**
 * Track blocked post codes so replies to filtered posts can cascade-hide.
 */
class BlockedPostCatalog {
  /**
   * Initialize bounded catalog state and pruning controls.
   *
   * @param {{
   *   blockTtlMs?: number,
   *   maxEntries?: number,
   *   nowProvider?: () => number
   * }} [options] - Catalog options.
   */
  constructor(options = {}) {
    const {
      blockTtlMs = DEFAULT_BLOCK_TTL_MS,
      maxEntries = DEFAULT_MAX_ENTRIES,
      nowProvider = () => Date.now(),
    } = options;

    this.blockTtlMs = Math.max(60_000, Number(blockTtlMs) || DEFAULT_BLOCK_TTL_MS);
    this.maxEntries = Math.max(100, Number(maxEntries) || DEFAULT_MAX_ENTRIES);
    this.nowProvider = nowProvider;
    this.blockedCodes = new Map();
  }

  /**
   * Reset catalog state when settings semantics change.
   */
  reset() {
    this.blockedCodes.clear();
  }

  /**
   * Mark post codes as blocked and refresh their recency timestamp.
   *
   * @param {string[]} postCodes - Normalized post codes.
   */
  markBlockedPostCodes(postCodes) {
    const normalizedCodes = normalizePostCodeList(postCodes);
    if (normalizedCodes.length === 0) {
      return;
    }

    const nowMs = this.nowProvider();
    this.#pruneExpiredEntries(nowMs);
    for (const postCode of normalizedCodes) {
      this.blockedCodes.set(postCode, nowMs);
    }
    this.#pruneOverflowEntries();
  }

  /**
   * Determine whether any post code is blocked within TTL.
   *
   * @param {string[]} postCodes - Normalized post codes.
   * @returns {boolean}
   */
  hasBlockedPostCode(postCodes) {
    const normalizedCodes = normalizePostCodeList(postCodes);
    if (normalizedCodes.length === 0) {
      return false;
    }

    const nowMs = this.nowProvider();
    this.#pruneExpiredEntries(nowMs);
    for (const postCode of normalizedCodes) {
      if (this.blockedCodes.has(postCode)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Remove expired entries outside the configured TTL.
   *
   * @param {number} nowMs - Current timestamp in milliseconds.
   */
  #pruneExpiredEntries(nowMs) {
    const staleThresholdMs = nowMs - this.blockTtlMs;
    for (const [postCode, blockedAtMs] of this.blockedCodes.entries()) {
      if (blockedAtMs <= staleThresholdMs) {
        this.blockedCodes.delete(postCode);
      }
    }
  }

  /**
   * Evict oldest entries when catalog exceeds configured capacity.
   */
  #pruneOverflowEntries() {
    if (this.blockedCodes.size <= this.maxEntries) {
      return;
    }

    const orderedEntries = Array.from(this.blockedCodes.entries()).sort(
      (leftEntry, rightEntry) => leftEntry[1] - rightEntry[1]
    );
    const removableCount = this.blockedCodes.size - this.maxEntries;
    for (let index = 0; index < removableCount; index += 1) {
      const [postCode] = orderedEntries[index];
      this.blockedCodes.delete(postCode);
    }
  }
}

module.exports = {
  BlockedPostCatalog,
  normalizePostCodeList,
};
