/**
 * @file Mount a native-looking Threads rail icon that toggles the Bobbin settings menu.
 */

const { whenBodyReady } = require('../dom/body-ready');
const { BOBBIN_ICON_DATA_URI } = require('../res/bobbin-icon-data-uri');

const {
  SIDEBAR_TRIGGER_ICON_OFFSET_X_PX,
  SIDEBAR_TRIGGER_ICON_OFFSET_Y_PX,
  SIDEBAR_TRIGGER_ICON_SIZE_PX,
} = require('./sidebar-trigger-config');

const STYLE_ID = 'btf-sidebar-trigger-style';
const TRIGGER_ROOT_ATTRIBUTE = 'data-btf-sidebar-trigger-root';
const TRIGGER_CONTROL_ATTRIBUTE = 'data-btf-sidebar-trigger-control';
const TRIGGER_LAYER_ATTRIBUTE = 'data-btf-sidebar-trigger-layer';
const TRIGGER_OPEN_ATTRIBUTE = 'data-btf-open';
const TRIGGER_LABEL = 'Bobbin Filters';
const LEFT_RAIL_MAX_X_PX = 220;
const LEFT_RAIL_MIN_Y_RATIO = 0.55;
const REFRESH_DEBOUNCE_MS = 60;

/**
 * Normalize one candidate label for case-insensitive matching.
 *
 * @param {unknown} value - Candidate text value.
 * @returns {string}
 */
function normalizeLabel(value) {
  return String(value === null || value === undefined ? '' : value)
    .trim()
    .toLowerCase();
}

/**
 * Keep one sidebar trigger mounted above Threads' native More control.
 */
class ThreadsSidebarMenuTrigger {
  /**
   * Initialize trigger dependencies and stable event delegates.
   *
   * @param {{
   *   onActivate?: () => Promise<void> | void,
   *   isMenuOpenProvider?: () => boolean,
   *   scheduleFn?: (callback: Function, delayMs: number) => unknown,
   *   clearScheduleFn?: (timerId: unknown) => void,
   *   logger?: { debug?: Function, error?: Function }
   * }} [options] - Trigger dependencies.
   */
  constructor(options = {}) {
    this.onActivate = typeof options.onActivate === 'function' ? options.onActivate : () => {};
    this.isMenuOpenProvider =
      typeof options.isMenuOpenProvider === 'function' ? options.isMenuOpenProvider : null;
    this.scheduleFn =
      typeof options.scheduleFn === 'function'
        ? options.scheduleFn
        : (callback, delayMs) => setTimeout(callback, delayMs);
    this.clearScheduleFn =
      typeof options.clearScheduleFn === 'function'
        ? options.clearScheduleFn
        : (timerId) => clearTimeout(timerId);
    this.logger = options.logger || {};

    this.isRunning = false;
    this.isActivationPending = false;
    this.menuOpen = false;
    this.triggerWrapperElement = null;
    this.triggerControlElement = null;
    this.bodyObserver = null;
    this.pendingRefreshTimerId = null;

    this.handleTriggerClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.#activateMenuToggle();
    };
    this.handleTriggerKeydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void this.#activateMenuToggle();
    };
  }

  /**
   * Start trigger lifecycle and attempt immediate mount.
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning || typeof document === 'undefined') {
      return;
    }

    this.isRunning = true;
    await this.#ensureBodyReady();
    if (!this.isRunning) {
      return;
    }

    this.#ensureStyleTag();
    this.refresh();
    this.#startBodyObserver();
  }

  /**
   * Stop trigger lifecycle and remove injected UI.
   */
  stop() {
    this.isRunning = false;
    this.isActivationPending = false;
    this.menuOpen = false;
    this.#clearPendingRefresh();
    this.#stopBodyObserver();
    this.#removeTrigger();
    this.#removeStyleTag();
  }

  /**
   * Refresh trigger mount state against the current Threads sidebar DOM.
   */
  refresh() {
    if (!this.isRunning) {
      return;
    }

    this.#syncTriggerMount();
  }

  /**
   * Keep visual open-state in sync with settings menu visibility.
   *
   * @param {boolean} isOpen - Current settings menu open state.
   */
  setMenuOpen(isOpen) {
    this.menuOpen = Boolean(isOpen);
    this.#applyControlState();
  }

  /**
   * Wait for body availability before injecting trigger nodes.
   *
   * @returns {Promise<void>}
   */
  async #ensureBodyReady() {
    if (document.body) {
      return;
    }

    await new Promise((resolve) => {
      whenBodyReady(resolve);
    });
  }

  /**
   * Insert trigger stylesheet exactly once.
   */
  #ensureStyleTag() {
    const styleMarkup = `
[${TRIGGER_CONTROL_ATTRIBUTE}="true"] .btf-sidebar-trigger-icon{
  display:block;
  width:var(--x-width,${SIDEBAR_TRIGGER_ICON_SIZE_PX}px);
  height:var(--x-height,${SIDEBAR_TRIGGER_ICON_SIZE_PX}px);
  background-color:currentColor;
  -webkit-mask-image:url("${BOBBIN_ICON_DATA_URI}");
  mask-image:url("${BOBBIN_ICON_DATA_URI}");
  -webkit-mask-repeat:no-repeat;
  mask-repeat:no-repeat;
  -webkit-mask-position:center;
  mask-position:center;
  -webkit-mask-size:contain;
  mask-size:contain;
  transform:translate(var(--btf-icon-offset-x,${SIDEBAR_TRIGGER_ICON_OFFSET_X_PX}px),var(--btf-icon-offset-y,${SIDEBAR_TRIGGER_ICON_OFFSET_Y_PX}px))
}
[${TRIGGER_CONTROL_ATTRIBUTE}="true"][${TRIGGER_OPEN_ATTRIBUTE}="true"] [${TRIGGER_LAYER_ATTRIBUTE}="base"]{opacity:0!important}
[${TRIGGER_CONTROL_ATTRIBUTE}="true"][${TRIGGER_OPEN_ATTRIBUTE}="true"] [${TRIGGER_LAYER_ATTRIBUTE}="active"]{opacity:1!important}
`;

    const existingStyleElement = document.getElementById(STYLE_ID);
    if (existingStyleElement) {
      if (existingStyleElement.textContent !== styleMarkup) {
        existingStyleElement.textContent = styleMarkup;
      }
      return;
    }

    const styleElement = document.createElement('style');
    styleElement.id = STYLE_ID;
    styleElement.textContent = styleMarkup;
    const head = document.head || document.documentElement;
    head?.appendChild(styleElement);
  }

  /**
   * Observe host DOM updates and coalesce trigger remount checks.
   */
  #startBodyObserver() {
    this.#stopBodyObserver();

    if (typeof MutationObserver !== 'function' || !document.body) {
      return;
    }

    this.bodyObserver = new MutationObserver(() => {
      this.#scheduleRefresh();
    });
    this.bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Stop observing host DOM updates.
   */
  #stopBodyObserver() {
    if (!this.bodyObserver) {
      return;
    }

    this.bodyObserver.disconnect();
    this.bodyObserver = null;
  }

  /**
   * Schedule one debounced refresh run during intense host mutations.
   */
  #scheduleRefresh() {
    if (!this.isRunning || this.pendingRefreshTimerId !== null) {
      return;
    }

    this.pendingRefreshTimerId = this.scheduleFn(() => {
      this.pendingRefreshTimerId = null;
      this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  /**
   * Cancel a pending debounced refresh run.
   */
  #clearPendingRefresh() {
    if (this.pendingRefreshTimerId === null) {
      return;
    }

    this.clearScheduleFn(this.pendingRefreshTimerId);
    this.pendingRefreshTimerId = null;
  }

  /**
   * Mount trigger above native More control and keep ordering stable.
   */
  #syncTriggerMount() {
    const referenceWrapper = this.#resolveReferenceWrapper();
    if (!referenceWrapper || !referenceWrapper.parentElement) {
      this.#removeTrigger();
      return;
    }

    const parentElement = referenceWrapper.parentElement;
    if (
      this.triggerWrapperElement &&
      this.triggerWrapperElement.parentElement === parentElement &&
      this.triggerControlElement
    ) {
      if (this.triggerWrapperElement.nextElementSibling !== referenceWrapper) {
        parentElement.insertBefore(this.triggerWrapperElement, referenceWrapper);
      }

      this.#applyControlState();
      return;
    }

    this.#removeTrigger();
    const nextTriggerWrapper = this.#buildTriggerWrapper(referenceWrapper);
    if (!nextTriggerWrapper) {
      return;
    }

    parentElement.insertBefore(nextTriggerWrapper, referenceWrapper);
    this.triggerWrapperElement = nextTriggerWrapper;
    this.triggerControlElement = nextTriggerWrapper.querySelector(
      `[${TRIGGER_CONTROL_ATTRIBUTE}="true"]`
    );
    this.#applyControlState();
  }

  /**
   * Resolve native More wrapper in the left rail for trigger insertion.
   *
   * @returns {HTMLElement | null}
   */
  #resolveReferenceWrapper() {
    const candidateControls = Array.from(
      document.querySelectorAll('[aria-haspopup="menu"][role="button"]')
    );
    if (candidateControls.length === 0) {
      return null;
    }

    let selectedControl = null;
    for (const control of candidateControls) {
      if (!(control instanceof HTMLElement)) {
        continue;
      }

      if (!this.#isLeftRailMoreControl(control)) {
        continue;
      }

      if (!selectedControl) {
        selectedControl = control;
        continue;
      }

      const selectedTop = selectedControl.getBoundingClientRect().top;
      const candidateTop = control.getBoundingClientRect().top;
      if (candidateTop > selectedTop) {
        selectedControl = control;
      }
    }

    if (!selectedControl || !selectedControl.parentElement) {
      return null;
    }

    return selectedControl.parentElement;
  }

  /**
   * Accept only the desktop left-rail More control as insertion anchor.
   *
   * @param {HTMLElement} controlElement - Candidate menu control.
   * @returns {boolean}
   */
  #isLeftRailMoreControl(controlElement) {
    const rectangle = controlElement.getBoundingClientRect();
    if (!Number.isFinite(rectangle.left) || !Number.isFinite(rectangle.top)) {
      return false;
    }

    const viewportWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : 0;
    const viewportHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : 0;
    const maxLeft = Math.max(LEFT_RAIL_MAX_X_PX, Math.round(viewportWidth * 0.13));
    if (rectangle.left > maxLeft) {
      return false;
    }

    if (viewportHeight > 0 && rectangle.top < viewportHeight * LEFT_RAIL_MIN_Y_RATIO) {
      return false;
    }

    return this.#containsMoreGlyph(controlElement);
  }

  /**
   * Confirm candidate control still represents Threads' More action.
   *
   * @param {HTMLElement} controlElement - Candidate menu control.
   * @returns {boolean}
   */
  #containsMoreGlyph(controlElement) {
    const directLabel = normalizeLabel(controlElement.getAttribute('aria-label'));
    if (directLabel.includes('more')) {
      return true;
    }

    const titleLabels = Array.from(controlElement.querySelectorAll('title')).map((titleElement) =>
      normalizeLabel(titleElement.textContent)
    );
    if (titleLabels.some((label) => label.includes('more'))) {
      return true;
    }

    const iconLabels = Array.from(controlElement.querySelectorAll('svg')).map((svgElement) =>
      normalizeLabel(svgElement.getAttribute('aria-label'))
    );
    return iconLabels.some((label) => label.includes('more'));
  }

  /**
   * Build one trigger wrapper by cloning native More layout scaffolding.
   *
   * @param {HTMLElement} referenceWrapper - Native More wrapper.
   * @returns {HTMLElement | null}
   */
  #buildTriggerWrapper(referenceWrapper) {
    const triggerWrapper = referenceWrapper.cloneNode(true);
    if (!(triggerWrapper instanceof HTMLElement)) {
      return null;
    }

    triggerWrapper.setAttribute(TRIGGER_ROOT_ATTRIBUTE, 'true');
    const triggerControl = triggerWrapper.querySelector('[role="button"], button, a');
    if (!(triggerControl instanceof HTMLElement)) {
      return null;
    }

    this.#configureTriggerControl(triggerControl);
    this.#replaceControlIcons(triggerControl);
    return triggerWrapper;
  }

  /**
   * Normalize cloned control semantics for Bobbin menu toggling.
   *
   * @param {HTMLElement} controlElement - Trigger control.
   */
  #configureTriggerControl(controlElement) {
    controlElement.removeAttribute('aria-haspopup');
    controlElement.removeAttribute('aria-expanded');
    controlElement.removeAttribute('aria-controls');
    controlElement.setAttribute(TRIGGER_CONTROL_ATTRIBUTE, 'true');
    controlElement.setAttribute('role', 'button');
    controlElement.setAttribute('tabindex', '0');
    controlElement.setAttribute('title', TRIGGER_LABEL);
    controlElement.setAttribute('aria-label', TRIGGER_LABEL);

    controlElement.removeEventListener('click', this.handleTriggerClick);
    controlElement.removeEventListener('keydown', this.handleTriggerKeydown);
    controlElement.addEventListener('click', this.handleTriggerClick);
    controlElement.addEventListener('keydown', this.handleTriggerKeydown);
  }

  /**
   * Swap native More glyphs with Bobbin mask icons while preserving host layer behavior.
   *
   * @param {HTMLElement} controlElement - Trigger control.
   */
  #replaceControlIcons(controlElement) {
    const iconStackElement = controlElement.firstElementChild;
    if (!(iconStackElement instanceof HTMLElement)) {
      return;
    }

    const iconLayers = Array.from(iconStackElement.children).filter(
      (element) => element instanceof HTMLElement
    );
    if (iconLayers.length === 0) {
      return;
    }

    for (let index = 0; index < iconLayers.length; index += 1) {
      const iconLayer = iconLayers[index];
      const existingSvg = iconLayer.querySelector('svg');
      const iconClassName =
        existingSvg &&
        (typeof existingSvg.className === 'string'
          ? existingSvg.className
          : existingSvg.className.baseVal)
          ? typeof existingSvg.className === 'string'
            ? existingSvg.className
            : existingSvg.className.baseVal
          : '';
      if (existingSvg) {
        existingSvg.remove();
      }

      iconLayer.setAttribute(TRIGGER_LAYER_ATTRIBUTE, index === 0 ? 'base' : 'active');
      const iconElement = document.createElement('span');
      iconElement.className = `${iconClassName} btf-sidebar-trigger-icon`.trim();
      iconElement.setAttribute('aria-hidden', 'true');
      iconElement.style.setProperty('--x-width', `${SIDEBAR_TRIGGER_ICON_SIZE_PX}px`);
      iconElement.style.setProperty('--x-height', `${SIDEBAR_TRIGGER_ICON_SIZE_PX}px`);
      iconElement.style.setProperty('--x-fill', 'currentColor');
      iconElement.style.setProperty('--btf-icon-offset-x', `${SIDEBAR_TRIGGER_ICON_OFFSET_X_PX}px`);
      iconElement.style.setProperty('--btf-icon-offset-y', `${SIDEBAR_TRIGGER_ICON_OFFSET_Y_PX}px`);
      iconLayer.appendChild(iconElement);
    }
  }

  /**
   * Invoke menu toggle callback exactly once per user gesture.
   *
   * @returns {Promise<void>}
   */
  async #activateMenuToggle() {
    if (this.isActivationPending) {
      return;
    }

    this.isActivationPending = true;
    try {
      await this.onActivate();
    } catch (error) {
      this.logger.error?.('Sidebar trigger failed to toggle settings menu.', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isActivationPending = false;
      this.#applyControlState();
    }
  }

  /**
   * Apply current open/closed state to trigger accessibility and visual attributes.
   */
  #applyControlState() {
    if (!this.triggerControlElement) {
      return;
    }

    const isMenuOpen = this.#resolveMenuOpenState();
    this.triggerControlElement.setAttribute(TRIGGER_OPEN_ATTRIBUTE, String(isMenuOpen));
    this.triggerControlElement.setAttribute('aria-pressed', String(isMenuOpen));
  }

  /**
   * Resolve effective menu-open state from provider callback and last known fallback.
   *
   * @returns {boolean}
   */
  #resolveMenuOpenState() {
    if (!this.isMenuOpenProvider) {
      return this.menuOpen;
    }

    try {
      return Boolean(this.isMenuOpenProvider());
    } catch (_error) {
      return this.menuOpen;
    }
  }

  /**
   * Remove injected trigger node and detach control listeners.
   */
  #removeTrigger() {
    if (this.triggerControlElement) {
      this.triggerControlElement.removeEventListener('click', this.handleTriggerClick);
      this.triggerControlElement.removeEventListener('keydown', this.handleTriggerKeydown);
    }

    if (this.triggerWrapperElement && this.triggerWrapperElement.parentElement) {
      this.triggerWrapperElement.parentElement.removeChild(this.triggerWrapperElement);
    }

    this.triggerWrapperElement = null;
    this.triggerControlElement = null;
  }

  /**
   * Remove trigger stylesheet during runtime shutdown.
   */
  #removeStyleTag() {
    const styleElement = document.getElementById(STYLE_ID);
    if (styleElement && styleElement.parentElement) {
      styleElement.parentElement.removeChild(styleElement);
    }
  }
}

module.exports = {
  ThreadsSidebarMenuTrigger,
};
