/**
 * @file Execute callbacks when document body becomes available.
 */

/**
 * Wait for body readiness before running DOM-dependent startup logic.
 *
 * @param {() => void} callback - Callback invoked once when body exists.
 */
function whenBodyReady(callback) {
  if (typeof document === 'undefined') {
    return;
  }

  if (document.body) {
    callback();
    return;
  }

  let finished = false;
  let readinessObserver = null;

  const complete = () => {
    if (finished || !document.body) {
      return;
    }

    finished = true;
    if (readinessObserver) {
      readinessObserver.disconnect();
      readinessObserver = null;
    }

    document.removeEventListener('DOMContentLoaded', complete);
    callback();
  };

  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    readinessObserver = new MutationObserver(complete);
    readinessObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  document.addEventListener('DOMContentLoaded', complete, { once: true });
}

module.exports = {
  whenBodyReady,
};
