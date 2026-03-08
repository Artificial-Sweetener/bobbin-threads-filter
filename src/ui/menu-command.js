/**
 * @file Register userscript menu commands safely across manager variants.
 */

/**
 * Register userscript menu commands without assuming one specific manager API.
 */
class MenuCommandRegistrar {
  /**
   * Register a menu command when userscript APIs are available.
   *
   * @param {string} label - Menu label text.
   * @param {Function} handler - Command callback.
   */
  register(label, handler) {
    const globalObject = typeof globalThis !== 'undefined' ? globalThis : null;
    if (!globalObject) {
      return;
    }

    const gm = globalObject.GM;
    if (gm && typeof gm.registerMenuCommand === 'function') {
      gm.registerMenuCommand(label, handler);
      return;
    }

    if (typeof globalObject.GM_registerMenuCommand === 'function') {
      globalObject.GM_registerMenuCommand(label, handler);
    }
  }
}

module.exports = {
  MenuCommandRegistrar,
};
