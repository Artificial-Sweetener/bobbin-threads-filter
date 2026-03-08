/**
 * @file Extract canonical content models from Threads feed DOM.
 */

const { ContentModel } = require('../core/content-model');

const { containsVerifiedBadge } = require('./verified-badge-dom');

const PROFILE_LINK_PATTERN = /\/@([^/?#]+)/i;
const POST_PERMALINK_PATTERN = /\/@([^/?#]+)\/post\/([^/?#]+)/i;

const POST_ACTION_PREFIXES = ['Like', 'Reply', 'Repost', 'Share'];
const TIMELINE_CHROME_LINK_SELECTOR = 'a[href*="/for_you"], a[href*="/following"]';
const SUGGESTED_FOR_YOU_TEXT = 'suggested for you';
const TRENDING_TOPIC_LINK_SELECTOR = 'a[href*="serp_type=timely_topics"], a[href*="trend_fbid="]';
const TRENDING_PREFIX_PATTERN = /^trending:\s*/i;
const HIGHLIGHT_PREFIX_PATTERN = /^highlight\s*/i;
const SUGGESTED_MARKER_SELECTOR = 'div, span, p, h1, h2, h3, h4, h5, h6';
const CONTROL_SELECTOR = 'button, [role="button"]';

/**
 * Translate host DOM elements into normalized content models.
 */
class ThreadsFeedAdapter {
  /**
   * Collect content models from the current document.
   *
   * @param {Document} [rootDocument=document] - DOM root for extraction.
   * @returns {ContentModel[]}
   */
  collectContentModels(rootDocument = document) {
    if (!rootDocument || typeof rootDocument.querySelectorAll !== 'function') {
      return [];
    }

    const postPermalinkLinks = rootDocument.querySelectorAll('a[href*="/@"][href*="/post/"]');
    const uniquePermalinkCount = this.#countUniquePermalinksFromLinks(postPermalinkLinks);
    let postContainerMap = this.#collectPostContainersFromPermalinks(postPermalinkLinks, {
      preferNearestContainer: false,
    });
    if (uniquePermalinkCount > 1 && postContainerMap.size <= 1) {
      const nearestContainerMap = this.#collectPostContainersFromPermalinks(postPermalinkLinks, {
        preferNearestContainer: true,
      });
      if (nearestContainerMap.size > postContainerMap.size) {
        postContainerMap = nearestContainerMap;
      }
    }

    const models = [];
    const modeledElements = new Set();
    for (const [postContainer, primaryPermalinkLink] of postContainerMap) {
      const model = this.#buildModelFromPostContainer(postContainer, primaryPermalinkLink);
      if (model) {
        models.push(model);
        if (model.element) {
          modeledElements.add(model.element);
        }
      }
    }

    const suggestedFollowContainers = this.#collectSuggestedFollowContainers(rootDocument);
    for (const suggestedFollowContainer of suggestedFollowContainers) {
      if (modeledElements.has(suggestedFollowContainer)) {
        continue;
      }

      const model = this.#buildModelFromSuggestedFollowContainer(suggestedFollowContainer);
      if (!model) {
        continue;
      }

      models.push(model);
      if (model.element) {
        modeledElements.add(model.element);
      }
    }

    return models;
  }

  /**
   * Collect canonical container candidates keyed by resolved post row element.
   *
   * @param {NodeListOf<HTMLAnchorElement>} postPermalinkLinks - Candidate permalink anchors.
   * @param {{ preferNearestContainer?: boolean }} [options] - Container-resolution options.
   * @returns {Map<HTMLElement, HTMLAnchorElement>}
   */
  #collectPostContainersFromPermalinks(postPermalinkLinks, options = {}) {
    const preferNearestContainer = options.preferNearestContainer === true;
    const postContainerMap = new Map();

    for (const permalinkLink of postPermalinkLinks) {
      const href = String(permalinkLink.getAttribute('href') || '');
      if (!this.#isPostPermalink(href)) {
        continue;
      }

      const postContainer = this.#resolvePostContainer(permalinkLink, { preferNearestContainer });
      if (!postContainer || postContainerMap.has(postContainer)) {
        continue;
      }

      postContainerMap.set(postContainer, permalinkLink);
    }

    return postContainerMap;
  }

  /**
   * Count unique post permalinks from one anchor collection.
   *
   * @param {NodeListOf<HTMLAnchorElement>} permalinkLinks - Candidate permalink anchors.
   * @returns {number}
   */
  #countUniquePermalinksFromLinks(permalinkLinks) {
    const uniquePermalinks = new Set();
    for (const permalinkLink of permalinkLinks) {
      const href = String(permalinkLink.getAttribute('href') || '');
      const match = href.match(POST_PERMALINK_PATTERN);
      if (!match || !match[1] || !match[2]) {
        continue;
      }

      uniquePermalinks.add(`${match[1].toLowerCase()}/${match[2]}`);
    }

    return uniquePermalinks.size;
  }

  /**
   * Build canonical model from one resolved post container.
   *
   * @param {HTMLElement} postContainer - Threads post container.
   * @param {HTMLAnchorElement} primaryPermalinkLink - Canonical permalink source.
   * @returns {ContentModel|null}
   */
  #buildModelFromPostContainer(postContainer, primaryPermalinkLink) {
    if (!postContainer) {
      return null;
    }

    const canonicalPermalinkLinks = this.#collectCanonicalPostPermalinkLinks(postContainer);
    const resolvedPrimaryPermalinkLink = canonicalPermalinkLinks[0] || primaryPermalinkLink || null;
    const postCode = this.#extractPostCodeFromHref(
      String(
        resolvedPrimaryPermalinkLink ? resolvedPrimaryPermalinkLink.getAttribute('href') || '' : ''
      )
    );
    const postCodes = this.#extractPostCodesFromPermalinkLinks(canonicalPermalinkLinks);
    const postHandles = this.#extractPostHandlesFromPermalinkLinks(canonicalPermalinkLinks);
    const authorHandle = this.#extractAuthorHandle(
      postContainer,
      resolvedPrimaryPermalinkLink,
      postHandles
    );
    const verifiedPostHandles = this.#extractVerifiedPostHandlesFromPermalinkLinks(
      postContainer,
      canonicalPermalinkLinks
    );
    const displayName = this.#extractDisplayName(postContainer, authorHandle);
    const text = this.#extractPostText(postContainer);
    const trendingTopics = this.#extractTrendingTopics(postContainer);
    const isVerified = verifiedPostHandles.includes(authorHandle);
    const hasBlueCheck = this.#detectBlueCheck(postContainer, authorHandle);

    return new ContentModel({
      element: postContainer,
      postCode,
      postCodes,
      authorHandle,
      postHandles,
      verifiedPostHandles,
      displayName,
      text,
      trendingTopics,
      isTrending: trendingTopics.length > 0,
      isVerified,
      hasBlueCheck,
    });
  }

  /**
   * Collect suggestion-module containers from explicit "Suggested for you" markers.
   *
   * @param {Document} rootDocument - DOM root for extraction.
   * @returns {HTMLElement[]}
   */
  #collectSuggestedFollowContainers(rootDocument) {
    const markerElements = this.#collectSuggestedForYouMarkers(rootDocument);
    const uniqueContainers = new Set();
    for (const markerElement of markerElements) {
      const suggestedFollowContainer = this.#resolveSuggestedFollowContainer(markerElement);
      if (suggestedFollowContainer) {
        uniqueContainers.add(suggestedFollowContainer);
      }
    }

    return Array.from(uniqueContainers);
  }

  /**
   * Collect text nodes that exactly match the "Suggested for you" heading.
   *
   * @param {Document} rootDocument - DOM root for extraction.
   * @returns {HTMLElement[]}
   */
  #collectSuggestedForYouMarkers(rootDocument) {
    const markerElements = rootDocument.querySelectorAll(SUGGESTED_MARKER_SELECTOR);
    return Array.from(markerElements).filter((markerElement) =>
      this.#isExactSuggestedForYouText(markerElement.textContent)
    );
  }

  /**
   * Resolve nearest suggestion-module container by climbing from heading marker.
   *
   * @param {HTMLElement} startElement - Heading marker element.
   * @returns {HTMLElement|null}
   */
  #resolveSuggestedFollowContainer(startElement) {
    let currentElement = startElement;
    let depth = 0;
    let resolvedContainer = null;

    while (currentElement && depth <= 10) {
      if (
        this.#isLikelySuggestedFollowContainer(currentElement) &&
        !this.#isDisallowedContainerTag(currentElement.tagName)
      ) {
        resolvedContainer = currentElement;
      }

      currentElement = currentElement.parentElement;
      depth += 1;
    }

    return resolvedContainer;
  }

  /**
   * Build canonical model for one "Suggested for you" follow module.
   *
   * @param {HTMLElement} suggestedFollowContainer - Suggested-follow module container.
   * @returns {ContentModel|null}
   */
  #buildModelFromSuggestedFollowContainer(suggestedFollowContainer) {
    if (!suggestedFollowContainer) {
      return null;
    }

    return new ContentModel({
      element: suggestedFollowContainer,
      displayName: 'Suggested for you',
      text: this.#extractPostText(suggestedFollowContainer),
      isSuggestedFollow: true,
    });
  }

  /**
   * Resolve nearest post container from permalink anchor by structure checks.
   *
   * @param {HTMLElement} startElement - Candidate permalink anchor.
   * @param {{ preferNearestContainer?: boolean }} [options] - Container-resolution options.
   * @returns {HTMLElement|null}
   */
  #resolvePostContainer(startElement, options = {}) {
    const preferNearestContainer = options.preferNearestContainer === true;
    let currentElement = startElement;
    let depth = 0;
    let resolvedContainer = null;

    while (currentElement && depth <= 18) {
      if (
        this.#isLikelyPostContainer(currentElement) &&
        !this.#isDisallowedContainerTag(currentElement.tagName)
      ) {
        if (preferNearestContainer) {
          return currentElement;
        }

        resolvedContainer = currentElement;
      }

      currentElement = currentElement.parentElement;
      depth += 1;
    }

    return resolvedContainer;
  }

  /**
   * Reject document-level tags that are too broad for one feed item.
   *
   * @param {string} tagName - Candidate element tag name.
   * @returns {boolean}
   */
  #isDisallowedContainerTag(tagName) {
    return ['BODY', 'HTML', 'MAIN'].includes(String(tagName || '').toUpperCase());
  }

  /**
   * Validate whether an element behaves like one post container.
   *
   * @param {HTMLElement} element - Candidate container.
   * @returns {boolean}
   */
  #isLikelyPostContainer(element) {
    if (!element || typeof element.querySelectorAll !== 'function') {
      return false;
    }

    if (this.#containsTimelineChrome(element)) {
      return false;
    }

    if (this.#isDirectChildOfTimelineChromeShell(element)) {
      return false;
    }

    const uniquePermalinkCount = this.#countUniquePostPermalinks(element);
    if (uniquePermalinkCount === 0 || uniquePermalinkCount > 4) {
      return false;
    }

    if (this.#countActionButtons(element) < 3) {
      return false;
    }

    return this.#collectProfileLinks(element).length > 0;
  }

  /**
   * Validate whether an element behaves like one "Suggested for you" module.
   *
   * @param {HTMLElement} element - Candidate suggestion container.
   * @returns {boolean}
   */
  #isLikelySuggestedFollowContainer(element) {
    if (!element || typeof element.querySelectorAll !== 'function') {
      return false;
    }

    if (this.#containsTimelineChrome(element)) {
      return false;
    }

    const normalizedText = this.#normalizeText(element.textContent || '');
    if (!normalizedText.includes(SUGGESTED_FOR_YOU_TEXT)) {
      return false;
    }

    if (this.#countSuggestedForYouMarkers(element) === 0) {
      return false;
    }

    if (this.#countUniquePostPermalinks(element) !== 0) {
      return false;
    }

    if (this.#countActionButtons(element) > 0) {
      return false;
    }

    const controls = this.#countFollowAndCloseControls(element);
    if (controls.followCount < 2 || controls.closeCount < 2) {
      return false;
    }

    return this.#collectProfileLinks(element).length >= 2;
  }

  /**
   * Reject feed-shell containers that include top-level timeline navigation chrome.
   *
   * @param {HTMLElement} element - Candidate container.
   * @returns {boolean}
   */
  #containsTimelineChrome(element) {
    return (
      typeof element.querySelector === 'function' &&
      Boolean(element.querySelector(TIMELINE_CHROME_LINK_SELECTOR))
    );
  }

  /**
   * Reject feed-body wrappers under timeline tab chrome when only one post is loaded.
   *
   * @param {HTMLElement} element - Candidate container.
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

    const parentPermalinkCount = parentElement.querySelectorAll(
      'a[href*="/@"][href*="/post/"]'
    ).length;
    return parentPermalinkCount <= 1;
  }

  /**
   * Count distinct post permalinks in one subtree to avoid media-link inflation.
   *
   * @param {HTMLElement} element - Candidate container.
   * @returns {number}
   */
  #countUniquePostPermalinks(element) {
    const uniquePermalinks = new Set();
    const permalinkLinks = element.querySelectorAll('a[href*="/@"][href*="/post/"]');

    for (const permalinkLink of permalinkLinks) {
      const href = String(permalinkLink.getAttribute('href') || '');
      const match = href.match(POST_PERMALINK_PATTERN);
      if (!match || !match[1] || !match[2]) {
        continue;
      }

      uniquePermalinks.add(`${match[1]}/${match[2]}`);
    }

    return uniquePermalinks.size;
  }

  /**
   * Collect canonical permalink anchors for one post row without media-link duplicates.
   *
   * @param {HTMLElement} postContainer - Candidate post container.
   * @returns {HTMLAnchorElement[]}
   */
  #collectCanonicalPostPermalinkLinks(postContainer) {
    const permalinkLinks = postContainer.querySelectorAll('a[href*="/@"][href*="/post/"]');
    const canonicalLinkMap = new Map();
    for (const permalinkLink of permalinkLinks) {
      const href = String(permalinkLink.getAttribute('href') || '');
      const match = href.match(POST_PERMALINK_PATTERN);
      if (!match || !match[1] || !match[2]) {
        continue;
      }

      const canonicalKey = `${match[1].toLowerCase()}/${match[2]}`;
      if (!canonicalLinkMap.has(canonicalKey)) {
        canonicalLinkMap.set(canonicalKey, permalinkLink);
      }
    }

    return Array.from(canonicalLinkMap.values());
  }

  /**
   * Extract unique post handles from canonical post permalink anchors.
   *
   * @param {HTMLAnchorElement[]} permalinkLinks - Canonical post permalink anchors.
   * @returns {string[]}
   */
  #extractPostHandlesFromPermalinkLinks(permalinkLinks) {
    const uniqueHandles = new Set();
    for (const permalinkLink of permalinkLinks) {
      const handle = this.#extractHandleFromHref(String(permalinkLink.getAttribute('href') || ''));
      if (handle) {
        uniqueHandles.add(handle);
      }
    }

    return Array.from(uniqueHandles);
  }

  /**
   * Extract unique post codes from canonical post permalink anchors.
   *
   * @param {HTMLAnchorElement[]} permalinkLinks - Canonical post permalink anchors.
   * @returns {string[]}
   */
  #extractPostCodesFromPermalinkLinks(permalinkLinks) {
    const uniqueCodes = new Set();
    for (const permalinkLink of permalinkLinks) {
      const postCode = this.#extractPostCodeFromHref(
        String(permalinkLink.getAttribute('href') || '')
      );
      if (postCode) {
        uniqueCodes.add(postCode);
      }
    }

    return Array.from(uniqueCodes);
  }

  /**
   * Extract normalized trending topics linked to one timeline row.
   *
   * @param {HTMLElement} postContainer - Candidate post container.
   * @returns {string[]}
   */
  #extractTrendingTopics(postContainer) {
    if (!postContainer || typeof postContainer.querySelectorAll !== 'function') {
      return [];
    }

    const topicLinks = postContainer.querySelectorAll(TRENDING_TOPIC_LINK_SELECTOR);
    const normalizedTopics = [];
    const seenTopics = new Set();
    for (const topicLink of topicLinks) {
      const topicLabel = this.#resolveTrendingTopicFromLink(topicLink);
      if (!topicLabel || seenTopics.has(topicLabel)) {
        continue;
      }

      normalizedTopics.push(topicLabel);
      seenTopics.add(topicLabel);
    }

    return normalizedTopics;
  }

  /**
   * Resolve one trending-topic label from timely-topic link href and text.
   *
   * @param {HTMLAnchorElement} topicLink - Candidate trending-topic anchor.
   * @returns {string}
   */
  #resolveTrendingTopicFromLink(topicLink) {
    if (!topicLink) {
      return '';
    }

    const href = String(topicLink.getAttribute('href') || '');
    const hrefTopic = this.#extractTopicFromHref(href);
    if (hrefTopic) {
      return hrefTopic;
    }

    const normalizedText = String(topicLink.textContent || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(HIGHLIGHT_PREFIX_PATTERN, '')
      .replace(TRENDING_PREFIX_PATTERN, '')
      .trim()
      .toLowerCase();
    return normalizedText;
  }

  /**
   * Extract timely-topic query value from one URL-like href.
   *
   * @param {string} href - Candidate topic href.
   * @returns {string}
   */
  #extractTopicFromHref(href) {
    if (!href) {
      return '';
    }

    try {
      const normalizedUrl = new URL(href, 'https://www.threads.com');
      const topicValue = String(normalizedUrl.searchParams.get('q') || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      return topicValue;
    } catch (_error) {
      return '';
    }
  }

  /**
   * Extract verified handles represented by canonical permalink anchors in one row.
   *
   * @param {HTMLElement} postContainer - Candidate post container.
   * @param {HTMLAnchorElement[]} permalinkLinks - Canonical post permalink anchors.
   * @returns {string[]}
   */
  #extractVerifiedPostHandlesFromPermalinkLinks(postContainer, permalinkLinks) {
    const verifiedHandles = new Set();
    for (const permalinkLink of permalinkLinks) {
      const handle = this.#extractHandleFromHref(String(permalinkLink.getAttribute('href') || ''));
      if (!handle) {
        continue;
      }

      if (this.#detectVerifiedBadgeNearPermalinkLink(postContainer, permalinkLink)) {
        verifiedHandles.add(handle);
      }
    }

    return Array.from(verifiedHandles);
  }

  /**
   * Count distinct action controls found inside one candidate post container.
   *
   * @param {HTMLElement} postContainer - Candidate post container.
   * @returns {number}
   */
  #countActionButtons(postContainer) {
    const actionKinds = new Set();
    const actionButtons = postContainer.querySelectorAll('button, [role="button"]');

    for (const actionButton of actionButtons) {
      const actionLabel = String(
        actionButton.getAttribute('aria-label') || actionButton.textContent || ''
      )
        .trim()
        .replace(/\s+/g, ' ');
      for (const actionPrefix of POST_ACTION_PREFIXES) {
        if (actionLabel.startsWith(actionPrefix)) {
          actionKinds.add(actionPrefix);
        }
      }
    }

    return actionKinds.size;
  }

  /**
   * Count exact "Suggested for you" heading markers inside one subtree.
   *
   * @param {HTMLElement} element - Candidate container.
   * @returns {number}
   */
  #countSuggestedForYouMarkers(element) {
    const markerElements = element.querySelectorAll(SUGGESTED_MARKER_SELECTOR);
    let count = 0;
    for (const markerElement of markerElements) {
      if (this.#isExactSuggestedForYouText(markerElement.textContent)) {
        count += 1;
      }
    }

    return count;
  }

  /**
   * Count follow and close controls used by suggestion modules.
   *
   * @param {HTMLElement} element - Candidate container.
   * @returns {{ followCount: number, closeCount: number }}
   */
  #countFollowAndCloseControls(element) {
    const controls = element.querySelectorAll(CONTROL_SELECTOR);
    let followCount = 0;
    let closeCount = 0;
    for (const control of controls) {
      const textLabel = this.#normalizeText(control.textContent || '');
      const ariaLabel = this.#normalizeText(control.getAttribute('aria-label') || '');
      if (textLabel === 'follow' || ariaLabel === 'follow') {
        followCount += 1;
      }
      if (textLabel === 'close' || ariaLabel === 'close') {
        closeCount += 1;
      }
    }

    return {
      followCount,
      closeCount,
    };
  }

  /**
   * Identify profile links likely to represent account handles.
   *
   * @param {HTMLElement} postContainer - Candidate post container.
   * @returns {HTMLAnchorElement[]}
   */
  #collectProfileLinks(postContainer) {
    const profileLinks = [];
    const links = postContainer.querySelectorAll('a[href*="/@"]');

    for (const link of links) {
      const href = String(link.getAttribute('href') || '');
      if (href.includes('/post/')) {
        continue;
      }

      if (this.#extractHandleFromHref(href)) {
        profileLinks.push(link);
      }
    }

    return profileLinks;
  }

  /**
   * Extract canonical handle from one URL-like href value.
   *
   * @param {string} href - Candidate profile or permalink href.
   * @returns {string}
   */
  #extractHandleFromHref(href) {
    const match = href.match(PROFILE_LINK_PATTERN);
    return match && match[1] ? match[1] : '';
  }

  /**
   * Compare candidate text against exact suggested-follow heading content.
   *
   * @param {unknown} value - Candidate text value.
   * @returns {boolean}
   */
  #isExactSuggestedForYouText(value) {
    return this.#normalizeText(value) === SUGGESTED_FOR_YOU_TEXT;
  }

  /**
   * Normalize free-form text for consistent case-insensitive matching.
   *
   * @param {unknown} value - Candidate text value.
   * @returns {string}
   */
  #normalizeText(value) {
    return String(value === null || value === undefined ? '' : value)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * Validate whether href matches post permalink pattern.
   *
   * @param {string} href - Candidate href.
   * @returns {boolean}
   */
  #isPostPermalink(href) {
    return POST_PERMALINK_PATTERN.test(href);
  }

  /**
   * Extract post code segment from canonical post permalink.
   *
   * @param {string} href - Candidate post permalink.
   * @returns {string}
   */
  #extractPostCodeFromHref(href) {
    const match = href.match(POST_PERMALINK_PATTERN);
    return match && match[2] ? match[2] : '';
  }

  /**
   * Extract canonical author handle from permalink or profile links.
   *
   * @param {HTMLElement} postContainer - Threads post container.
   * @param {HTMLAnchorElement} primaryPermalinkLink - Canonical permalink source.
   * @param {string[]} [postHandles=[]] - Candidate handles extracted from post permalinks.
   * @returns {string}
   */
  #extractAuthorHandle(postContainer, primaryPermalinkLink, postHandles = []) {
    const permalinkHandle = this.#extractHandleFromHref(
      String(primaryPermalinkLink ? primaryPermalinkLink.getAttribute('href') || '' : '')
    );
    if (permalinkHandle) {
      return permalinkHandle;
    }

    const profileLinks = this.#collectProfileLinks(postContainer);
    for (const profileLink of profileLinks) {
      const handle = this.#extractHandleFromHref(String(profileLink.getAttribute('href') || ''));
      if (handle) {
        return handle;
      }
    }

    if (Array.isArray(postHandles) && postHandles.length > 0) {
      return String(postHandles[0] || '');
    }

    return '';
  }

  /**
   * Extract display name from profile link text nearest to author handle.
   *
   * @param {HTMLElement} postContainer - Threads post container.
   * @param {string} authorHandle - Canonical author handle.
   * @returns {string}
   */
  #extractDisplayName(postContainer, authorHandle) {
    const profileLinks = this.#collectProfileLinks(postContainer);
    for (const profileLink of profileLinks) {
      const linkHandle = this.#extractHandleFromHref(
        String(profileLink.getAttribute('href') || '')
      );
      if (authorHandle && linkHandle && linkHandle !== authorHandle) {
        continue;
      }

      const textValue = String(profileLink.textContent || '').trim();
      if (textValue) {
        return textValue;
      }
    }

    return '';
  }

  /**
   * Extract post body text used by phrase and regex filters.
   *
   * @param {HTMLElement} postContainer - Threads post container.
   * @returns {string}
   */
  #extractPostText(postContainer) {
    return String(postContainer.innerText || postContainer.textContent || '').trim();
  }

  /**
   * Detect verified badge in author neighborhood using robust badge signatures.
   *
   * @param {HTMLElement} postContainer - Threads post container.
   * @param {string} authorHandle - Canonical author handle.
   * @returns {boolean}
   */
  #detectVerifiedBadge(postContainer, authorHandle) {
    const authorProfileLink = this.#findAuthorProfileLink(postContainer, authorHandle);
    if (authorProfileLink) {
      return this.#detectVerifiedBadgeNearPermalinkLink(postContainer, authorProfileLink);
    }

    return this.#containsVerifiedBadge(postContainer);
  }

  /**
   * Detect verified badge in one permalink/header neighborhood without crossing feed-level shells.
   *
   * @param {HTMLElement} postContainer - Threads post container.
   * @param {HTMLElement} permalinkOrProfileLink - Anchor near candidate author identity.
   * @returns {boolean}
   */
  #detectVerifiedBadgeNearPermalinkLink(postContainer, permalinkOrProfileLink) {
    let currentElement = permalinkOrProfileLink;
    let depth = 0;
    while (currentElement && depth <= 5) {
      const isFeedLevelContainer = this.#countActionButtons(currentElement) >= 3;
      if (!isFeedLevelContainer && this.#containsVerifiedBadge(currentElement)) {
        return true;
      }

      if (currentElement === postContainer) {
        break;
      }

      currentElement = currentElement.parentElement;
      depth += 1;
    }

    return false;
  }

  /**
   * Locate profile link corresponding to canonical author handle.
   *
   * @param {HTMLElement} postContainer - Threads post container.
   * @param {string} authorHandle - Canonical author handle.
   * @returns {HTMLAnchorElement|null}
   */
  #findAuthorProfileLink(postContainer, authorHandle) {
    const profileLinks = this.#collectProfileLinks(postContainer);
    if (profileLinks.length === 0) {
      return null;
    }

    const preferredTextLink = (candidateLinks) => {
      for (const candidateLink of candidateLinks) {
        if (String(candidateLink.textContent || '').trim()) {
          return candidateLink;
        }
      }

      return candidateLinks[0];
    };

    if (!authorHandle) {
      return preferredTextLink(profileLinks);
    }

    const matchingLinks = profileLinks.filter((profileLink) => {
      const href = String(profileLink.getAttribute('href') || '');
      return this.#extractHandleFromHref(href) === authorHandle;
    });

    if (matchingLinks.length > 0) {
      return preferredTextLink(matchingLinks);
    }

    return preferredTextLink(profileLinks);
  }

  /**
   * Apply layered verified badge detection inside one DOM subtree.
   *
   * @param {HTMLElement} rootElement - Search root.
   * @returns {boolean}
   */
  #containsVerifiedBadge(rootElement) {
    return containsVerifiedBadge(rootElement);
  }

  /**
   * Detect blue-check signal using same accessibility hints until richer selectors exist.
   *
   * @param {HTMLElement} postContainer - Threads post container.
   * @param {string} authorHandle - Canonical author handle.
   * @returns {boolean}
   */
  #detectBlueCheck(postContainer, authorHandle) {
    return this.#detectVerifiedBadge(postContainer, authorHandle);
  }
}

module.exports = {
  ThreadsFeedAdapter,
};
