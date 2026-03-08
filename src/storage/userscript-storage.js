/**
 * @file Provide resilient userscript storage abstraction.
 */

/**
 * Read GM API surface from global context safely.
 *
 * @returns {{ getValue?: Function, setValue?: Function }|null}
 */
function getUserscriptApi() {
  const globalObject = typeof globalThis !== 'undefined' ? globalThis : null;
  const gm =
    globalObject && globalObject.GM && typeof globalObject.GM === 'object' ? globalObject.GM : null;
  return gm;
}

/**
 * Persist and retrieve settings through GM APIs with localStorage fallback.
 */
class UserscriptStorageAdapter {
  /**
   * Resolve persisted value without throwing when storage backend is unavailable.
   *
   * @param {string} key - Storage key.
   * @param {unknown} defaultValue - Fallback value.
   * @returns {Promise<unknown>}
   */
  async getValue(key, defaultValue = null) {
    const gm = getUserscriptApi();
    if (gm && typeof gm.getValue === 'function') {
      return gm.getValue(key, defaultValue);
    }

    if (typeof localStorage === 'undefined') {
      return defaultValue;
    }

    try {
      const rawValue = localStorage.getItem(key);
      if (rawValue === null) {
        return defaultValue;
      }
      return JSON.parse(rawValue);
    } catch (_error) {
      return defaultValue;
    }
  }

  /**
   * Persist value without propagating host-storage runtime failures.
   *
   * @param {string} key - Storage key.
   * @param {unknown} value - Serializable value.
   * @returns {Promise<void>}
   */
  async setValue(key, value) {
    const gm = getUserscriptApi();
    if (gm && typeof gm.setValue === 'function') {
      await gm.setValue(key, value);
      return;
    }

    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {
      // Ignore quota and serialization failures to avoid page breakage.
    }
  }
}

module.exports = {
  UserscriptStorageAdapter,
};
