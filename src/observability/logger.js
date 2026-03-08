/**
 * @file Provide structured runtime logging with level-based filtering.
 */

const LOG_LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
});

/**
 * Emit namespaced logs while enforcing minimum log-level policy.
 */
class Logger {
  /**
   * Initialize logger dependencies and normalize configuration.
   *
   * @param {{ namespace?: string, level?: string, writer?: Console }} [options] - Logger options.
   */
  constructor(options = {}) {
    const { namespace = 'btf', level = 'warn', writer = console } = options;
    this.namespace = namespace;
    this.writer = writer;
    this.minimumLevelName = this.#normalizeLevel(level);
  }

  /**
   * Update minimum level so diagnostics can be tuned at runtime.
   *
   * @param {string} level - Desired minimum level.
   */
  setLevel(level) {
    this.minimumLevelName = this.#normalizeLevel(level);
  }

  /**
   * Emit debug-level diagnostics for detailed development traces.
   *
   * @param {string} message - Log message text.
   * @param {Record<string, unknown>} [context] - Optional structured context.
   */
  debug(message, context) {
    this.#write('debug', message, context);
  }

  /**
   * Emit info-level diagnostics for lifecycle milestones.
   *
   * @param {string} message - Log message text.
   * @param {Record<string, unknown>} [context] - Optional structured context.
   */
  info(message, context) {
    this.#write('info', message, context);
  }

  /**
   * Emit warn-level diagnostics for recoverable anomalies.
   *
   * @param {string} message - Log message text.
   * @param {Record<string, unknown>} [context] - Optional structured context.
   */
  warn(message, context) {
    this.#write('warn', message, context);
  }

  /**
   * Emit error-level diagnostics for failed operations.
   *
   * @param {string} message - Log message text.
   * @param {Record<string, unknown>} [context] - Optional structured context.
   */
  error(message, context) {
    this.#write('error', message, context);
  }

  /**
   * Normalize level input to a known level token.
   *
   * @param {string} level - Candidate level.
   * @returns {string}
   */
  #normalizeLevel(level) {
    const candidate = String(level || '')
      .toLowerCase()
      .trim();
    return Object.prototype.hasOwnProperty.call(LOG_LEVELS, candidate) ? candidate : 'warn';
  }

  /**
   * Decide whether current configuration permits a level to be written.
   *
   * @param {string} level - Candidate level.
   * @returns {boolean}
   */
  #shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minimumLevelName];
  }

  /**
   * Route logs to the selected writer while preserving structured context.
   *
   * @param {'debug'|'info'|'warn'|'error'} level - Severity level.
   * @param {string} message - Log message text.
   * @param {Record<string, unknown>} [context] - Optional structured context.
   */
  #write(level, message, context) {
    if (!this.#shouldLog(level)) {
      return;
    }

    const prefix = `[${this.namespace}] ${level.toUpperCase()}:`;
    const method = level === 'debug' ? 'log' : level;
    const writerMethod =
      this.writer && typeof this.writer[method] === 'function' ? this.writer[method] : console.log;

    if (context && Object.keys(context).length > 0) {
      writerMethod.call(this.writer, prefix, message, context);
      return;
    }

    writerMethod.call(this.writer, prefix, message);
  }
}

module.exports = {
  LOG_LEVELS,
  Logger,
};
