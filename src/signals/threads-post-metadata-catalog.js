/**
 * @file Track post metadata required for silent mutation dispatch.
 */

const DEFAULT_MAX_ENTRIES = 3_000;
const DEFAULT_ENTRY_TTL_MS = 30 * 60 * 1_000;

/**
 * Normalize unknown values into trimmed strings.
 *
 * @param {unknown} value - Candidate value.
 * @returns {string}
 */
function toNormalizedString(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

/**
 * Treat Threads AI-detection sentinel values as absence of a disclosure label.
 *
 * @param {unknown} value - Candidate detection-method value.
 * @returns {string}
 */
function toNormalizedAiDetectionMethod(value) {
  const normalizedMethod = toNormalizedString(value).toUpperCase();
  return normalizedMethod === 'NONE' ? '' : normalizedMethod;
}

/**
 * Maintain post lookup data extracted from Threads GraphQL responses.
 */
class ThreadsPostMetadataCatalog {
  /**
   * Initialize storage limits and in-memory index.
   *
   * @param {{ maxEntries?: number, entryTtlMs?: number, nowProvider?: () => number }} [options] - Catalog options.
   */
  constructor(options = {}) {
    const {
      maxEntries = DEFAULT_MAX_ENTRIES,
      entryTtlMs = DEFAULT_ENTRY_TTL_MS,
      nowProvider = () => Date.now(),
    } = options;
    this.maxEntries = maxEntries;
    this.entryTtlMs = entryTtlMs;
    this.nowProvider = nowProvider;
    this.postMetadataByCode = new Map();
  }

  /**
   * Capture post metadata records from one GraphQL payload.
   *
   * @param {unknown} payload - Candidate GraphQL payload.
   * @returns {number}
   */
  ingestGraphqlPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return 0;
    }

    this.#evictExpiredEntries();
    let ingestedRecordCount = 0;
    const traversalStack = [payload];

    while (traversalStack.length > 0) {
      const nextNode = traversalStack.pop();
      if (!nextNode || typeof nextNode !== 'object') {
        continue;
      }

      if (Array.isArray(nextNode)) {
        for (const entry of nextNode) {
          traversalStack.push(entry);
        }
        continue;
      }

      const maybePostRecord = /** @type {Record<string, unknown>} */ (nextNode);
      if (this.#looksLikePostRecord(maybePostRecord) && this.#upsertPostRecord(maybePostRecord)) {
        ingestedRecordCount += 1;
      }

      for (const value of Object.values(maybePostRecord)) {
        if (value && typeof value === 'object') {
          traversalStack.push(value);
        }
      }
    }

    return ingestedRecordCount;
  }

  /**
   * Resolve metadata by post code.
   *
   * @param {string} postCode - Threads post code from permalink.
   * @returns {{
   *   postCode: string,
   *   mediaPk: string,
   *   rankingInfoToken: string,
   *   authorPk: string,
   *   hasAiLabel: boolean,
   *   genAIDetectionMethod: string
   * }|null}
   */
  getByPostCode(postCode) {
    this.#evictExpiredEntries();

    const normalizedPostCode = String(postCode || '').trim();
    if (!normalizedPostCode || !this.postMetadataByCode.has(normalizedPostCode)) {
      return null;
    }

    const metadataRecord = this.postMetadataByCode.get(normalizedPostCode) || null;
    if (!metadataRecord) {
      return null;
    }

    if (this.#isExpired(metadataRecord, this.nowProvider())) {
      this.postMetadataByCode.delete(normalizedPostCode);
      return null;
    }

    return {
      postCode: metadataRecord.postCode,
      mediaPk: metadataRecord.mediaPk,
      rankingInfoToken: metadataRecord.rankingInfoToken,
      authorPk: metadataRecord.authorPk,
      hasAiLabel: metadataRecord.hasAiLabel === true,
      genAIDetectionMethod: metadataRecord.genAIDetectionMethod || '',
    };
  }

  /**
   * Recognize the minimal post-object shape we can safely ingest.
   *
   * @param {Record<string, unknown>} candidate - Candidate object.
   * @returns {boolean}
   */
  #looksLikePostRecord(candidate) {
    const hasPostCode = typeof candidate.code === 'string' || typeof candidate.code === 'number';
    const hasMediaPk = typeof candidate.pk === 'string' || typeof candidate.pk === 'number';
    if (!hasPostCode || !hasMediaPk) {
      return false;
    }

    const hasRankingInfoToken =
      typeof candidate.logging_info_token === 'string' ||
      typeof candidate.logging_info_token === 'number';
    if (hasRankingInfoToken) {
      return true;
    }

    return Boolean(this.#resolveGenAIDetectionMethod(candidate));
  }

  /**
   * Insert or refresh one post metadata record.
   *
   * @param {Record<string, unknown>} postRecord - Candidate post object.
   * @returns {boolean}
   */
  #upsertPostRecord(postRecord) {
    const postCode = toNormalizedString(postRecord.code);
    const mediaPk = toNormalizedString(postRecord.pk);
    const rankingInfoToken = toNormalizedString(postRecord.logging_info_token);
    const authorPk = this.#resolveAuthorPk(postRecord);
    const genAIDetectionMethod = this.#resolveGenAIDetectionMethod(postRecord);
    const observedAtMs = this.nowProvider();
    const expiresAtMs = observedAtMs + this.entryTtlMs;

    if (!postCode || !mediaPk) {
      return false;
    }

    this.postMetadataByCode.delete(postCode);
    this.postMetadataByCode.set(postCode, {
      postCode,
      mediaPk,
      rankingInfoToken,
      authorPk,
      hasAiLabel: Boolean(genAIDetectionMethod),
      genAIDetectionMethod,
      observedAtMs,
      expiresAtMs,
    });

    this.#evictExpiredEntries();
    this.#trimToCapacity();
    return true;
  }

  /**
   * Evict oldest records when catalog exceeds configured capacity.
   */
  #trimToCapacity() {
    while (this.postMetadataByCode.size > this.maxEntries) {
      const oldestKey = this.postMetadataByCode.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.postMetadataByCode.delete(oldestKey);
    }
  }

  /**
   * Resolve author pk from known nested payload locations.
   *
   * @param {Record<string, unknown>} postRecord - Candidate post object.
   * @returns {string}
   */
  #resolveAuthorPk(postRecord) {
    const directUserPk = toNormalizedString(postRecord.user_id);
    if (directUserPk) {
      return directUserPk;
    }

    const userRecord =
      postRecord.user && typeof postRecord.user === 'object'
        ? /** @type {Record<string, unknown>} */ (postRecord.user)
        : null;
    if (userRecord) {
      const userPk = toNormalizedString(userRecord.pk || userRecord.id);
      if (userPk) {
        return userPk;
      }
    }

    const ownerRecord =
      postRecord.owner && typeof postRecord.owner === 'object'
        ? /** @type {Record<string, unknown>} */ (postRecord.owner)
        : null;
    if (ownerRecord) {
      return toNormalizedString(ownerRecord.pk || ownerRecord.id);
    }

    return '';
  }

  /**
   * Resolve AI transparency metadata from one post record when Threads exposes it.
   *
   * @param {Record<string, unknown>} postRecord - Candidate post object.
   * @returns {string}
   */
  #resolveGenAIDetectionMethod(postRecord) {
    const rawDetectionRecord =
      postRecord.gen_ai_detection_method && typeof postRecord.gen_ai_detection_method === 'object'
        ? /** @type {Record<string, unknown>} */ (postRecord.gen_ai_detection_method)
        : null;
    if (!rawDetectionRecord) {
      return '';
    }

    return toNormalizedAiDetectionMethod(rawDetectionRecord.detection_method);
  }

  /**
   * Remove metadata records whose TTL has elapsed.
   */
  #evictExpiredEntries() {
    const nowMs = this.nowProvider();
    for (const [postCode, metadataRecord] of this.postMetadataByCode.entries()) {
      if (this.#isExpired(metadataRecord, nowMs)) {
        this.postMetadataByCode.delete(postCode);
      }
    }
  }

  /**
   * Determine whether one metadata record has expired.
   *
   * @param {{ expiresAtMs?: number }} metadataRecord - Candidate metadata record.
   * @param {number} nowMs - Current timestamp.
   * @returns {boolean}
   */
  #isExpired(metadataRecord, nowMs) {
    const expiresAtMs = Number(metadataRecord.expiresAtMs);
    return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
  }
}

module.exports = {
  ThreadsPostMetadataCatalog,
};
