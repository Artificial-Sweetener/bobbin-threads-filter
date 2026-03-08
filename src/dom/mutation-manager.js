/**
 * @file Coordinate debounced mutation observation for feed re-processing.
 */

/**
 * Watch host mutations and schedule stable reruns without churn.
 */
class MutationManager {
  /**
   * Initialize mutation watcher dependencies and defaults.
   *
   * @param {{
   *   onMutations: Function,
   *   debounceMs?: number,
   *   observerFactory?: (callback: MutationCallback) => MutationObserver
   * }} options - Mutation manager options.
   */
  constructor(options) {
    const {
      onMutations,
      debounceMs = 100,
      observerFactory = (callback) => new MutationObserver(callback),
    } = options;
    this.onMutations = onMutations;
    this.debounceMs = debounceMs;
    this.observerFactory = observerFactory;
    this.observer = null;
    this.debounceTimerId = null;
  }

  /**
   * Start observing target node with configurable observer options.
   *
   * @param {Node} targetNode - Observation root.
   * @param {MutationObserverInit} [observeOptions] - Native observer options.
   */
  start(targetNode, observeOptions = { childList: true, subtree: true }) {
    if (!targetNode || typeof MutationObserver === 'undefined') {
      return;
    }

    this.stop();
    this.observer = this.observerFactory(() => {
      if (this.debounceTimerId !== null) {
        return;
      }

      this.debounceTimerId = window.setTimeout(() => {
        this.debounceTimerId = null;
        this.onMutations();
      }, this.debounceMs);
    });
    this.observer.observe(targetNode, observeOptions);
  }

  /**
   * Stop observing and clear pending scheduled reruns.
   */
  stop() {
    if (this.observer && typeof this.observer.disconnect === 'function') {
      this.observer.disconnect();
    }
    this.observer = null;

    if (this.debounceTimerId !== null) {
      clearTimeout(this.debounceTimerId);
      this.debounceTimerId = null;
    }
  }
}

module.exports = {
  MutationManager,
};
