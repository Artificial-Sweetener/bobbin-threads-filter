/**
 * @file Persist normalized settings through schema-aware storage boundaries.
 */

const { SETTINGS_STORAGE_KEY, SettingsSchema } = require('./settings-schema');
const { UserscriptStorageAdapter } = require('./userscript-storage');

/**
 * Enforce schema normalization for all setting reads and writes.
 */
class SettingsStore {
  /**
   * Initialize store dependencies and defaults.
   *
   * @param {{
   *   schema?: SettingsSchema,
   *   storageAdapter?: UserscriptStorageAdapter,
   *   storageKey?: string
   * }} [options] - Store options.
   */
  constructor(options = {}) {
    const {
      schema = new SettingsSchema(),
      storageAdapter = new UserscriptStorageAdapter(),
      storageKey = SETTINGS_STORAGE_KEY,
    } = options;

    this.schema = schema;
    this.storageAdapter = storageAdapter;
    this.storageKey = storageKey;
  }

  /**
   * Load settings and normalize them before any runtime subsystem consumes them.
   *
   * @returns {Promise<object>}
   */
  async load() {
    const rawSettings = await this.storageAdapter.getValue(this.storageKey, null);
    return this.schema.normalize(rawSettings);
  }

  /**
   * Save settings only after schema normalization.
   *
   * @param {unknown} nextSettings - Candidate settings.
   * @returns {Promise<object>}
   */
  async save(nextSettings) {
    const normalizedSettings = this.schema.normalize(nextSettings);
    await this.storageAdapter.setValue(this.storageKey, normalizedSettings);
    return normalizedSettings;
  }
}

module.exports = {
  SettingsStore,
};
