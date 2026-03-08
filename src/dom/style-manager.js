/**
 * @file Manage idempotent filter style injection and element visibility flags.
 */

const { collectVerifiedBadgeElements } = require('./verified-badge-dom');

const FILTER_STYLE_ID = 'btf-style';
const FILTER_HIDDEN_ATTRIBUTE = 'data-btf-hidden';
const FILTER_REASON_ATTRIBUTE = 'data-btf-reasons';
const FILTER_POST_ID_ATTRIBUTE = 'data-btf-post-id';
const VERIFIED_BADGE_HIDDEN_ATTRIBUTE = 'data-btf-verified-badge-hidden';
const FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE = 'data-btf-first-visible-timeline-item';
const TIMELINE_CHROME_LINK_SELECTOR = 'a[href*="/for_you"], a[href*="/following"]';
const POST_PERMALINK_SELECTOR = 'a[href*="/@"][href*="/post/"]';
const TIMELINE_REGION_SELECTOR = '[aria-label="Column body"]';

/**
 * Control hide/unhide rendering contract for filtered content.
 */
class StyleManager {
  /**
   * Ensure filter stylesheet exists exactly once.
   */
  ensureFilterStyles() {
    if (typeof document === 'undefined') {
      return;
    }

    const existingTag = document.getElementById(FILTER_STYLE_ID);
    if (existingTag) {
      return;
    }

    const styleTag = document.createElement('style');
    styleTag.id = FILTER_STYLE_ID;
    styleTag.textContent = `
[${FILTER_HIDDEN_ATTRIBUTE}="true"] {
  display: none !important;
}
[${FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE}="true"] {
  border-top-width: 0 !important;
  border-top-color: transparent !important;
}
[${VERIFIED_BADGE_HIDDEN_ATTRIBUTE}="true"] {
  display: none !important;
}
`;

    const head = document.head || document.documentElement;
    if (head) {
      head.appendChild(styleTag);
    }
  }

  /**
   * Hide element and attach deterministic reason metadata.
   *
   * @param {HTMLElement} element - Target content element.
   * @param {string[]} reasons - Blocking reasons.
   * @param {{ postCode?: string }} [options] - Visibility marker options.
   */
  hideElement(element, reasons, options = {}) {
    if (!element) {
      return;
    }

    if (this.#isUnsafeHideTarget(element)) {
      this.unhideElement(element);
      return;
    }

    this.#clearNestedMarkers(element);
    element.setAttribute(FILTER_HIDDEN_ATTRIBUTE, 'true');
    element.setAttribute(FILTER_REASON_ATTRIBUTE, reasons.join(','));
    const postCode = String(options.postCode || '').trim();
    if (postCode) {
      element.setAttribute(FILTER_POST_ID_ATTRIBUTE, postCode);
    } else {
      element.removeAttribute(FILTER_POST_ID_ATTRIBUTE);
    }
  }

  /**
   * Restore element visibility when no rule currently blocks it.
   *
   * @param {HTMLElement} element - Target content element.
   */
  unhideElement(element) {
    if (!element) {
      return;
    }

    this.#removeMarkerAttributes(element);
    this.#clearNestedMarkers(element);
  }

  /**
   * Clear all hide markers under a root to recover from stale hidden state.
   *
   * @param {Document|HTMLElement} [root=document] - Root scope for cleanup.
   */
  clearAllHiddenMarkers(root = document) {
    if (!root) {
      return;
    }

    if (typeof root.removeAttribute === 'function') {
      this.#removeMarkerAttributes(root);
      this.#removeTimelineDividerAttributes(root);
    }

    if (typeof root.querySelectorAll !== 'function') {
      return;
    }

    const markedElements = root.querySelectorAll(
      `[${FILTER_HIDDEN_ATTRIBUTE}], [${FILTER_REASON_ATTRIBUTE}], [${FILTER_POST_ID_ATTRIBUTE}], [${FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE}]`
    );

    for (const markedElement of markedElements) {
      this.#removeMarkerAttributes(markedElement);
      this.#removeTimelineDividerAttributes(markedElement);
    }
  }

  /**
   * Sync top-divider ownership when hidden rows shift the first visible timeline item.
   *
   * @param {HTMLElement[]} contentElements - Content-row elements in timeline order.
   * @param {Document|HTMLElement} [root=document] - Cleanup scope for stale divider markers.
   */
  syncFirstVisibleTimelineDividers(contentElements, root = document) {
    this.clearAllTimelineDividerMarkers(root);

    const groupedElements = this.#groupElementsBySiblingContainer(contentElements);
    for (const [siblingContainer, timelineElements] of groupedElements.entries()) {
      const timelineElementSet = new Set(timelineElements);
      let sawHiddenElement = false;
      const siblingElements = Array.from(siblingContainer.children || []);
      for (const siblingElement of siblingElements) {
        if (!this.#isUsableTimelineElement(siblingElement)) {
          continue;
        }

        if (siblingElement.getAttribute(FILTER_HIDDEN_ATTRIBUTE) === 'true') {
          sawHiddenElement = true;
          continue;
        }

        if (!timelineElementSet.has(siblingElement)) {
          continue;
        }

        if (sawHiddenElement) {
          const dividerTarget = this.#resolveDividerTarget(siblingElement);
          dividerTarget.setAttribute(FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE, 'true');
        }
        break;
      }
    }
  }

  /**
   * Toggle visibility markers for verified badge nodes inside one scope.
   *
   * @param {Document|HTMLElement} root - Scope containing badge nodes.
   * @param {boolean} shouldHide - Whether verified badges should be hidden.
   */
  setVerifiedBadgesHidden(root, shouldHide) {
    const badgeElements = collectVerifiedBadgeElements(root);
    for (const badgeElement of badgeElements) {
      if (shouldHide) {
        badgeElement.setAttribute(VERIFIED_BADGE_HIDDEN_ATTRIBUTE, 'true');
      } else {
        badgeElement.removeAttribute(VERIFIED_BADGE_HIDDEN_ATTRIBUTE);
      }
    }
  }

  /**
   * Clear every verified badge visibility marker under one root.
   *
   * @param {Document|HTMLElement} [root=document] - Scope for marker cleanup.
   */
  clearAllVerifiedBadgeMarkers(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return;
    }

    const markedBadgeElements = root.querySelectorAll(`[${VERIFIED_BADGE_HIDDEN_ATTRIBUTE}]`);
    for (const markedBadgeElement of markedBadgeElements) {
      markedBadgeElement.removeAttribute(VERIFIED_BADGE_HIDDEN_ATTRIBUTE);
    }
  }

  /**
   * Clear all top-divider normalization markers under one root.
   *
   * @param {Document|HTMLElement} [root=document] - Scope for divider cleanup.
   */
  clearAllTimelineDividerMarkers(root = document) {
    if (!root) {
      return;
    }

    if (typeof root.removeAttribute === 'function') {
      this.#removeTimelineDividerAttributes(root);
    }

    if (typeof root.querySelectorAll !== 'function') {
      return;
    }

    const markedTimelineElements = root.querySelectorAll(
      `[${FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE}]`
    );
    for (const markedTimelineElement of markedTimelineElements) {
      this.#removeTimelineDividerAttributes(markedTimelineElement);
    }
  }

  /**
   * Remove stale hide metadata from nested descendants.
   *
   * @param {HTMLElement} element - Marker cleanup root.
   */
  #clearNestedMarkers(element) {
    const nestedMarkedElements = element.querySelectorAll(
      `[${FILTER_HIDDEN_ATTRIBUTE}], [${FILTER_REASON_ATTRIBUTE}], [${FILTER_POST_ID_ATTRIBUTE}]`
    );

    for (const nestedMarkedElement of nestedMarkedElements) {
      this.#removeMarkerAttributes(nestedMarkedElement);
    }
  }

  /**
   * Remove runtime marker attributes from one element.
   *
   * @param {HTMLElement} element - Marker target.
   */
  #removeMarkerAttributes(element) {
    if (!element || typeof element.removeAttribute !== 'function') {
      return;
    }

    element.removeAttribute(FILTER_HIDDEN_ATTRIBUTE);
    element.removeAttribute(FILTER_REASON_ATTRIBUTE);
    element.removeAttribute(FILTER_POST_ID_ATTRIBUTE);
  }

  /**
   * Remove top-divider normalization metadata from one element.
   *
   * @param {HTMLElement|Document} element - Marker target.
   */
  #removeTimelineDividerAttributes(element) {
    if (!element || typeof element.removeAttribute !== 'function') {
      return;
    }

    element.removeAttribute(FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE);
  }

  /**
   * Group timeline elements by row-shell sibling container while preserving document order.
   *
   * @param {HTMLElement[]} contentElements - Candidate content-row elements.
   * @returns {Map<HTMLElement|Document, HTMLElement[]>}
   */
  #groupElementsBySiblingContainer(contentElements) {
    const groupedElements = new Map();
    const candidateElements = Array.isArray(contentElements) ? contentElements : [];
    for (const contentElement of candidateElements) {
      if (!this.#isUsableTimelineElement(contentElement)) {
        continue;
      }

      const siblingContainer = this.#resolveTimelineSiblingContainer(contentElement);
      const siblingElement = this.#resolveSiblingContainerChild(contentElement, siblingContainer);
      if (!this.#isUsableTimelineElement(siblingElement)) {
        continue;
      }

      if (!groupedElements.has(siblingContainer)) {
        groupedElements.set(siblingContainer, []);
      }

      groupedElements.get(siblingContainer).push(siblingElement);
    }

    return groupedElements;
  }

  /**
   * Resolve the row-shell sibling container that owns one timeline element.
   *
   * @param {HTMLElement} element - Candidate content-row element.
   * @returns {HTMLElement|Document}
   */
  #resolveTimelineSiblingContainer(element) {
    const timelineRegion = this.#resolveTimelineRegion(element);
    let currentElement = element;
    while (this.#isUsableTimelineElement(currentElement) && currentElement !== timelineRegion) {
      const parentElement = currentElement.parentElement;
      if (this.#isTimelineSiblingContainer(parentElement)) {
        return parentElement;
      }

      currentElement = parentElement;
    }

    if (this.#isTimelineSiblingContainer(timelineRegion)) {
      return timelineRegion;
    }

    return typeof document !== 'undefined' ? document : timelineRegion;
  }

  /**
   * Resolve the direct row-shell child that participates in one sibling container.
   *
   * @param {HTMLElement} element - Candidate content-row element.
   * @param {HTMLElement|Document} siblingContainer - Candidate sibling container.
   * @returns {HTMLElement|null}
   */
  #resolveSiblingContainerChild(element, siblingContainer) {
    if (!this.#isUsableTimelineElement(element)) {
      return null;
    }

    if (!siblingContainer || siblingContainer === document) {
      return element;
    }

    let currentElement = element;
    while (this.#isUsableTimelineElement(currentElement)) {
      if (currentElement.parentElement === siblingContainer) {
        return currentElement;
      }

      currentElement = currentElement.parentElement;
    }

    return element;
  }

  /**
   * Validate whether one container owns sibling row shells in the feed.
   *
   * @param {HTMLElement|Document|null} element - Candidate sibling container.
   * @returns {boolean}
   */
  #isTimelineSiblingContainer(element) {
    if (!this.#isUsableTimelineElement(element)) {
      return false;
    }

    const childElements = Array.from(element.children || []).filter((childElement) =>
      this.#isUsableTimelineElement(childElement)
    );
    if (childElements.length < 2) {
      return false;
    }

    let timelineChildCount = 0;
    for (const childElement of childElements) {
      if (this.#looksLikeTimelineRowShell(childElement)) {
        timelineChildCount += 1;
      }
    }

    return timelineChildCount >= 2;
  }

  /**
   * Recognize one row shell in the live Threads feed list.
   *
   * @param {HTMLElement} element - Candidate row shell.
   * @returns {boolean}
   */
  #looksLikeTimelineRowShell(element) {
    if (!this.#isUsableTimelineElement(element)) {
      return false;
    }

    if (element.getAttribute(FILTER_HIDDEN_ATTRIBUTE) === 'true') {
      return true;
    }

    return (
      typeof element.querySelector === 'function' &&
      (Boolean(element.querySelector(POST_PERMALINK_SELECTOR)) ||
        Boolean(element.querySelector('[data-pressable-container="true"]')))
    );
  }

  /**
   * Resolve the element that actually paints the top divider for one row shell.
   *
   * @param {HTMLElement} timelineElement - Candidate row shell.
   * @returns {HTMLElement}
   */
  #resolveDividerTarget(timelineElement) {
    const preferredCandidates = [timelineElement];
    if (typeof timelineElement.querySelectorAll === 'function') {
      preferredCandidates.push(
        ...timelineElement.querySelectorAll('[data-pressable-container="true"]')
      );
    }

    for (const candidateElement of preferredCandidates) {
      if (this.#hasVisibleTopBorder(candidateElement)) {
        return candidateElement;
      }
    }

    if (typeof timelineElement.querySelectorAll === 'function') {
      const descendantElements = timelineElement.querySelectorAll('*');
      for (const descendantElement of descendantElements) {
        if (this.#hasVisibleTopBorder(descendantElement)) {
          return descendantElement;
        }
      }
    }

    return timelineElement;
  }

  /**
   * Detect whether one element paints a visible top divider.
   *
   * @param {HTMLElement} element - Candidate divider owner.
   * @returns {boolean}
   */
  #hasVisibleTopBorder(element) {
    if (!this.#isUsableTimelineElement(element) || typeof getComputedStyle !== 'function') {
      return false;
    }

    const computedStyle = getComputedStyle(element);
    return (
      Number.parseFloat(computedStyle.borderTopWidth || '0') > 0 &&
      String(computedStyle.borderTopStyle || '').toLowerCase() !== 'none'
    );
  }

  /**
   * Resolve the nearest timeline region that owns one content row.
   *
   * @param {HTMLElement} element - Candidate content-row element.
   * @returns {Document|HTMLElement}
   */
  #resolveTimelineRegion(element) {
    if (element && typeof element.closest === 'function') {
      const timelineRegion = element.closest(TIMELINE_REGION_SELECTOR);
      if (timelineRegion) {
        return timelineRegion;
      }
    }

    return typeof document !== 'undefined' ? document : element;
  }

  /**
   * Accept only connected element nodes that can own timeline divider styling.
   *
   * @param {unknown} element - Candidate content-row element.
   * @returns {boolean}
   */
  #isUsableTimelineElement(element) {
    return Boolean(
      element &&
      typeof element === 'object' &&
      element.nodeType === 1 &&
      typeof element.getAttribute === 'function' &&
      (element.isConnected === undefined || element.isConnected === true)
    );
  }

  /**
   * Prevent hiding global feed containers when upstream matching drifts.
   *
   * @param {HTMLElement} element - Candidate hide target.
   * @returns {boolean}
   */
  #isUnsafeHideTarget(element) {
    const tagName = String(element.tagName || '').toUpperCase();
    if (['HTML', 'BODY', 'MAIN'].includes(tagName)) {
      return true;
    }

    if (
      typeof element.querySelector === 'function' &&
      element.querySelector(TIMELINE_CHROME_LINK_SELECTOR)
    ) {
      return true;
    }

    if (this.#isDirectChildOfTimelineChromeShell(element)) {
      return true;
    }

    if (this.#isViewportScaleContainer(element)) {
      return true;
    }

    return false;
  }

  /**
   * Reject child wrappers under timeline tab containers when feed has at most one loaded post.
   *
   * @param {HTMLElement} element - Candidate hide target.
   * @returns {boolean}
   */
  #isDirectChildOfTimelineChromeShell(element) {
    const parentElement = element.parentElement;
    if (!parentElement || typeof parentElement.querySelector !== 'function') {
      return false;
    }

    if (!parentElement.querySelector(TIMELINE_CHROME_LINK_SELECTOR)) {
      return false;
    }

    const parentPermalinkCount = parentElement.querySelectorAll(POST_PERMALINK_SELECTOR).length;
    return parentPermalinkCount <= 1;
  }

  /**
   * Reject hiding containers that span most of the viewport.
   *
   * @param {HTMLElement} element - Candidate hide target.
   * @returns {boolean}
   */
  #isViewportScaleContainer(element) {
    if (
      typeof window === 'undefined' ||
      typeof element.getBoundingClientRect !== 'function' ||
      !Number.isFinite(window.innerHeight) ||
      !Number.isFinite(window.innerWidth) ||
      window.innerHeight <= 0 ||
      window.innerWidth <= 0
    ) {
      return false;
    }

    const rectangle = element.getBoundingClientRect();
    if (!Number.isFinite(rectangle.height) || !Number.isFinite(rectangle.width)) {
      return false;
    }

    if (rectangle.height <= 0 || rectangle.width <= 0) {
      return false;
    }

    return (
      rectangle.height >= window.innerHeight * 0.9 && rectangle.width >= window.innerWidth * 0.25
    );
  }
}

module.exports = {
  FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE,
  FILTER_HIDDEN_ATTRIBUTE,
  FILTER_POST_ID_ATTRIBUTE,
  FILTER_REASON_ATTRIBUTE,
  VERIFIED_BADGE_HIDDEN_ATTRIBUTE,
  StyleManager,
};
