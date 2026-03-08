/**
 * @file Persist dedupe and rate-limit state for silent not-interested signaling.
 */

const { UserscriptStorageAdapter } = require('../storage/userscript-storage');

const NOT_INTERESTED_STATE_STORAGE_KEY = 'btf:not-interested-state';

/**
 * Persist state used by the not-interested dispatcher.
 */
class NotInterestedStateStore {
  /**
   * Initialize storage boundary for dispatcher state.
   *
   * @param {{
   *   storageAdapter?: UserscriptStorageAdapter,
   *   storageKey?: string
   * }} [options] - Store options.
   */
  constructor(options = {}) {
    const {
      storageAdapter = new UserscriptStorageAdapter(),
      storageKey = NOT_INTERESTED_STATE_STORAGE_KEY,
    } = options;

    this.storageAdapter = storageAdapter;
    this.storageKey = storageKey;
  }

  /**
   * Load and normalize persisted dispatcher state.
   *
   * @returns {Promise<{
   *   sentMediaPks: string[],
   *   minuteWindowMs: number[],
   *   dayWindow: { dayKey: string, count: number },
   *   lastSentAtMs: number,
   *   circuitBreakerUntilMs: number
   * }>}
   */
  async load() {
    const rawState = await this.storageAdapter.getValue(this.storageKey, null);
    return this.#normalize(rawState);
  }

  /**
   * Persist normalized dispatcher state.
   *
   * @param {unknown} nextState - Candidate state object.
   * @returns {Promise<void>}
   */
  async save(nextState) {
    const normalizedState = this.#normalize(nextState);
    await this.storageAdapter.setValue(this.storageKey, normalizedState);
  }

  /**
   * Normalize unknown input into deterministic dispatcher state.
   *
   * @param {unknown} rawState - Candidate state object.
   * @returns {{
   *   sentMediaPks: string[],
   *   minuteWindowMs: number[],
   *   dayWindow: { dayKey: string, count: number },
   *   lastSentAtMs: number,
   *   circuitBreakerUntilMs: number
   * }}
   */
  #normalize(rawState) {
    const candidate =
      rawState && typeof rawState === 'object'
        ? /** @type {Record<string, unknown>} */ (rawState)
        : {};
    const dayWindowCandidate =
      candidate.dayWindow && typeof candidate.dayWindow === 'object'
        ? /** @type {Record<string, unknown>} */ (candidate.dayWindow)
        : {};

    return {
      sentMediaPks: this.#normalizeStringList(candidate.sentMediaPks),
      minuteWindowMs: this.#normalizeNumberList(candidate.minuteWindowMs),
      dayWindow: {
        dayKey: String(dayWindowCandidate.dayKey || '').trim(),
        count: this.#normalizeInteger(dayWindowCandidate.count),
      },
      lastSentAtMs: this.#normalizeInteger(candidate.lastSentAtMs),
      circuitBreakerUntilMs: this.#normalizeInteger(candidate.circuitBreakerUntilMs),
    };
  }

  /**
   * Normalize candidate list into unique non-empty strings.
   *
   * @param {unknown} value - Candidate list.
   * @returns {string[]}
   */
  #normalizeStringList(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalizedValues = new Set();
    for (const entry of value) {
      const normalizedEntry = String(entry || '').trim();
      if (normalizedEntry) {
        normalizedValues.add(normalizedEntry);
      }
    }

    return Array.from(normalizedValues);
  }

  /**
   * Normalize candidate list into positive integer timestamps.
   *
   * @param {unknown} value - Candidate list.
   * @returns {number[]}
   */
  #normalizeNumberList(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalizedValues = [];
    for (const entry of value) {
      const normalizedEntry = this.#normalizeInteger(entry);
      if (normalizedEntry > 0) {
        normalizedValues.push(normalizedEntry);
      }
    }

    return normalizedValues.sort((a, b) => a - b);
  }

  /**
   * Normalize unknown value into non-negative integer.
   *
   * @param {unknown} value - Candidate integer.
   * @returns {number}
   */
  #normalizeInteger(value) {
    const candidate = Number(value);
    if (!Number.isInteger(candidate) || candidate < 0) {
      return 0;
    }

    return candidate;
  }
}

module.exports = {
  NOT_INTERESTED_STATE_STORAGE_KEY,
  NotInterestedStateStore,
};
