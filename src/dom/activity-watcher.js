/**
 * @file Trigger debounced reruns for scroll and URL activity.
 */

/**
 * Observe viewport and navigation activity to keep filtering responsive.
 */
class ActivityWatcher {
  /**
   * Initialize watcher options and callback.
   *
   * @param {{
   *   onActivity: Function,
   *   debounceMs?: number,
   *   urlCheckIntervalMs?: number
   * }} options - Activity watcher options.
   */
  constructor(options) {
    const { onActivity, debounceMs = 160, urlCheckIntervalMs = 500 } = options;
    this.onActivity = onActivity;
    this.debounceMs = debounceMs;
    this.urlCheckIntervalMs = urlCheckIntervalMs;

    this.pendingTimerId = null;
    this.urlCheckIntervalId = null;
    this.lastKnownUrl = '';
    this.boundHandleScroll = () => this.schedule();
    this.boundHandlePopstate = () => this.schedule();
  }

  /**
   * Start listening for activity events.
   */
  start() {
    if (typeof window === 'undefined') {
      return;
    }

    this.stop();

    this.lastKnownUrl = window.location.href;
    window.addEventListener('scroll', this.boundHandleScroll, { passive: true });
    window.addEventListener('popstate', this.boundHandlePopstate);

    this.urlCheckIntervalId = window.setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== this.lastKnownUrl) {
        this.lastKnownUrl = currentUrl;
        this.schedule();
      }
    }, this.urlCheckIntervalMs);
  }

  /**
   * Stop all listeners and clear pending callbacks.
   */
  stop() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.boundHandleScroll);
      window.removeEventListener('popstate', this.boundHandlePopstate);
    }

    if (this.urlCheckIntervalId !== null) {
      clearInterval(this.urlCheckIntervalId);
      this.urlCheckIntervalId = null;
    }

    if (this.pendingTimerId !== null) {
      clearTimeout(this.pendingTimerId);
      this.pendingTimerId = null;
    }
  }

  /**
   * Schedule one debounced activity callback.
   */
  schedule() {
    if (this.pendingTimerId !== null) {
      return;
    }

    this.pendingTimerId = window.setTimeout(() => {
      this.pendingTimerId = null;
      this.onActivity();
    }, this.debounceMs);
  }
}

module.exports = {
  ActivityWatcher,
};
