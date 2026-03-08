/**
 * @file Render and persist an in-page settings menu for filter controls.
 */

const { whenBodyReady } = require('../dom/body-ready');
const { ABOUT_ICON_DATA_URI } = require('../res/about-icon-data-uri');
const { normalizeHandle, normalizeTopic } = require('../storage/settings-schema');
const { version: packageVersion } = require('../../package.json');

const IDS = {
  root: 'btf-settings-modal-root',
  style: 'btf-settings-modal-style',
  form: 'btf-settings-form',
  status: 'btf-settings-status',
  footerActions: 'btf-settings-footer-actions',
  cleanActions: 'btf-settings-clean-actions',
  dirtyActions: 'btf-settings-dirty-actions',
  aboutTrigger: 'btf-settings-about-trigger',
  verifiedToggle: 'btf-settings-verified-enabled',
  verifiedBadgeToggle: 'btf-settings-verified-badge-enabled',
  verifiedWhitelistList: 'btf-settings-verified-whitelist-list',
  aiLabelToggle: 'btf-settings-ai-label-enabled',
  suggestedFollowToggle: 'btf-settings-suggested-follow-enabled',
  trendingHideAllToggle: 'btf-settings-trending-hide-all-enabled',
  trendingTopicList: 'btf-settings-trending-topic-list',
  phraseList: 'btf-settings-phrase-list',
  userList: 'btf-settings-user-list',
  editorModal: 'btf-settings-editor-modal',
  editorForm: 'btf-settings-editor-form',
  editorSuggestionOverlay: 'btf-settings-editor-suggestion-overlay',
  editorTitle: 'btf-settings-editor-title',
  editorSubtitle: 'btf-settings-editor-subtitle',
  editorInput: 'btf-settings-editor-input',
  editorSuggestionList: 'btf-settings-editor-suggestion-list',
  editorRegexRow: 'btf-settings-editor-regex-row',
  editorRegexToggle: 'btf-settings-editor-regex-toggle',
  editorNotInterestedRow: 'btf-settings-editor-not-interested-row',
  editorNotInterestedLabel: 'btf-settings-editor-not-interested-label',
  editorNotInterestedToggle: 'btf-settings-editor-not-interested-toggle',
  editorStatus: 'btf-settings-editor-status',
  editorSubmit: 'btf-settings-editor-submit',
  editorCleanActions: 'btf-settings-editor-clean-actions',
  editorDirtyActions: 'btf-settings-editor-dirty-actions',
  editorDelete: 'btf-settings-editor-delete',
  confirmModal: 'btf-settings-confirm-modal',
  confirmMessage: 'btf-settings-confirm-message',
  aboutModal: 'btf-settings-about-modal',
};
const OPEN_CLASS = 'btf-settings-open';

const ACTIONS = {
  close: 'close',
  discardClose: 'discard-close',
  saveClose: 'save-close',
  openAbout: 'open-about',
  closeAbout: 'close-about',
  openPhraseEditor: 'open-phrase-editor',
  openUserEditor: 'open-user-editor',
  openVerifiedWhitelistEditor: 'open-verified-whitelist-editor',
  openTrendingTopicEditor: 'open-trending-topic-editor',
  phraseChip: 'phrase-chip',
  userChip: 'user-chip',
  verifiedWhitelistChip: 'verified-whitelist-chip',
  trendingTopicChip: 'trending-topic-chip',
  editorSuggestionPick: 'editor-suggestion-pick',
  editorCancel: 'editor-cancel',
  editorDelete: 'editor-delete',
  confirmCancel: 'confirm-cancel',
  confirmAccept: 'confirm-accept',
};

const USERNAME_SUGGESTION_DEBOUNCE_MS = 180;
const EDITOR_INPUT_NAME_PREFIX = 'btf-entry-token';
const SETTINGS_MENU_TITLE = `Bobbin v${String(packageVersion || '0.0.0').trim() || '0.0.0'}`;
const BOBBIN_GITHUB_URL = 'https://github.com/Artificial-Sweetener/bobbin-threads-filter';
const MAINTAINER_THREADS_URL = 'https://www.threads.net/@artificialsweetener.ai';
const MAINTAINER_WEBSITE_URL = 'https://artificialsweetener.ai';
const FACEBOOK_CLEAN_MY_FEEDS_REPO_URL =
  'https://github.com/Artificial-Sweetener/facebook-clean-my-feeds';

/**
 * Normalize comma-separated text into unique values.
 *
 * @param {unknown} value - Raw delimited text.
 * @returns {string[]}
 */
function splitCommaSeparatedList(value) {
  const tokens = String(value === null || value === undefined ? '' : value)
    .split(/[\n,]/g)
    .map((token) => token.trim())
    .filter(Boolean);
  return Array.from(new Set(tokens));
}

/**
 * Build comma-separated display text from values.
 *
 * @param {unknown} value - Candidate list value.
 * @returns {string}
 */
function joinCommaSeparatedList(value) {
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((entry) => String(entry === null || entry === undefined ? '' : entry).trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Normalize one phrase entry for draft storage.
 *
 * @param {unknown} pattern - Candidate phrase text.
 * @param {boolean} isRegex - Regex-mode flag.
 * @returns {{ pattern: string, isRegex: boolean } | null}
 */
function normalizePhraseEntry(pattern, isRegex) {
  const normalizedPattern = String(pattern === null || pattern === undefined ? '' : pattern).trim();
  if (!normalizedPattern) {
    return null;
  }

  return {
    pattern: normalizedPattern,
    isRegex: Boolean(isRegex),
  };
}

/**
 * Build one stable phrase-entry key for mode-aware not-interested toggles.
 *
 * @param {string} pattern - Normalized phrase or regex pattern.
 * @param {boolean} isRegex - Regex-mode flag.
 * @returns {string}
 */
function buildPhraseEntryKey(pattern, isRegex) {
  return `${isRegex ? 'regex' : 'text'}:${String(pattern || '').trim()}`;
}

/**
 * Deduplicate phrase entries while preserving order.
 *
 * @param {Array<{ pattern: string, isRegex: boolean }>} entries - Candidate entries.
 * @returns {Array<{ pattern: string, isRegex: boolean }>}
 */
function dedupePhraseEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const nextEntries = [];
  const seenKeys = new Set();
  for (const entry of entries) {
    const normalized = normalizePhraseEntry(
      entry && typeof entry === 'object' ? entry.pattern : '',
      entry && typeof entry === 'object' && entry.isRegex === true
    );
    if (!normalized) {
      continue;
    }

    const key = `${normalized.isRegex ? 'regex' : 'text'}:${normalized.pattern}`;
    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    nextEntries.push(normalized);
  }

  return nextEntries;
}

/**
 * Resolve not-interested entry keys from normalized and legacy settings shapes.
 *
 * @param {unknown} settings - Candidate settings snapshot.
 * @param {Array<{ pattern: string, isRegex: boolean }>} phraseEntries - Current phrase entries.
 * @returns {Set<string>}
 */
function resolvePhraseNotInterestedKeys(settings, phraseEntries) {
  const phraseNotInterestedSettings =
    settings &&
    typeof settings === 'object' &&
    settings.filters &&
    settings.filters.phrase &&
    settings.filters.phrase.notInterested &&
    typeof settings.filters.phrase.notInterested === 'object'
      ? settings.filters.phrase.notInterested
      : {};

  const enabledKeys = new Set();
  const enabledEntries = Array.isArray(phraseNotInterestedSettings.enabledEntries)
    ? phraseNotInterestedSettings.enabledEntries
    : [];
  for (const entry of enabledEntries) {
    const normalizedEntry = normalizePhraseEntry(
      entry && typeof entry === 'object' ? entry.pattern : '',
      entry && typeof entry === 'object' && entry.isRegex === true
    );
    if (!normalizedEntry) {
      continue;
    }

    enabledKeys.add(buildPhraseEntryKey(normalizedEntry.pattern, normalizedEntry.isRegex));
  }

  const legacyEnabledPatterns = new Set(
    Array.isArray(phraseNotInterestedSettings.enabledPatterns)
      ? phraseNotInterestedSettings.enabledPatterns
          .map((pattern) => String(pattern === null || pattern === undefined ? '' : pattern).trim())
          .filter(Boolean)
      : []
  );
  for (const entry of phraseEntries) {
    if (!legacyEnabledPatterns.has(entry.pattern)) {
      continue;
    }

    enabledKeys.add(buildPhraseEntryKey(entry.pattern, entry.isRegex));
  }

  return enabledKeys;
}

/**
 * Deduplicate username handles while preserving order.
 *
 * @param {unknown} value - Candidate handles.
 * @returns {string[]}
 */
function dedupeHandles(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const nextHandles = [];
  const seenHandles = new Set();
  for (const item of value) {
    const normalizedHandle = normalizeHandle(item);
    if (!normalizedHandle || seenHandles.has(normalizedHandle)) {
      continue;
    }

    seenHandles.add(normalizedHandle);
    nextHandles.push(normalizedHandle);
  }

  return nextHandles;
}

/**
 * Deduplicate trending topics while preserving order.
 *
 * @param {unknown} value - Candidate topic values.
 * @returns {string[]}
 */
function dedupeTrendingTopics(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const nextTopics = [];
  const seenTopics = new Set();
  for (const item of value) {
    const normalizedTopic = normalizeTopic(item);
    if (!normalizedTopic || seenTopics.has(normalizedTopic)) {
      continue;
    }

    seenTopics.add(normalizedTopic);
    nextTopics.push(normalizedTopic);
  }

  return nextTopics;
}

/**
 * Resolve username handles enabled for not-interested signaling.
 *
 * @param {unknown} settings - Candidate settings snapshot.
 * @param {string[]} blockedHandles - Current blocked-handle draft list.
 * @returns {Set<string>}
 */
function resolveUserNotInterestedHandles(settings, blockedHandles) {
  const usernameNotInterestedSettings =
    settings &&
    typeof settings === 'object' &&
    settings.filters &&
    settings.filters.username &&
    settings.filters.username.notInterested &&
    typeof settings.filters.username.notInterested === 'object'
      ? settings.filters.username.notInterested
      : {};
  const blockedHandleSet = new Set(dedupeHandles(blockedHandles));
  return new Set(
    dedupeHandles(usernameNotInterestedSettings.enabledHandles).filter((handle) =>
      blockedHandleSet.has(handle)
    )
  );
}

/**
 * Resolve trending topics enabled for not-interested signaling.
 *
 * @param {unknown} settings - Candidate settings snapshot.
 * @param {string[]} blockedTopics - Current blocked-topic draft list.
 * @returns {Set<string>}
 */
function resolveTrendingNotInterestedTopics(settings, blockedTopics) {
  const trendingNotInterestedSettings =
    settings &&
    typeof settings === 'object' &&
    settings.filters &&
    settings.filters.trending &&
    settings.filters.trending.notInterested &&
    typeof settings.filters.trending.notInterested === 'object'
      ? settings.filters.trending.notInterested
      : {};
  const blockedTopicSet = new Set(dedupeTrendingTopics(blockedTopics));
  return new Set(
    dedupeTrendingTopics(trendingNotInterestedSettings.enabledTopics).filter((topic) =>
      blockedTopicSet.has(topic)
    )
  );
}

/**
 * Resolve phrase entries from normalized and legacy settings shapes.
 *
 * @param {unknown} settings - Candidate settings snapshot.
 * @returns {Array<{ pattern: string, isRegex: boolean }>}
 */
function resolvePhraseEntries(settings) {
  const phraseSettings =
    settings &&
    typeof settings === 'object' &&
    settings.filters &&
    settings.filters.phrase &&
    typeof settings.filters.phrase === 'object'
      ? settings.filters.phrase
      : {};

  if (Array.isArray(phraseSettings.entries)) {
    return dedupePhraseEntries(phraseSettings.entries);
  }

  const legacyPatterns = Array.isArray(phraseSettings.patterns) ? phraseSettings.patterns : [];
  const legacyRegexMode = phraseSettings.useRegex === true;
  return dedupePhraseEntries(
    legacyPatterns.map((pattern) => normalizePhraseEntry(pattern, legacyRegexMode)).filter(Boolean)
  );
}

/**
 * Build one secure external link element for settings copy.
 *
 * @param {string} label - Visible link label.
 * @param {string} href - Absolute destination URL.
 * @returns {HTMLAnchorElement}
 */
function createExternalLink(label, href) {
  const linkElement = document.createElement('a');
  linkElement.href = href;
  linkElement.target = '_blank';
  linkElement.rel = 'noopener noreferrer';
  linkElement.textContent = label;
  return linkElement;
}

/**
 * Append one paragraph containing inline external link text.
 *
 * @param {HTMLElement} containerElement - Destination paragraph container.
 * @param {{ before: string, linkLabel: string, href: string, after?: string }} options - Segment values.
 */
function appendLinkedParagraph(containerElement, options) {
  const paragraphElement = document.createElement('p');
  paragraphElement.className = 'btf-about-copy-line';
  paragraphElement.appendChild(document.createTextNode(options.before));
  paragraphElement.appendChild(createExternalLink(options.linkLabel, options.href));
  if (options.after) {
    paragraphElement.appendChild(document.createTextNode(options.after));
  }
  containerElement.appendChild(paragraphElement);
}

/**
 * Detect whether Threads currently renders in dark mode.
 *
 * @returns {boolean}
 */
function isThreadsDarkThemeActive() {
  if (typeof document === 'undefined') {
    return true;
  }

  if (document.documentElement?.classList.contains('__fb-dark-mode')) {
    return true;
  }

  const backgroundColor = getComputedStyle(
    document.body || document.documentElement
  ).backgroundColor;
  const components = backgroundColor.match(/\d+/g);
  if (!components || components.length < 3) {
    return true;
  }

  const luminance =
    0.2126 * Number(components[0]) +
    0.7152 * Number(components[1]) +
    0.0722 * Number(components[2]);
  return luminance < 160;
}

/**
 * Keep filter settings editable from userscript command entry.
 */
class ThreadsSettingsMenu {
  /**
   * Initialize menu dependencies and stable event delegates.
   *
   * @param {{
   *   settingsStore: { load: () => Promise<object>, save: (settings: unknown) => Promise<object> },
   *   accountSearchClient?: { searchMentionCandidates?: Function },
   *   onSettingsUpdated?: (settings: object) => void,
   *   onVisibilityChanged?: (isOpen: boolean) => void,
   *   logger?: { info?: Function, warn?: Function, error?: Function }
   * }} options - Menu dependencies.
   */
  constructor(options) {
    this.settingsStore = options.settingsStore;
    this.accountSearchClient =
      options.accountSearchClient &&
      typeof options.accountSearchClient.searchMentionCandidates === 'function'
        ? options.accountSearchClient
        : null;
    this.onSettingsUpdated =
      typeof options.onSettingsUpdated === 'function' ? options.onSettingsUpdated : null;
    this.onVisibilityChanged =
      typeof options.onVisibilityChanged === 'function' ? options.onVisibilityChanged : null;
    this.logger = options.logger || {};

    this.rootElement = null;
    this.formElement = null;
    this.statusElement = null;
    this.footerActionsElement = null;
    this.cleanActionsElement = null;
    this.dirtyActionsElement = null;
    this.verifiedToggleElement = null;
    this.verifiedBadgeToggleElement = null;
    this.verifiedWhitelistListElement = null;
    this.aiLabelToggleElement = null;
    this.suggestedFollowToggleElement = null;
    this.trendingHideAllToggleElement = null;
    this.trendingTopicListElement = null;
    this.phraseListElement = null;
    this.userListElement = null;
    this.aboutModalElement = null;
    this.editorModalElement = null;
    this.editorFormElement = null;
    this.editorSuggestionOverlayElement = null;
    this.editorTitleElement = null;
    this.editorSubtitleElement = null;
    this.editorInputElement = null;
    this.editorSuggestionListElement = null;
    this.editorRegexRowElement = null;
    this.editorRegexToggleElement = null;
    this.editorNotInterestedRowElement = null;
    this.editorNotInterestedLabelElement = null;
    this.editorNotInterestedToggleElement = null;
    this.editorStatusElement = null;
    this.editorSubmitButtonElement = null;
    this.editorCleanActionsElement = null;
    this.editorDirtyActionsElement = null;
    this.editorDeleteButtonElement = null;
    this.confirmModalElement = null;
    this.confirmMessageElement = null;
    this.hostThemeObserver = null;
    this.hostThemeMediaQueryList = null;
    this.pendingThemeRefreshTimeoutId = null;

    this.isOpen = false;
    this.latestSettings = null;
    this.draftPhraseEntries = [];
    this.draftPhraseNotInterestedKeys = new Set();
    this.draftUserHandles = [];
    this.draftUserNotInterestedHandles = new Set();
    this.draftVerifiedWhitelistHandles = [];
    this.draftTrendingTopics = [];
    this.draftTrendingNotInterestedTopics = new Set();
    this.editorState = null;
    this.editorSuggestions = [];
    this.editorSuggestionFocusIndex = -1;
    this.suggestionRequestSequence = 0;
    this.editorInputNameSequence = 0;
    this.editorBaselineSnapshot = '';
    this.editorIsDirty = false;
    this.pendingSuggestionTimeoutId = null;
    this.pendingHandleRemoval = {
      list: '',
      handle: '',
    };
    this.baselineSnapshot = '';
    this.isDirty = false;

    this.handleRootClick = (event) => this.#onRootClick(event);
    this.handleDocumentKeydown = (event) => this.#onDocumentKeydown(event);
    this.handleToggleChange = () => this.#syncDirtyState();
    this.handleFormSubmit = (event) => {
      void this.#saveAndCloseFromForm(event);
    };
    this.handleEditorSubmit = (event) => this.#onEditorSubmit(event);
    this.handleEditorInput = () => {
      this.#onEditorInput();
    };
    this.handleEditorToggleChange = () => {
      this.#syncEditorDirtyState();
    };
    this.handleEditorKeydown = (event) => {
      this.#onEditorKeydown(event);
    };
    this.handleViewportShift = () => {
      this.#syncSuggestionOverlayPosition();
    };
    this.handleThemeMediaQueryChange = () => {
      this.#scheduleThemeRefresh();
    };
  }

  /**
   * Toggle menu visibility from userscript command invocations.
   *
   * @returns {Promise<void>}
   */
  async toggle() {
    if (this.isOpen) {
      this.close();
      return;
    }

    await this.open();
  }

  /**
   * Show menu and hydrate controls from persisted settings.
   *
   * @returns {Promise<void>}
   */
  async open() {
    if (typeof document === 'undefined' || this.isOpen) {
      return;
    }

    await this.#ensureBodyReady();
    this.#ensureStyleTag();
    this.#ensureRootElement();
    this.#applyTheme();
    this.#startHostThemeSync();

    const settings = await this.settingsStore.load();
    this.latestSettings = settings;
    this.#populateForm(settings);
    this.#setStatusMessage('');

    if (!this.rootElement) {
      return;
    }

    this.rootElement.hidden = false;
    this.isOpen = true;
    document.body?.classList.add(OPEN_CLASS);
    this.#emitVisibilityChanged(true);
  }

  /**
   * Hide menu without mutating persisted settings.
   */
  close() {
    if (!this.isOpen || !this.rootElement) {
      return;
    }

    this.#stopHostThemeSync();
    this.#closeEditorModal();
    this.#closeConfirmModal();
    this.#closeAboutModal();
    this.rootElement.hidden = true;
    this.isOpen = false;
    this.#setStatusMessage('');
    document.body?.classList.remove(OPEN_CLASS);
    this.#emitVisibilityChanged(false);
  }

  /**
   * Tear down menu DOM nodes during runtime shutdown.
   */
  destroy() {
    this.close();
    this.#stopHostThemeSync();

    if (this.rootElement && this.rootElement.parentElement) {
      this.rootElement.removeEventListener('click', this.handleRootClick);
      this.formElement?.removeEventListener('submit', this.handleFormSubmit);
      this.editorFormElement?.removeEventListener('submit', this.handleEditorSubmit);
      this.editorInputElement?.removeEventListener('input', this.handleEditorInput);
      this.editorInputElement?.removeEventListener('keydown', this.handleEditorKeydown);
      this.editorRegexToggleElement?.removeEventListener('change', this.handleEditorToggleChange);
      this.editorNotInterestedToggleElement?.removeEventListener(
        'change',
        this.handleEditorToggleChange
      );
      this.verifiedToggleElement?.removeEventListener('change', this.handleToggleChange);
      this.verifiedBadgeToggleElement?.removeEventListener('change', this.handleToggleChange);
      this.suggestedFollowToggleElement?.removeEventListener('change', this.handleToggleChange);
      this.trendingHideAllToggleElement?.removeEventListener('change', this.handleToggleChange);
      this.rootElement.parentElement.removeChild(this.rootElement);
    }

    document.removeEventListener('keydown', this.handleDocumentKeydown);
    window.removeEventListener('resize', this.handleViewportShift);
    window.removeEventListener('scroll', this.handleViewportShift, true);

    const styleElement = document.getElementById(IDS.style);
    if (styleElement?.parentElement) {
      styleElement.parentElement.removeChild(styleElement);
    }

    this.rootElement = null;
    this.formElement = null;
    this.statusElement = null;
    this.footerActionsElement = null;
    this.cleanActionsElement = null;
    this.dirtyActionsElement = null;
    this.verifiedToggleElement = null;
    this.verifiedBadgeToggleElement = null;
    this.verifiedWhitelistListElement = null;
    this.aiLabelToggleElement = null;
    this.suggestedFollowToggleElement = null;
    this.trendingHideAllToggleElement = null;
    this.trendingTopicListElement = null;
    this.phraseListElement = null;
    this.userListElement = null;
    this.aboutModalElement = null;
    this.editorModalElement = null;
    this.editorFormElement = null;
    this.editorSuggestionOverlayElement = null;
    this.editorTitleElement = null;
    this.editorSubtitleElement = null;
    this.editorInputElement = null;
    this.editorSuggestionListElement = null;
    this.editorRegexRowElement = null;
    this.editorRegexToggleElement = null;
    this.editorNotInterestedRowElement = null;
    this.editorNotInterestedLabelElement = null;
    this.editorNotInterestedToggleElement = null;
    this.editorStatusElement = null;
    this.editorSubmitButtonElement = null;
    this.editorCleanActionsElement = null;
    this.editorDirtyActionsElement = null;
    this.editorDeleteButtonElement = null;
    this.confirmModalElement = null;
    this.confirmMessageElement = null;
    this.hostThemeObserver = null;
    this.hostThemeMediaQueryList = null;
    if (this.pendingThemeRefreshTimeoutId !== null) {
      clearTimeout(this.pendingThemeRefreshTimeoutId);
      this.pendingThemeRefreshTimeoutId = null;
    }
    this.latestSettings = null;
    this.draftPhraseEntries = [];
    this.draftPhraseNotInterestedKeys = new Set();
    this.draftUserHandles = [];
    this.draftUserNotInterestedHandles = new Set();
    this.draftVerifiedWhitelistHandles = [];
    this.draftTrendingTopics = [];
    this.draftTrendingNotInterestedTopics = new Set();
    this.editorState = null;
    this.editorSuggestions = [];
    this.editorSuggestionFocusIndex = -1;
    this.suggestionRequestSequence = 0;
    this.editorInputNameSequence = 0;
    this.editorBaselineSnapshot = '';
    this.editorIsDirty = false;
    if (this.pendingSuggestionTimeoutId !== null) {
      clearTimeout(this.pendingSuggestionTimeoutId);
      this.pendingSuggestionTimeoutId = null;
    }
    this.pendingHandleRemoval = {
      list: '',
      handle: '',
    };
    this.baselineSnapshot = '';
    this.isDirty = false;
  }

  /**
   * Emit menu open-state changes to external UI adapters.
   *
   * @param {boolean} isOpen - Current menu visibility.
   */
  #emitVisibilityChanged(isOpen) {
    if (!this.onVisibilityChanged) {
      return;
    }

    try {
      this.onVisibilityChanged(isOpen);
    } catch (error) {
      this.logger.warn?.('Settings menu visibility callback failed.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Apply dark/light theme tokens from Threads host styles.
   */
  #applyTheme() {
    if (!this.rootElement) {
      return;
    }

    this.rootElement.setAttribute('data-theme', isThreadsDarkThemeActive() ? 'dark' : 'light');
  }

  /**
   * Defer host-theme refreshes so rapid DOM mutations coalesce.
   */
  #scheduleThemeRefresh() {
    if (this.pendingThemeRefreshTimeoutId !== null) {
      return;
    }

    this.pendingThemeRefreshTimeoutId = setTimeout(() => {
      this.pendingThemeRefreshTimeoutId = null;
      this.#applyTheme();
    }, 0);
  }

  /**
   * Keep menu theme tokens aligned with host appearance changes.
   */
  #startHostThemeSync() {
    this.#stopHostThemeSync();

    if (typeof MutationObserver === 'function') {
      this.hostThemeObserver = new MutationObserver(() => {
        this.#scheduleThemeRefresh();
      });
      const observerOptions = {
        attributes: true,
        attributeFilter: ['class', 'style'],
      };
      this.hostThemeObserver.observe(document.documentElement, observerOptions);
      if (document.body) {
        this.hostThemeObserver.observe(document.body, observerOptions);
      }
    }

    if (typeof window.matchMedia === 'function') {
      this.hostThemeMediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
      if (typeof this.hostThemeMediaQueryList.addEventListener === 'function') {
        this.hostThemeMediaQueryList.addEventListener('change', this.handleThemeMediaQueryChange);
      } else if (typeof this.hostThemeMediaQueryList.addListener === 'function') {
        this.hostThemeMediaQueryList.addListener(this.handleThemeMediaQueryChange);
      }
    }
  }

  /**
   * Stop observing host theme changes while menu is hidden.
   */
  #stopHostThemeSync() {
    if (this.pendingThemeRefreshTimeoutId !== null) {
      clearTimeout(this.pendingThemeRefreshTimeoutId);
      this.pendingThemeRefreshTimeoutId = null;
    }

    if (this.hostThemeObserver) {
      this.hostThemeObserver.disconnect();
      this.hostThemeObserver = null;
    }

    if (this.hostThemeMediaQueryList) {
      if (typeof this.hostThemeMediaQueryList.removeEventListener === 'function') {
        this.hostThemeMediaQueryList.removeEventListener(
          'change',
          this.handleThemeMediaQueryChange
        );
      } else if (typeof this.hostThemeMediaQueryList.removeListener === 'function') {
        this.hostThemeMediaQueryList.removeListener(this.handleThemeMediaQueryChange);
      }
      this.hostThemeMediaQueryList = null;
    }
  }

  /**
   * Insert menu styles once.
   */
  #ensureStyleTag() {
    if (typeof document === 'undefined') {
      return;
    }

    const styleElement = document.createElement('style');
    styleElement.id = IDS.style;
    styleElement.textContent = `
body.${OPEN_CLASS}{overflow:hidden}
#${IDS.root}{--o:rgba(0,0,0,.7);--s:rgb(24,24,24);--b:rgba(243,245,247,.15);--h:rgba(255,255,255,.08);--t:rgb(243,245,247);--m:rgba(243,245,247,.72);--f:rgba(243,245,247,.22);--c:rgba(255,255,255,.08);--fb:rgba(243,245,247,.24);--fo:rgba(243,245,247,.64);--btf-about-icon-url:url("${ABOUT_ICON_DATA_URI}");position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:var(--o);box-sizing:border-box;animation:btf-overlay-fade-in .2s ease-in-out}
#${IDS.root} [hidden]{display:none!important}
#${IDS.root}[hidden]{display:none!important}
#${IDS.root}[data-theme="light"]{--o:rgba(0,0,0,.7);--s:rgb(255,255,255);--b:rgba(17,24,39,.15);--h:rgba(17,24,39,.06);--t:rgb(17,24,39);--m:rgba(17,24,39,.72);--f:rgba(17,24,39,.2);--c:rgba(17,24,39,.05);--fb:rgba(17,24,39,.22);--fo:rgba(17,24,39,.48)}
#${IDS.root} .btf-settings-dialog{width:min(680px,calc(100vw - 24px));max-height:calc(100vh - 40px);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;border-radius:16px;border:1px solid var(--b);background:var(--s);box-shadow:rgba(0,0,0,.08) 0 12px 24px 0;color:var(--t);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;animation:btf-overlay-fade-in .2s ease-in-out,btf-modal-scale-in .2s ease-in-out}
#${IDS.root} .btf-settings-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:22px 22px 16px;border-bottom:1px solid var(--b)}
#${IDS.root} .btf-settings-title{margin:0;font-size:20px;line-height:1.2;font-weight:700;color:var(--t)}
#${IDS.root} .btf-about-trigger{border:0;padding:0;background:transparent;color:var(--m);cursor:pointer;display:inline-flex;align-items:center;gap:8px;min-height:28px}
#${IDS.root} .btf-about-trigger:hover,#${IDS.root} .btf-about-trigger:focus-visible{color:var(--t);outline:none}
#${IDS.root} .btf-about-trigger-label{font-size:12px;font-weight:600;line-height:1;letter-spacing:.01em;opacity:0;max-width:0;overflow:hidden;white-space:nowrap;transform:translateX(-8px);transition:opacity 160ms ease,max-width 160ms ease,transform 160ms ease}
#${IDS.root} .btf-about-trigger:hover .btf-about-trigger-label,#${IDS.root} .btf-about-trigger:focus-visible .btf-about-trigger-label{opacity:1;max-width:54px;transform:translateX(0)}
#${IDS.root} .btf-about-trigger-icon{display:inline-block;width:22px;height:22px;background-color:currentColor;mask-image:var(--btf-about-icon-url);mask-repeat:no-repeat;mask-position:center;mask-size:contain;-webkit-mask-image:var(--btf-about-icon-url);-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain;transform-origin:center}
#${IDS.root} .btf-about-trigger:hover .btf-about-trigger-icon,#${IDS.root} .btf-about-trigger:focus-visible .btf-about-trigger-icon{animation:btf-about-hat-rock 180ms ease-out}
#${IDS.root} #${IDS.form}{display:grid;grid-template-rows:minmax(0,1fr) auto;min-height:0;overflow:hidden}
#${IDS.root} .btf-settings-body{padding:0 22px;overflow:auto;min-height:0}
#${IDS.root} .btf-section{border-top:1px solid var(--b);padding:18px 0;display:grid;gap:12px}
#${IDS.root} .btf-section:first-child{border-top:0}
#${IDS.root} .btf-section-header{display:flex;justify-content:space-between;align-items:center;gap:12px}
#${IDS.root} .btf-section-title{margin:0}
#${IDS.root} .btf-section-title-main{font-size:15px;line-height:1.3;font-weight:600;color:var(--t)}
#${IDS.root} .btf-section-title-sub{font-size:13px;line-height:1.35;font-weight:600;color:var(--m);letter-spacing:.01em}
#${IDS.root} .btf-helper-text{margin:0;font-size:12px;line-height:1.45;color:var(--m)}
#${IDS.root} .btf-verified-whitelist{display:grid;gap:8px;padding-top:4px}
#${IDS.root} .btf-trending-topics{display:grid;gap:8px;padding-top:4px}
#${IDS.root} .btf-chip-list{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#${IDS.root} .btf-chip{border:1px solid var(--f);border-radius:999px;background:var(--c);color:var(--t);padding:6px 12px;font-size:13px;line-height:1.2;display:inline-flex;align-items:center;gap:8px;cursor:pointer}
#${IDS.root} .btf-chip:hover,#${IDS.root} .btf-chip:focus-visible{background:var(--h);outline:none}
#${IDS.root} .btf-chip-meta{border:1px solid var(--f);border-radius:999px;padding:1px 6px;font-size:11px;color:var(--m)}
#${IDS.root} .btf-empty-list{font-size:12px;color:var(--m)}
#${IDS.root} .btf-button{border:1px solid var(--f);border-radius:999px;font-size:13px;font-weight:500;padding:8px 14px;cursor:pointer;line-height:1.2;color:var(--t);background:transparent}
#${IDS.root} .btf-button:disabled{opacity:.55;cursor:default}
#${IDS.root} .btf-button-primary{border-color:var(--fb);font-weight:600}
#${IDS.root} .btf-button-primary:hover,#${IDS.root} .btf-button-primary:focus-visible{background:var(--h);outline:none}
#${IDS.root} .btf-button-quiet{border-color:var(--f)}
#${IDS.root} .btf-button-quiet:hover,#${IDS.root} .btf-button-quiet:focus-visible{background:var(--h);outline:none}
#${IDS.root} .btf-button-danger{border-color:var(--f);font-weight:500}
#${IDS.root} .btf-button-danger:hover,#${IDS.root} .btf-button-danger:focus-visible{background:var(--h);outline:none}
#${IDS.root} .btf-setting-toggle-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:12px;min-height:52px;padding:0;border-radius:12px;box-sizing:border-box;transition:background-color 120ms ease}
#${IDS.root} .btf-setting-toggle-title{margin:0;font-size:15px;line-height:1.3;font-weight:600;color:var(--t);padding-right:6px}
#${IDS.root} .btf-inline-toggle{display:flex;justify-content:space-between;align-items:center;gap:12px}
#${IDS.root} .btf-inline-toggle-label{margin:0;font-size:13px;line-height:1.35;font-weight:500;color:var(--m)}
#${IDS.root} .btf-switch{position:relative;display:inline-flex;align-items:center;justify-content:center;justify-self:end;width:40px;height:24px;flex:0 0 auto}
#${IDS.root} .btf-switch input{position:absolute;inset:0;margin:0;opacity:.001;cursor:pointer;z-index:2}
#${IDS.root} .btf-switch-shell{position:absolute;inset:0;border-radius:16px;background:#323539;transition:opacity 150ms cubic-bezier(.17,.17,0,1);overflow:hidden}
#${IDS.root}[data-theme="light"] .btf-switch-shell{background:#d0d4d9}
#${IDS.root} .btf-switch-track{position:absolute;inset:0;border-radius:16px;background:#fff;opacity:0;transition:opacity 150ms cubic-bezier(.17,.17,0,1)}
#${IDS.root}[data-theme="light"] .btf-switch-track{background:#1c1e21}
#${IDS.root} .btf-switch-thumb{position:absolute;top:1px;left:1px;width:22px;height:22px;box-sizing:border-box;border-radius:14px;border:1px solid var(--f);background:#0a0a0a;transition:transform 150ms cubic-bezier(.17,.17,0,1)}
#${IDS.root}[data-theme="light"] .btf-switch-thumb{border-color:rgba(17,24,39,.2);background:#fff}
#${IDS.root} .btf-switch input:checked + .btf-switch-shell .btf-switch-track{opacity:1}
#${IDS.root} .btf-switch input:checked + .btf-switch-shell .btf-switch-thumb{transform:translateX(16px)}
#${IDS.root} .btf-switch input:focus-visible + .btf-switch-shell{outline:2px solid var(--fo);outline-offset:2px}
#${IDS.root} .btf-settings-footer{padding:14px 22px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--b)}
#${IDS.root} .btf-status{margin:0;min-height:19px;font-size:13px;color:var(--m)}
#${IDS.root} .btf-footer-actions{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto;justify-items:end;align-items:center;min-height:34px;flex:0 1 auto;max-width:100%}
#${IDS.root} .btf-footer-action-set{grid-area:1/1;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:nowrap;opacity:0;transform:translateY(4px);pointer-events:none;transition:opacity 140ms ease,transform 140ms ease}
#${IDS.root} .btf-footer-action-set .btf-button{flex:0 0 auto}
#${IDS.root} .btf-footer-action-set[aria-hidden="false"]{opacity:1;transform:translateY(0);pointer-events:auto}
#${IDS.root} .btf-submodal{position:fixed;inset:0;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.5);z-index:2147483647;box-sizing:border-box}
#${IDS.root} .btf-submodal[hidden]{display:none!important}
#${IDS.root} .btf-submodal-panel{width:min(460px,calc(100vw - 24px));border-radius:16px;border:1px solid var(--b);background:var(--s);color:var(--t);padding:18px;display:grid;gap:12px;box-shadow:rgba(0,0,0,.08) 0 12px 24px 0}
#${IDS.root} .btf-submodal-title{margin:0;font-size:17px;font-weight:700;color:var(--t)}
#${IDS.root} .btf-submodal-subtitle{margin:0;font-size:13px;color:var(--m)}
#${IDS.root} .btf-about-copy{display:grid;gap:10px}
#${IDS.root} .btf-about-copy-line{margin:0;font-size:14px;line-height:1.5;color:var(--m)}
#${IDS.root} .btf-about-copy-line a{color:var(--t);text-decoration:underline;text-underline-offset:2px}
#${IDS.root} .btf-about-copy-line a:hover,#${IDS.root} .btf-about-copy-line a:focus-visible{color:var(--t);text-decoration-thickness:2px;outline:none}
#${IDS.root} .btf-submodal-form{display:grid;row-gap:8px}
#${IDS.root} .btf-submodal-input{width:100%;border-radius:12px;border:1px solid var(--f);background:transparent;color:var(--t);padding:11px 12px;box-sizing:border-box;font-size:14px;line-height:1.45;font-family:inherit}
#${IDS.root} .btf-submodal-input:focus-visible{outline:2px solid var(--fo);outline-offset:1px}
#${IDS.root} .btf-editor-regex-row{padding-top:2px}
#${IDS.root} .btf-editor-not-interested-row{padding-top:2px}
#${IDS.root} .btf-suggestion-overlay{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none}
#${IDS.root} .btf-suggestion-overlay-panel{width:280px;max-width:calc(100vw - 24px);border-radius:16px;border:1px solid var(--b);background:var(--s);box-shadow:0 10.5px 21px rgba(0,0,0,.08);overflow:hidden;pointer-events:auto}
#${IDS.root} .btf-suggestion-list{display:flex;flex-direction:column;max-height:285px;overflow:auto}
#${IDS.root} .btf-suggestion-list[hidden]{display:none!important}
#${IDS.root} .btf-suggestion-item{border:0;background:transparent;color:var(--t);padding:0 16px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:63px;cursor:pointer;text-align:left}
#${IDS.root} .btf-suggestion-item:not(:last-child){border-bottom:1px solid rgba(243,245,247,.15)}
#${IDS.root}[data-theme="light"] .btf-suggestion-item:not(:last-child){border-bottom:1px solid rgba(17,24,39,.15)}
#${IDS.root} .btf-suggestion-item:hover,#${IDS.root} .btf-suggestion-item:focus-visible,#${IDS.root} .btf-suggestion-item[aria-selected="true"]{background:var(--h);outline:none}
#${IDS.root} .btf-suggestion-main{display:flex;align-items:center;gap:12px;min-width:0}
#${IDS.root} .btf-suggestion-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid var(--f);background:var(--c);flex:0 0 auto}
#${IDS.root} .btf-suggestion-avatar-placeholder{display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--m)}
#${IDS.root} .btf-suggestion-meta{display:grid;gap:2px;min-width:0}
#${IDS.root} .btf-suggestion-handle{font-size:15px;font-weight:500;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${IDS.root} .btf-suggestion-name{font-size:13px;color:var(--m);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${IDS.root} .btf-suggestion-badge{border:1px solid var(--f);border-radius:999px;padding:1px 7px;font-size:11px;color:var(--m);flex:0 0 auto}
#${IDS.root} .btf-submodal-status{margin:0;font-size:12px;line-height:1.35;color:var(--m)}
#${IDS.root} .btf-submodal-status:empty{display:none}
#${IDS.root} .btf-submodal-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}
#${IDS.root} .btf-submodal-actions-main{display:inline-flex;align-items:center;gap:8px}
#${IDS.root} .btf-submodal-actions-main-reactive{display:grid;grid-template-columns:max-content;grid-template-rows:auto;justify-items:end;align-items:center;min-height:34px}
#${IDS.root} .btf-submodal-action-set{grid-area:1/1;display:none;align-items:center;gap:8px}
#${IDS.root} .btf-submodal-action-set[aria-hidden="false"]{display:inline-flex;animation:btf-submodal-action-set-in 140ms ease}
@keyframes btf-overlay-fade-in{0%{opacity:0}100%{opacity:1}}
@keyframes btf-modal-scale-in{0%{transform:scale(.95)}100%{transform:none}}
@keyframes btf-about-hat-rock{0%{transform:rotate(0deg)}35%{transform:rotate(-8deg)}70%{transform:rotate(6deg)}100%{transform:rotate(0deg)}}
@keyframes btf-submodal-action-set-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion: reduce){#${IDS.root}{animation:none}#${IDS.root} .btf-settings-dialog{animation:none}#${IDS.root} .btf-about-trigger-label{transition:none;transform:none}#${IDS.root} .btf-about-trigger:hover .btf-about-trigger-icon,#${IDS.root} .btf-about-trigger:focus-visible .btf-about-trigger-icon{animation:none}#${IDS.root} .btf-footer-action-set,#${IDS.root} .btf-submodal-action-set{transition:none;animation:none}}
@media (max-width:640px){#${IDS.root}{padding:12px}#${IDS.root} .btf-settings-dialog{width:calc(100vw - 16px);max-height:calc(100vh - 16px);border-radius:16px}#${IDS.root} .btf-settings-header,#${IDS.root} .btf-settings-body,#${IDS.root} .btf-settings-footer{padding-left:14px;padding-right:14px}#${IDS.root} .btf-settings-footer{flex-direction:column;align-items:stretch}#${IDS.root} .btf-footer-actions{width:100%;min-width:0;min-height:72px}#${IDS.root} .btf-footer-action-set{justify-content:flex-end;flex-wrap:wrap}}
`;

    const existingStyleElement = document.getElementById(IDS.style);
    if (existingStyleElement) {
      if (existingStyleElement.textContent !== styleElement.textContent) {
        existingStyleElement.textContent = styleElement.textContent;
      }
      return;
    }

    const head = document.head || document.documentElement;
    head?.appendChild(styleElement);
  }

  /**
   * Build modal DOM once so subsequent toggles remain fast.
   */
  #ensureRootElement() {
    if (typeof document === 'undefined') {
      return;
    }

    if (this.rootElement && document.body?.contains(this.rootElement)) {
      return;
    }

    const existingRootElement = document.getElementById(IDS.root);
    if (existingRootElement) {
      this.rootElement = existingRootElement;
    } else {
      const rootElement = document.createElement('div');
      rootElement.id = IDS.root;
      rootElement.hidden = true;
      rootElement.appendChild(this.#createDialogElement());
      rootElement.appendChild(this.#createAboutModalElement());
      rootElement.appendChild(this.#createEditorModalElement());
      rootElement.appendChild(this.#createSuggestionOverlayElement());
      rootElement.appendChild(this.#createConfirmModalElement());
      document.body?.appendChild(rootElement);
      this.rootElement = rootElement;
    }

    this.formElement = this.rootElement.querySelector(`#${IDS.form}`);
    this.statusElement = this.rootElement.querySelector(`#${IDS.status}`);
    this.footerActionsElement = this.rootElement.querySelector(`#${IDS.footerActions}`);
    this.cleanActionsElement = this.rootElement.querySelector(`#${IDS.cleanActions}`);
    this.dirtyActionsElement = this.rootElement.querySelector(`#${IDS.dirtyActions}`);
    this.verifiedToggleElement = this.rootElement.querySelector(`#${IDS.verifiedToggle}`);
    this.verifiedBadgeToggleElement = this.rootElement.querySelector(`#${IDS.verifiedBadgeToggle}`);
    this.verifiedWhitelistListElement = this.rootElement.querySelector(
      `#${IDS.verifiedWhitelistList}`
    );
    this.aiLabelToggleElement = this.rootElement.querySelector(`#${IDS.aiLabelToggle}`);
    this.suggestedFollowToggleElement = this.rootElement.querySelector(
      `#${IDS.suggestedFollowToggle}`
    );
    this.trendingHideAllToggleElement = this.rootElement.querySelector(
      `#${IDS.trendingHideAllToggle}`
    );
    this.trendingTopicListElement = this.rootElement.querySelector(`#${IDS.trendingTopicList}`);
    this.phraseListElement = this.rootElement.querySelector(`#${IDS.phraseList}`);
    this.userListElement = this.rootElement.querySelector(`#${IDS.userList}`);
    this.aboutModalElement = this.rootElement.querySelector(`#${IDS.aboutModal}`);
    this.editorModalElement = this.rootElement.querySelector(`#${IDS.editorModal}`);
    this.editorFormElement = this.rootElement.querySelector(`#${IDS.editorForm}`);
    this.editorSuggestionOverlayElement = this.rootElement.querySelector(
      `#${IDS.editorSuggestionOverlay}`
    );
    this.editorTitleElement = this.rootElement.querySelector(`#${IDS.editorTitle}`);
    this.editorSubtitleElement = this.rootElement.querySelector(`#${IDS.editorSubtitle}`);
    this.editorInputElement = this.rootElement.querySelector(`#${IDS.editorInput}`);
    this.editorSuggestionListElement = this.rootElement.querySelector(
      `#${IDS.editorSuggestionList}`
    );
    this.editorRegexRowElement = this.rootElement.querySelector(`#${IDS.editorRegexRow}`);
    this.editorRegexToggleElement = this.rootElement.querySelector(`#${IDS.editorRegexToggle}`);
    this.editorNotInterestedRowElement = this.rootElement.querySelector(
      `#${IDS.editorNotInterestedRow}`
    );
    this.editorNotInterestedLabelElement = this.rootElement.querySelector(
      `#${IDS.editorNotInterestedLabel}`
    );
    this.editorNotInterestedToggleElement = this.rootElement.querySelector(
      `#${IDS.editorNotInterestedToggle}`
    );
    this.editorStatusElement = this.rootElement.querySelector(`#${IDS.editorStatus}`);
    this.editorSubmitButtonElement = this.rootElement.querySelector(`#${IDS.editorSubmit}`);
    this.editorCleanActionsElement = this.rootElement.querySelector(`#${IDS.editorCleanActions}`);
    this.editorDirtyActionsElement = this.rootElement.querySelector(`#${IDS.editorDirtyActions}`);
    this.editorDeleteButtonElement = this.rootElement.querySelector(`#${IDS.editorDelete}`);
    this.confirmModalElement = this.rootElement.querySelector(`#${IDS.confirmModal}`);
    this.confirmMessageElement = this.rootElement.querySelector(`#${IDS.confirmMessage}`);

    this.rootElement.removeEventListener('click', this.handleRootClick);
    this.formElement?.removeEventListener('submit', this.handleFormSubmit);
    this.editorFormElement?.removeEventListener('submit', this.handleEditorSubmit);
    this.editorInputElement?.removeEventListener('input', this.handleEditorInput);
    this.editorInputElement?.removeEventListener('keydown', this.handleEditorKeydown);
    this.editorRegexToggleElement?.removeEventListener('change', this.handleEditorToggleChange);
    this.editorNotInterestedToggleElement?.removeEventListener(
      'change',
      this.handleEditorToggleChange
    );
    this.verifiedToggleElement?.removeEventListener('change', this.handleToggleChange);
    this.verifiedBadgeToggleElement?.removeEventListener('change', this.handleToggleChange);
    this.aiLabelToggleElement?.removeEventListener('change', this.handleToggleChange);
    this.suggestedFollowToggleElement?.removeEventListener('change', this.handleToggleChange);
    this.trendingHideAllToggleElement?.removeEventListener('change', this.handleToggleChange);
    document.removeEventListener('keydown', this.handleDocumentKeydown);
    window.removeEventListener('resize', this.handleViewportShift);
    window.removeEventListener('scroll', this.handleViewportShift, true);

    this.rootElement.addEventListener('click', this.handleRootClick);
    this.formElement?.addEventListener('submit', this.handleFormSubmit);
    this.editorFormElement?.addEventListener('submit', this.handleEditorSubmit);
    this.editorInputElement?.addEventListener('input', this.handleEditorInput);
    this.editorInputElement?.addEventListener('keydown', this.handleEditorKeydown);
    this.editorRegexToggleElement?.addEventListener('change', this.handleEditorToggleChange);
    this.editorNotInterestedToggleElement?.addEventListener(
      'change',
      this.handleEditorToggleChange
    );
    this.verifiedToggleElement?.addEventListener('change', this.handleToggleChange);
    this.verifiedBadgeToggleElement?.addEventListener('change', this.handleToggleChange);
    this.aiLabelToggleElement?.addEventListener('change', this.handleToggleChange);
    this.suggestedFollowToggleElement?.addEventListener('change', this.handleToggleChange);
    this.trendingHideAllToggleElement?.addEventListener('change', this.handleToggleChange);
    document.addEventListener('keydown', this.handleDocumentKeydown);
    window.addEventListener('resize', this.handleViewportShift);
    window.addEventListener('scroll', this.handleViewportShift, true);
  }

  /**
   * Wait for body availability before creating modal roots.
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
   * Build one switch control that matches Threads toggles.
   *
   * @param {{ inputId: string, ariaLabel: string }} options - Control identity options.
   * @returns {HTMLLabelElement}
   */
  #createSwitchControl(options) {
    const switchElement = document.createElement('label');
    switchElement.className = 'btf-switch';
    switchElement.setAttribute('aria-label', options.ariaLabel);

    const inputElement = document.createElement('input');
    inputElement.id = options.inputId;
    inputElement.type = 'checkbox';
    inputElement.setAttribute('role', 'switch');
    inputElement.addEventListener('change', () => {
      this.#syncSwitchAriaState(inputElement);
    });

    const shellElement = document.createElement('span');
    shellElement.className = 'btf-switch-shell';
    const trackElement = document.createElement('span');
    trackElement.className = 'btf-switch-track';
    const thumbElement = document.createElement('span');
    thumbElement.className = 'btf-switch-thumb';
    shellElement.appendChild(trackElement);
    shellElement.appendChild(thumbElement);

    this.#syncSwitchAriaState(inputElement);
    switchElement.appendChild(inputElement);
    switchElement.appendChild(shellElement);
    return switchElement;
  }

  /**
   * Build settings dialog markup with safe DOM APIs.
   *
   * @returns {HTMLElement}
   */
  #createDialogElement() {
    const dialogElement = document.createElement('section');
    dialogElement.className = 'btf-settings-dialog';
    dialogElement.setAttribute('role', 'dialog');
    dialogElement.setAttribute('aria-modal', 'true');
    dialogElement.setAttribute('aria-labelledby', 'btf-settings-title');

    const headerElement = document.createElement('header');
    headerElement.className = 'btf-settings-header';
    const titleElement = document.createElement('h2');
    titleElement.id = 'btf-settings-title';
    titleElement.className = 'btf-settings-title';
    titleElement.textContent = SETTINGS_MENU_TITLE;
    const aboutTriggerElement = document.createElement('button');
    aboutTriggerElement.id = IDS.aboutTrigger;
    aboutTriggerElement.type = 'button';
    aboutTriggerElement.className = 'btf-about-trigger';
    aboutTriggerElement.setAttribute('data-btf-action', ACTIONS.openAbout);
    aboutTriggerElement.setAttribute('aria-label', 'Open About');
    const aboutTriggerLabelElement = document.createElement('span');
    aboutTriggerLabelElement.className = 'btf-about-trigger-label';
    aboutTriggerLabelElement.textContent = 'About';
    const aboutTriggerIconElement = document.createElement('span');
    aboutTriggerIconElement.className = 'btf-about-trigger-icon';
    aboutTriggerIconElement.setAttribute('aria-hidden', 'true');
    aboutTriggerElement.appendChild(aboutTriggerLabelElement);
    aboutTriggerElement.appendChild(aboutTriggerIconElement);
    headerElement.appendChild(titleElement);
    headerElement.appendChild(aboutTriggerElement);

    const formElement = document.createElement('form');
    formElement.id = IDS.form;
    const bodyElement = document.createElement('div');
    bodyElement.className = 'btf-settings-body';

    const verifiedSection = document.createElement('section');
    verifiedSection.className = 'btf-section';
    const verifiedSectionHeader = document.createElement('div');
    verifiedSectionHeader.className = 'btf-setting-toggle-row';
    const verifiedTitle = document.createElement('p');
    verifiedTitle.className = 'btf-setting-toggle-title btf-section-title-main';
    verifiedTitle.textContent = 'Filter Verified Users';
    const verifiedSwitch = this.#createSwitchControl({
      inputId: IDS.verifiedToggle,
      ariaLabel: 'Toggle verified user filtering',
    });
    verifiedSectionHeader.appendChild(verifiedTitle);
    verifiedSectionHeader.appendChild(verifiedSwitch);
    const verifiedHelpText = document.createElement('p');
    verifiedHelpText.className = 'btf-helper-text';
    verifiedHelpText.textContent = 'Hide posts from accounts with the blue verified badge.';
    const verifiedBadgeRow = document.createElement('div');
    verifiedBadgeRow.className = 'btf-inline-toggle';
    const verifiedBadgeLabel = document.createElement('p');
    verifiedBadgeLabel.className = 'btf-inline-toggle-label';
    verifiedBadgeLabel.textContent = 'Hide verified badges';
    const verifiedBadgeSwitch = this.#createSwitchControl({
      inputId: IDS.verifiedBadgeToggle,
      ariaLabel: 'Toggle hiding visible verified badges',
    });
    verifiedBadgeRow.appendChild(verifiedBadgeLabel);
    verifiedBadgeRow.appendChild(verifiedBadgeSwitch);
    const verifiedWhitelistSection = document.createElement('div');
    verifiedWhitelistSection.className = 'btf-verified-whitelist';
    const verifiedWhitelistHeader = document.createElement('div');
    verifiedWhitelistHeader.className = 'btf-section-header';
    const verifiedWhitelistTitle = document.createElement('h3');
    verifiedWhitelistTitle.className = 'btf-section-title btf-section-title-sub';
    verifiedWhitelistTitle.textContent = 'Verified Whitelist';
    const addVerifiedWhitelistButton = document.createElement('button');
    addVerifiedWhitelistButton.type = 'button';
    addVerifiedWhitelistButton.className = 'btf-button btf-button-quiet';
    addVerifiedWhitelistButton.setAttribute('data-btf-action', ACTIONS.openVerifiedWhitelistEditor);
    addVerifiedWhitelistButton.textContent = 'Add Handle';
    verifiedWhitelistHeader.appendChild(verifiedWhitelistTitle);
    verifiedWhitelistHeader.appendChild(addVerifiedWhitelistButton);
    const verifiedWhitelistHelpText = document.createElement('p');
    verifiedWhitelistHelpText.className = 'btf-helper-text';
    verifiedWhitelistHelpText.textContent =
      'Always allow posts from these verified handles, even when verified filtering is enabled.';
    const verifiedWhitelistListElement = document.createElement('div');
    verifiedWhitelistListElement.id = IDS.verifiedWhitelistList;
    verifiedWhitelistListElement.className = 'btf-chip-list';
    verifiedWhitelistSection.appendChild(verifiedWhitelistHeader);
    verifiedWhitelistSection.appendChild(verifiedWhitelistHelpText);
    verifiedWhitelistSection.appendChild(verifiedWhitelistListElement);
    verifiedSection.appendChild(verifiedSectionHeader);
    verifiedSection.appendChild(verifiedHelpText);
    verifiedSection.appendChild(verifiedBadgeRow);
    verifiedSection.appendChild(verifiedWhitelistSection);

    const aiLabelSection = document.createElement('section');
    aiLabelSection.className = 'btf-section';
    const aiLabelSectionHeader = document.createElement('div');
    aiLabelSectionHeader.className = 'btf-setting-toggle-row';
    const aiLabelTitle = document.createElement('p');
    aiLabelTitle.className = 'btf-setting-toggle-title btf-section-title-main';
    aiLabelTitle.textContent = 'Filter AI Posts';
    const aiLabelSwitch = this.#createSwitchControl({
      inputId: IDS.aiLabelToggle,
      ariaLabel: 'Toggle filtering for Threads self-disclosed AI posts',
    });
    aiLabelSectionHeader.appendChild(aiLabelTitle);
    aiLabelSectionHeader.appendChild(aiLabelSwitch);
    const aiLabelHelpText = document.createElement('p');
    aiLabelHelpText.className = 'btf-helper-text';
    aiLabelHelpText.textContent =
      "Hide posts marked with Threads' AI self-disclosure label. This only filters disclosed posts, not all AI content.";
    aiLabelSection.appendChild(aiLabelSectionHeader);
    aiLabelSection.appendChild(aiLabelHelpText);

    const suggestedFollowSection = document.createElement('section');
    suggestedFollowSection.className = 'btf-section';
    const suggestedFollowSectionHeader = document.createElement('div');
    suggestedFollowSectionHeader.className = 'btf-setting-toggle-row';
    const suggestedFollowTitle = document.createElement('p');
    suggestedFollowTitle.className = 'btf-setting-toggle-title btf-section-title-main';
    suggestedFollowTitle.textContent = 'Filter Suggested For You';
    const suggestedFollowSwitch = this.#createSwitchControl({
      inputId: IDS.suggestedFollowToggle,
      ariaLabel: 'Toggle suggested-for-you follow module filtering',
    });
    suggestedFollowSectionHeader.appendChild(suggestedFollowTitle);
    suggestedFollowSectionHeader.appendChild(suggestedFollowSwitch);
    const suggestedFollowHelpText = document.createElement('p');
    suggestedFollowHelpText.className = 'btf-helper-text';
    suggestedFollowHelpText.textContent =
      'Hide timeline who-to-follow modules labeled "Suggested for you".';
    suggestedFollowSection.appendChild(suggestedFollowSectionHeader);
    suggestedFollowSection.appendChild(suggestedFollowHelpText);

    const trendingSection = document.createElement('section');
    trendingSection.className = 'btf-section';
    const trendingSectionHeader = document.createElement('div');
    trendingSectionHeader.className = 'btf-section-header';
    const trendingTitle = document.createElement('h3');
    trendingTitle.className = 'btf-section-title btf-section-title-main';
    trendingTitle.textContent = 'Trending Filters';
    trendingSectionHeader.appendChild(trendingTitle);
    const trendingHelpText = document.createElement('p');
    trendingHelpText.className = 'btf-helper-text';
    trendingHelpText.textContent =
      'Hide posts that Threads tags with a timeline "Trending" topic highlight by topic or all-at-once.';
    const trendingHideAllRow = document.createElement('div');
    trendingHideAllRow.className = 'btf-inline-toggle';
    const trendingHideAllLabel = document.createElement('p');
    trendingHideAllLabel.className = 'btf-inline-toggle-label';
    trendingHideAllLabel.textContent = 'Filter all trending posts';
    const trendingHideAllSwitch = this.#createSwitchControl({
      inputId: IDS.trendingHideAllToggle,
      ariaLabel: 'Toggle filtering for all trending posts',
    });
    trendingHideAllRow.appendChild(trendingHideAllLabel);
    trendingHideAllRow.appendChild(trendingHideAllSwitch);
    const trendingTopicsSection = document.createElement('div');
    trendingTopicsSection.className = 'btf-trending-topics';
    const trendingTopicsHeader = document.createElement('div');
    trendingTopicsHeader.className = 'btf-section-header';
    const trendingTopicsTitle = document.createElement('h3');
    trendingTopicsTitle.className = 'btf-section-title btf-section-title-sub';
    trendingTopicsTitle.textContent = 'Trending Topics';
    const addTrendingTopicButton = document.createElement('button');
    addTrendingTopicButton.type = 'button';
    addTrendingTopicButton.className = 'btf-button btf-button-quiet';
    addTrendingTopicButton.setAttribute('data-btf-action', ACTIONS.openTrendingTopicEditor);
    addTrendingTopicButton.textContent = 'Add Topic';
    trendingTopicsHeader.appendChild(trendingTopicsTitle);
    trendingTopicsHeader.appendChild(addTrendingTopicButton);
    const trendingTopicsHelpText = document.createElement('p');
    trendingTopicsHelpText.className = 'btf-helper-text';
    trendingTopicsHelpText.textContent =
      'When "Filter all trending posts" is off, only posts tagged with these topics are hidden.';
    const trendingTopicsListElement = document.createElement('div');
    trendingTopicsListElement.id = IDS.trendingTopicList;
    trendingTopicsListElement.className = 'btf-chip-list';
    trendingTopicsSection.appendChild(trendingTopicsHeader);
    trendingTopicsSection.appendChild(trendingTopicsHelpText);
    trendingTopicsSection.appendChild(trendingTopicsListElement);
    trendingSection.appendChild(trendingSectionHeader);
    trendingSection.appendChild(trendingHelpText);
    trendingSection.appendChild(trendingHideAllRow);
    trendingSection.appendChild(trendingTopicsSection);

    const phraseSection = document.createElement('section');
    phraseSection.className = 'btf-section';
    const phraseSectionHeader = document.createElement('div');
    phraseSectionHeader.className = 'btf-section-header';
    const phraseTitle = document.createElement('h3');
    phraseTitle.className = 'btf-section-title btf-section-title-main';
    phraseTitle.textContent = 'Filtered Phrases';
    const addPhraseButton = document.createElement('button');
    addPhraseButton.type = 'button';
    addPhraseButton.className = 'btf-button btf-button-quiet';
    addPhraseButton.setAttribute('data-btf-action', ACTIONS.openPhraseEditor);
    addPhraseButton.textContent = 'Add Phrase';
    phraseSectionHeader.appendChild(phraseTitle);
    phraseSectionHeader.appendChild(addPhraseButton);
    const phraseHelpText = document.createElement('p');
    phraseHelpText.className = 'btf-helper-text';
    phraseHelpText.textContent = 'Click a phrase bubble to edit it or change regex mode.';
    const phraseListElement = document.createElement('div');
    phraseListElement.id = IDS.phraseList;
    phraseListElement.className = 'btf-chip-list';
    phraseSection.appendChild(phraseSectionHeader);
    phraseSection.appendChild(phraseHelpText);
    phraseSection.appendChild(phraseListElement);

    const usernameSection = document.createElement('section');
    usernameSection.className = 'btf-section';
    const usernameSectionHeader = document.createElement('div');
    usernameSectionHeader.className = 'btf-section-header';
    const usernameTitle = document.createElement('h3');
    usernameTitle.className = 'btf-section-title btf-section-title-main';
    usernameTitle.textContent = 'Filtered Usernames';
    const addUserButton = document.createElement('button');
    addUserButton.type = 'button';
    addUserButton.className = 'btf-button btf-button-quiet';
    addUserButton.setAttribute('data-btf-action', ACTIONS.openUserEditor);
    addUserButton.textContent = 'Add User';
    usernameSectionHeader.appendChild(usernameTitle);
    usernameSectionHeader.appendChild(addUserButton);
    const usernameHelpText = document.createElement('p');
    usernameHelpText.className = 'btf-helper-text';
    usernameHelpText.textContent =
      'Click a username bubble to remove it. Add multiple handles with commas and optionally enable Not Interested.';
    const usernameListElement = document.createElement('div');
    usernameListElement.id = IDS.userList;
    usernameListElement.className = 'btf-chip-list';
    usernameSection.appendChild(usernameSectionHeader);
    usernameSection.appendChild(usernameHelpText);
    usernameSection.appendChild(usernameListElement);

    bodyElement.appendChild(verifiedSection);
    bodyElement.appendChild(aiLabelSection);
    bodyElement.appendChild(suggestedFollowSection);
    bodyElement.appendChild(trendingSection);
    bodyElement.appendChild(phraseSection);
    bodyElement.appendChild(usernameSection);

    const footerElement = document.createElement('footer');
    footerElement.className = 'btf-settings-footer';
    const statusElement = document.createElement('p');
    statusElement.id = IDS.status;
    statusElement.className = 'btf-status';
    statusElement.setAttribute('aria-live', 'polite');
    const footerActionsElement = document.createElement('div');
    footerActionsElement.id = IDS.footerActions;
    footerActionsElement.className = 'btf-footer-actions';
    const cleanActionsElement = document.createElement('div');
    cleanActionsElement.id = IDS.cleanActions;
    cleanActionsElement.className = 'btf-footer-action-set';
    cleanActionsElement.setAttribute('aria-hidden', 'false');
    const closeButtonElement = document.createElement('button');
    closeButtonElement.type = 'button';
    closeButtonElement.className = 'btf-button btf-button-quiet';
    closeButtonElement.setAttribute('data-btf-action', ACTIONS.close);
    closeButtonElement.textContent = 'Close';
    cleanActionsElement.appendChild(closeButtonElement);

    const dirtyActionsElement = document.createElement('div');
    dirtyActionsElement.id = IDS.dirtyActions;
    dirtyActionsElement.className = 'btf-footer-action-set';
    dirtyActionsElement.setAttribute('aria-hidden', 'true');
    const discardButtonElement = document.createElement('button');
    discardButtonElement.type = 'button';
    discardButtonElement.className = 'btf-button btf-button-quiet';
    discardButtonElement.setAttribute('data-btf-action', ACTIONS.discardClose);
    discardButtonElement.textContent = 'Discard & Close';
    const saveCloseButtonElement = document.createElement('button');
    saveCloseButtonElement.type = 'button';
    saveCloseButtonElement.className = 'btf-button btf-button-primary';
    saveCloseButtonElement.setAttribute('data-btf-action', ACTIONS.saveClose);
    saveCloseButtonElement.textContent = 'Save & Close';
    dirtyActionsElement.appendChild(discardButtonElement);
    dirtyActionsElement.appendChild(saveCloseButtonElement);

    footerActionsElement.appendChild(cleanActionsElement);
    footerActionsElement.appendChild(dirtyActionsElement);
    footerElement.appendChild(statusElement);
    footerElement.appendChild(footerActionsElement);

    formElement.appendChild(bodyElement);
    formElement.appendChild(footerElement);
    dialogElement.appendChild(headerElement);
    dialogElement.appendChild(formElement);
    return dialogElement;
  }

  /**
   * Build About modal markup opened from the header hat control.
   *
   * @returns {HTMLElement}
   */
  #createAboutModalElement() {
    const modalElement = document.createElement('div');
    modalElement.id = IDS.aboutModal;
    modalElement.className = 'btf-submodal';
    modalElement.hidden = true;

    const panelElement = document.createElement('section');
    panelElement.className = 'btf-submodal-panel';
    panelElement.setAttribute('role', 'dialog');
    panelElement.setAttribute('aria-modal', 'true');
    panelElement.setAttribute('aria-labelledby', 'btf-settings-about-title');

    const titleElement = document.createElement('h3');
    titleElement.id = 'btf-settings-about-title';
    titleElement.className = 'btf-submodal-title';
    titleElement.textContent = 'About';

    const copyElement = document.createElement('div');
    copyElement.className = 'btf-about-copy';
    const missionParagraph = document.createElement('p');
    missionParagraph.className = 'btf-about-copy-line';
    missionParagraph.textContent =
      "I hope this script helps you get more of what you want out of Threads. I promise to be your ally in the fight against stuff you don't want to see online.";
    copyElement.appendChild(missionParagraph);
    appendLinkedParagraph(copyElement, {
      before: 'If it helps, a star on ',
      linkLabel: 'GitHub',
      href: BOBBIN_GITHUB_URL,
      after: ' would mean a lot.',
    });
    appendLinkedParagraph(copyElement, {
      before: 'Come say hi to me on ',
      linkLabel: 'Threads',
      href: MAINTAINER_THREADS_URL,
      after: ' - I share my art, poetry, and dev updates over there.',
    });
    appendLinkedParagraph(copyElement, {
      before: "If you want to see what I'm up to around the web, ",
      linkLabel: 'my website',
      href: MAINTAINER_WEBSITE_URL,
      after: ' is the best place to start.',
    });
    appendLinkedParagraph(copyElement, {
      before:
        'Want more control over your other feeds? I maintain Facebook Clean My Feeds, too. Check it out ',
      linkLabel: 'over here on GitHub!',
      href: FACEBOOK_CLEAN_MY_FEEDS_REPO_URL,
    });

    const actionsElement = document.createElement('div');
    actionsElement.className = 'btf-submodal-actions';
    const spacerElement = document.createElement('span');
    const mainActionsElement = document.createElement('div');
    mainActionsElement.className = 'btf-submodal-actions-main';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btf-button btf-button-quiet';
    closeButton.setAttribute('data-btf-action', ACTIONS.closeAbout);
    closeButton.textContent = 'Close';
    mainActionsElement.appendChild(closeButton);
    actionsElement.appendChild(spacerElement);
    actionsElement.appendChild(mainActionsElement);

    panelElement.appendChild(titleElement);
    panelElement.appendChild(copyElement);
    panelElement.appendChild(actionsElement);
    modalElement.appendChild(panelElement);
    return modalElement;
  }

  /**
   * Build phrase/username editor modal markup.
   *
   * @returns {HTMLElement}
   */
  #createEditorModalElement() {
    const modalElement = document.createElement('div');
    modalElement.id = IDS.editorModal;
    modalElement.className = 'btf-submodal';
    modalElement.hidden = true;

    const panelElement = document.createElement('section');
    panelElement.className = 'btf-submodal-panel';
    panelElement.setAttribute('role', 'dialog');
    panelElement.setAttribute('aria-modal', 'true');
    panelElement.setAttribute('aria-labelledby', IDS.editorTitle);

    const titleElement = document.createElement('h3');
    titleElement.id = IDS.editorTitle;
    titleElement.className = 'btf-submodal-title';
    const subtitleElement = document.createElement('p');
    subtitleElement.id = IDS.editorSubtitle;
    subtitleElement.className = 'btf-submodal-subtitle';

    const formElement = document.createElement('form');
    formElement.id = IDS.editorForm;
    formElement.className = 'btf-submodal-form';
    formElement.setAttribute('autocomplete', 'off');
    const inputElement = document.createElement('input');
    inputElement.id = IDS.editorInput;
    inputElement.className = 'btf-submodal-input';
    inputElement.type = 'text';
    inputElement.setAttribute('name', `${EDITOR_INPUT_NAME_PREFIX}-0`);
    inputElement.setAttribute('autocomplete', 'off');
    inputElement.setAttribute('autocorrect', 'off');
    inputElement.setAttribute('autocapitalize', 'off');
    inputElement.setAttribute('spellcheck', 'false');
    inputElement.setAttribute('inputmode', 'text');

    const regexRowElement = document.createElement('div');
    regexRowElement.id = IDS.editorRegexRow;
    regexRowElement.className = 'btf-inline-toggle btf-editor-regex-row';
    const regexLabelElement = document.createElement('p');
    regexLabelElement.className = 'btf-inline-toggle-label';
    regexLabelElement.textContent = 'Interpret this entry as a regular expression';
    const regexSwitch = this.#createSwitchControl({
      inputId: IDS.editorRegexToggle,
      ariaLabel: 'Toggle phrase regex mode',
    });
    regexRowElement.appendChild(regexLabelElement);
    regexRowElement.appendChild(regexSwitch);

    const notInterestedRowElement = document.createElement('div');
    notInterestedRowElement.id = IDS.editorNotInterestedRow;
    notInterestedRowElement.className = 'btf-inline-toggle btf-editor-not-interested-row';
    const notInterestedLabelElement = document.createElement('p');
    notInterestedLabelElement.id = IDS.editorNotInterestedLabel;
    notInterestedLabelElement.className = 'btf-inline-toggle-label';
    notInterestedLabelElement.textContent = 'Auto-send Not Interested on matching posts';
    const notInterestedSwitch = this.#createSwitchControl({
      inputId: IDS.editorNotInterestedToggle,
      ariaLabel: 'Toggle auto not interested for this entry',
    });
    notInterestedRowElement.appendChild(notInterestedLabelElement);
    notInterestedRowElement.appendChild(notInterestedSwitch);

    const statusElement = document.createElement('p');
    statusElement.id = IDS.editorStatus;
    statusElement.className = 'btf-submodal-status';
    statusElement.setAttribute('aria-live', 'polite');

    const actionsElement = document.createElement('div');
    actionsElement.className = 'btf-submodal-actions';
    const deleteButton = document.createElement('button');
    deleteButton.id = IDS.editorDelete;
    deleteButton.type = 'button';
    deleteButton.className = 'btf-button btf-button-danger';
    deleteButton.setAttribute('data-btf-action', ACTIONS.editorDelete);
    deleteButton.textContent = 'Remove';
    const mainActionsElement = document.createElement('div');
    mainActionsElement.className = 'btf-submodal-actions-main btf-submodal-actions-main-reactive';
    const cleanActionsElement = document.createElement('div');
    cleanActionsElement.id = IDS.editorCleanActions;
    cleanActionsElement.className = 'btf-submodal-action-set';
    cleanActionsElement.setAttribute('aria-hidden', 'false');
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'btf-button btf-button-quiet';
    closeButton.setAttribute('data-btf-action', ACTIONS.editorCancel);
    closeButton.textContent = 'Close';
    cleanActionsElement.appendChild(closeButton);

    const dirtyActionsElement = document.createElement('div');
    dirtyActionsElement.id = IDS.editorDirtyActions;
    dirtyActionsElement.className = 'btf-submodal-action-set';
    dirtyActionsElement.setAttribute('aria-hidden', 'true');
    const discardButton = document.createElement('button');
    discardButton.type = 'button';
    discardButton.className = 'btf-button btf-button-quiet';
    discardButton.setAttribute('data-btf-action', ACTIONS.editorCancel);
    discardButton.textContent = 'Discard & Close';
    const submitButton = document.createElement('button');
    submitButton.id = IDS.editorSubmit;
    submitButton.type = 'submit';
    submitButton.className = 'btf-button btf-button-primary';
    submitButton.textContent = 'Add';
    dirtyActionsElement.appendChild(discardButton);
    dirtyActionsElement.appendChild(submitButton);
    mainActionsElement.appendChild(cleanActionsElement);
    mainActionsElement.appendChild(dirtyActionsElement);
    actionsElement.appendChild(deleteButton);
    actionsElement.appendChild(mainActionsElement);

    formElement.appendChild(inputElement);
    formElement.appendChild(regexRowElement);
    formElement.appendChild(notInterestedRowElement);
    formElement.appendChild(statusElement);
    formElement.appendChild(actionsElement);
    panelElement.appendChild(titleElement);
    panelElement.appendChild(subtitleElement);
    panelElement.appendChild(formElement);
    modalElement.appendChild(panelElement);
    return modalElement;
  }

  /**
   * Build suggestion overlay markup anchored beside the username input.
   *
   * @returns {HTMLElement}
   */
  #createSuggestionOverlayElement() {
    const overlayElement = document.createElement('div');
    overlayElement.id = IDS.editorSuggestionOverlay;
    overlayElement.className = 'btf-suggestion-overlay';
    overlayElement.setAttribute('role', 'menu');
    overlayElement.hidden = true;

    const panelElement = document.createElement('div');
    panelElement.className = 'btf-suggestion-overlay-panel';
    const listElement = document.createElement('div');
    listElement.id = IDS.editorSuggestionList;
    listElement.className = 'btf-suggestion-list';
    listElement.setAttribute('role', 'listbox');
    listElement.hidden = true;
    panelElement.appendChild(listElement);
    overlayElement.appendChild(panelElement);
    return overlayElement;
  }

  /**
   * Build username-removal confirmation modal markup.
   *
   * @returns {HTMLElement}
   */
  #createConfirmModalElement() {
    const modalElement = document.createElement('div');
    modalElement.id = IDS.confirmModal;
    modalElement.className = 'btf-submodal';
    modalElement.hidden = true;

    const panelElement = document.createElement('section');
    panelElement.className = 'btf-submodal-panel';
    panelElement.setAttribute('role', 'dialog');
    panelElement.setAttribute('aria-modal', 'true');
    panelElement.setAttribute('aria-labelledby', 'btf-settings-confirm-title');
    const titleElement = document.createElement('h3');
    titleElement.id = 'btf-settings-confirm-title';
    titleElement.className = 'btf-submodal-title';
    titleElement.textContent = 'Remove filtered username?';
    const messageElement = document.createElement('p');
    messageElement.id = IDS.confirmMessage;
    messageElement.className = 'btf-submodal-subtitle';

    const actionsElement = document.createElement('div');
    actionsElement.className = 'btf-submodal-actions';
    const spacerElement = document.createElement('span');
    const mainActionsElement = document.createElement('div');
    mainActionsElement.className = 'btf-submodal-actions-main';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btf-button btf-button-quiet';
    cancelButton.setAttribute('data-btf-action', ACTIONS.confirmCancel);
    cancelButton.textContent = 'Cancel';
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'btf-button btf-button-danger';
    confirmButton.setAttribute('data-btf-action', ACTIONS.confirmAccept);
    confirmButton.textContent = 'Remove';
    mainActionsElement.appendChild(cancelButton);
    mainActionsElement.appendChild(confirmButton);
    actionsElement.appendChild(spacerElement);
    actionsElement.appendChild(mainActionsElement);

    panelElement.appendChild(titleElement);
    panelElement.appendChild(messageElement);
    panelElement.appendChild(actionsElement);
    modalElement.appendChild(panelElement);
    return modalElement;
  }

  /**
   * Dismiss menu on backdrop or explicit close intent.
   *
   * @param {MouseEvent} event - Click event.
   */
  #onRootClick(event) {
    if (!this.rootElement) {
      return;
    }

    if (event.target === this.rootElement) {
      if (!this.#isEditorOpen() && !this.#isConfirmOpen() && !this.#isAboutOpen()) {
        this.close();
      }
      return;
    }

    if (event.target === this.aboutModalElement) {
      this.#closeAboutModal();
      return;
    }

    if (event.target === this.editorModalElement) {
      this.#closeEditorModal();
      return;
    }

    if (event.target === this.confirmModalElement) {
      this.#closeConfirmModal();
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const actionElement = target.closest('[data-btf-action]');
    if (!actionElement) {
      return;
    }

    const action = actionElement.getAttribute('data-btf-action');
    if (action === ACTIONS.close) {
      this.close();
      return;
    }

    if (action === ACTIONS.discardClose) {
      this.#discardAndClose();
      return;
    }

    if (action === ACTIONS.saveClose) {
      if (this.formElement && typeof this.formElement.requestSubmit === 'function') {
        this.formElement.requestSubmit();
      } else {
        void this.#saveAndCloseFromForm();
      }
      return;
    }

    if (action === ACTIONS.openAbout) {
      this.#openAboutModal();
      return;
    }

    if (action === ACTIONS.closeAbout) {
      this.#closeAboutModal();
      return;
    }

    if (action === ACTIONS.openPhraseEditor) {
      this.#openPhraseEditor();
      return;
    }

    if (action === ACTIONS.openUserEditor) {
      this.#openUserEditor();
      return;
    }

    if (action === ACTIONS.openVerifiedWhitelistEditor) {
      this.#openVerifiedWhitelistEditor();
      return;
    }

    if (action === ACTIONS.openTrendingTopicEditor) {
      this.#openTrendingTopicEditor();
      return;
    }

    if (action === ACTIONS.phraseChip) {
      const entryIndex = Number.parseInt(actionElement.getAttribute('data-entry-index') || '', 10);
      if (!Number.isNaN(entryIndex)) {
        this.#openPhraseEditor(entryIndex);
      }
      return;
    }

    if (action === ACTIONS.userChip) {
      const entryIndex = Number.parseInt(actionElement.getAttribute('data-entry-index') || '', 10);
      if (!Number.isNaN(entryIndex)) {
        this.#openHandleRemovalConfirm(entryIndex, 'username');
      }
      return;
    }

    if (action === ACTIONS.verifiedWhitelistChip) {
      const entryIndex = Number.parseInt(actionElement.getAttribute('data-entry-index') || '', 10);
      if (!Number.isNaN(entryIndex)) {
        this.#openHandleRemovalConfirm(entryIndex, 'verified-whitelist');
      }
      return;
    }

    if (action === ACTIONS.trendingTopicChip) {
      const entryIndex = Number.parseInt(actionElement.getAttribute('data-entry-index') || '', 10);
      if (!Number.isNaN(entryIndex)) {
        this.#openHandleRemovalConfirm(entryIndex, 'trending-topic');
      }
      return;
    }

    if (action === ACTIONS.editorSuggestionPick) {
      const suggestionIndex = Number.parseInt(
        actionElement.getAttribute('data-suggestion-index') || '',
        10
      );
      if (!Number.isNaN(suggestionIndex)) {
        this.#applyUsernameSuggestionFromIndex(suggestionIndex);
      }
      return;
    }

    if (action === ACTIONS.editorCancel) {
      this.#closeEditorModal();
      return;
    }

    if (action === ACTIONS.editorDelete) {
      this.#removeCurrentPhraseEntry();
      return;
    }

    if (action === ACTIONS.confirmCancel) {
      this.#closeConfirmModal();
      return;
    }

    if (action === ACTIONS.confirmAccept) {
      this.#confirmHandleRemoval();
    }
  }

  /**
   * Close menu on Escape.
   *
   * @param {KeyboardEvent} event - Keyboard event.
   */
  #onDocumentKeydown(event) {
    if (!this.isOpen || event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    if (this.#isEditorOpen()) {
      this.#closeEditorModal();
      return;
    }

    if (this.#isConfirmOpen()) {
      this.#closeConfirmModal();
      return;
    }

    if (this.#isAboutOpen()) {
      this.#closeAboutModal();
      return;
    }

    this.close();
  }

  /**
   * Apply editor modal changes to draft state.
   *
   * @param {Event} event - Submit event.
   */
  #onEditorSubmit(event) {
    event.preventDefault();
    this.#syncEditorDirtyState();
    if (!this.editorIsDirty) {
      this.#closeEditorModal();
      return;
    }
    this.#applyEditorChanges();
  }

  /**
   * Refresh username suggestions while the editor input changes.
   */
  #onEditorInput() {
    this.#syncEditorDirtyState();
    if (!this.#isHandleEditorMode()) {
      return;
    }

    this.#scheduleUsernameSuggestions();
  }

  /**
   * Check whether the current editor mode accepts account-handle suggestions.
   *
   * @returns {boolean}
   */
  #isHandleEditorMode() {
    if (!this.editorState) {
      return false;
    }

    return ['username', 'verified-whitelist'].includes(this.editorState.mode);
  }

  /**
   * Handle suggestion keyboard navigation inside username editor mode.
   *
   * @param {KeyboardEvent} event - Keyboard event.
   */
  #onEditorKeydown(event) {
    if (
      !this.#isHandleEditorMode() ||
      !this.editorSuggestions ||
      this.editorSuggestions.length === 0
    ) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.editorSuggestionFocusIndex =
        (this.editorSuggestionFocusIndex + 1) % this.editorSuggestions.length;
      this.#renderEditorSuggestions();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.editorSuggestionFocusIndex =
        (this.editorSuggestionFocusIndex - 1 + this.editorSuggestions.length) %
        this.editorSuggestions.length;
      this.#renderEditorSuggestions();
      return;
    }

    if (event.key === 'Enter' && this.editorSuggestionFocusIndex >= 0) {
      event.preventDefault();
      this.#applyUsernameSuggestionFromIndex(this.editorSuggestionFocusIndex);
      return;
    }

    if (event.key === 'Escape') {
      this.#clearEditorSuggestions();
    }
  }

  /**
   * Debounce suggestion fetching so typing remains responsive.
   */
  #scheduleUsernameSuggestions() {
    if (this.pendingSuggestionTimeoutId !== null) {
      clearTimeout(this.pendingSuggestionTimeoutId);
      this.pendingSuggestionTimeoutId = null;
    }

    const searchQuery = this.#resolveUsernameSuggestionQuery();
    if (searchQuery === null) {
      this.#clearEditorSuggestions();
      return;
    }

    const requestId = ++this.suggestionRequestSequence;
    this.pendingSuggestionTimeoutId = setTimeout(() => {
      this.pendingSuggestionTimeoutId = null;
      void this.#loadUsernameSuggestions(searchQuery, requestId);
    }, USERNAME_SUGGESTION_DEBOUNCE_MS);
  }

  /**
   * Query suggestion provider and discard stale response payloads.
   *
   * @param {string} searchQuery - Normalized query token.
   * @param {number} requestId - Monotonic request id.
   * @returns {Promise<void>}
   */
  async #loadUsernameSuggestions(searchQuery, requestId) {
    if (!this.#isHandleEditorMode()) {
      return;
    }

    if (!this.accountSearchClient) {
      this.#clearEditorSuggestions();
      return;
    }

    try {
      const suggestions = await this.accountSearchClient.searchMentionCandidates(searchQuery);
      if (requestId !== this.suggestionRequestSequence) {
        return;
      }

      this.editorSuggestions = Array.isArray(suggestions) ? suggestions.slice(0, 8) : [];
      this.editorSuggestionFocusIndex = this.editorSuggestions.length > 0 ? 0 : -1;
      this.#renderEditorSuggestions();
    } catch (_error) {
      if (requestId !== this.suggestionRequestSequence) {
        return;
      }
      this.#clearEditorSuggestions();
    }
  }

  /**
   * Resolve current username token from the editor input.
   *
   * @returns {string | null}
   */
  #resolveUsernameSuggestionQuery() {
    if (!this.editorInputElement) {
      return null;
    }

    const inputValue = String(this.editorInputElement.value || '');
    const segments = inputValue.split(',');
    const activeSegment = segments.length > 0 ? String(segments[segments.length - 1]).trim() : '';
    if (!activeSegment.startsWith('@')) {
      return null;
    }

    return normalizeHandle(activeSegment);
  }

  /**
   * Render suggestion list buttons for the active username query.
   */
  #renderEditorSuggestions() {
    if (!this.editorSuggestionListElement || !this.editorSuggestionOverlayElement) {
      return;
    }

    this.editorSuggestionListElement.textContent = '';
    if (
      !this.#isHandleEditorMode() ||
      !Array.isArray(this.editorSuggestions) ||
      this.editorSuggestions.length === 0
    ) {
      this.editorSuggestionListElement.hidden = true;
      this.editorSuggestionOverlayElement.hidden = true;
      return;
    }

    for (let index = 0; index < this.editorSuggestions.length; index += 1) {
      const suggestion = this.editorSuggestions[index];
      const suggestionButton = document.createElement('button');
      suggestionButton.type = 'button';
      suggestionButton.className = 'btf-suggestion-item';
      suggestionButton.setAttribute('data-btf-action', ACTIONS.editorSuggestionPick);
      suggestionButton.setAttribute('data-suggestion-index', String(index));
      suggestionButton.setAttribute(
        'aria-selected',
        String(index === this.editorSuggestionFocusIndex)
      );

      const suggestionMain = document.createElement('span');
      suggestionMain.className = 'btf-suggestion-main';
      if (suggestion.profilePictureUrl) {
        const avatarImage = document.createElement('img');
        avatarImage.className = 'btf-suggestion-avatar';
        avatarImage.src = suggestion.profilePictureUrl;
        avatarImage.alt = '';
        suggestionMain.appendChild(avatarImage);
      } else {
        const avatarPlaceholder = document.createElement('span');
        avatarPlaceholder.className = 'btf-suggestion-avatar btf-suggestion-avatar-placeholder';
        avatarPlaceholder.textContent = '@';
        suggestionMain.appendChild(avatarPlaceholder);
      }

      const suggestionMeta = document.createElement('span');
      suggestionMeta.className = 'btf-suggestion-meta';
      const handleElement = document.createElement('span');
      handleElement.className = 'btf-suggestion-handle';
      handleElement.textContent = `@${suggestion.handle}`;
      const nameElement = document.createElement('span');
      nameElement.className = 'btf-suggestion-name';
      nameElement.textContent = suggestion.displayName || `@${suggestion.handle}`;
      suggestionMeta.appendChild(handleElement);
      suggestionMeta.appendChild(nameElement);
      suggestionMain.appendChild(suggestionMeta);

      suggestionButton.appendChild(suggestionMain);
      if (suggestion.isVerified === true) {
        const badgeElement = document.createElement('span');
        badgeElement.className = 'btf-suggestion-badge';
        badgeElement.textContent = 'Verified';
        suggestionButton.appendChild(badgeElement);
      }

      this.editorSuggestionListElement.appendChild(suggestionButton);
    }

    this.editorSuggestionListElement.hidden = false;
    this.#syncSuggestionOverlayPosition();
  }

  /**
   * Hide and reset suggestion state after selection or mode switch.
   */
  #clearEditorSuggestions() {
    this.editorSuggestions = [];
    this.editorSuggestionFocusIndex = -1;
    if (this.editorSuggestionListElement) {
      this.editorSuggestionListElement.textContent = '';
      this.editorSuggestionListElement.hidden = true;
    }
    if (this.editorSuggestionOverlayElement) {
      this.editorSuggestionOverlayElement.hidden = true;
    }
  }

  /**
   * Position suggestion overlay near the username input without reflowing modal layout.
   */
  #syncSuggestionOverlayPosition() {
    if (
      !this.editorSuggestionOverlayElement ||
      !this.editorSuggestionListElement ||
      !this.editorInputElement ||
      this.editorSuggestionListElement.hidden
    ) {
      return;
    }

    const panelElement = this.editorSuggestionOverlayElement.firstElementChild;
    if (!(panelElement instanceof HTMLElement)) {
      return;
    }

    const viewportPadding = 12;
    const inputRect = this.editorInputElement.getBoundingClientRect();
    const desiredWidth = 280;
    const panelWidth = Math.min(
      window.innerWidth - viewportPadding * 2,
      Math.max(220, Math.min(desiredWidth, inputRect.width || desiredWidth))
    );
    panelElement.style.width = `${Math.round(panelWidth)}px`;

    let left = inputRect.left;
    if (left + panelWidth > window.innerWidth - viewportPadding) {
      left = window.innerWidth - panelWidth - viewportPadding;
    }
    if (left < viewportPadding) {
      left = viewportPadding;
    }

    const estimatedHeight = Math.min(285, this.editorSuggestions.length * 63 || 63);
    let top = Math.max(viewportPadding, inputRect.bottom - 1);
    if (top + estimatedHeight > window.innerHeight - viewportPadding) {
      const aboveTop = inputRect.top - estimatedHeight - 1;
      if (aboveTop >= viewportPadding) {
        top = aboveTop;
      }
    }

    this.editorSuggestionOverlayElement.style.left = `${Math.round(left)}px`;
    this.editorSuggestionOverlayElement.style.top = `${Math.round(top)}px`;
    this.editorSuggestionOverlayElement.hidden = false;
  }

  /**
   * Insert one selected suggestion into the editor input list.
   *
   * @param {number} suggestionIndex - Suggestion index.
   */
  #applyUsernameSuggestionFromIndex(suggestionIndex) {
    if (
      !this.editorInputElement ||
      !Array.isArray(this.editorSuggestions) ||
      suggestionIndex < 0 ||
      suggestionIndex >= this.editorSuggestions.length
    ) {
      return;
    }

    const selectedSuggestion = this.editorSuggestions[suggestionIndex];
    if (!selectedSuggestion || !selectedSuggestion.handle) {
      return;
    }

    const inputValue = String(this.editorInputElement.value || '');
    const segments = inputValue.split(',');
    const committedValue = segments.slice(0, -1).join(',');
    const existingHandles = splitCommaSeparatedList(committedValue)
      .map((value) => normalizeHandle(value))
      .filter(Boolean);
    const nextHandles = dedupeHandles([...existingHandles, selectedSuggestion.handle]);
    const nextDisplayValue = joinCommaSeparatedList(nextHandles.map((handle) => `@${handle}`));
    this.editorInputElement.value = nextDisplayValue ? `${nextDisplayValue}, ` : '';
    this.#syncEditorDirtyState();

    this.#clearEditorSuggestions();
    this.editorInputElement.focus();
  }

  /**
   * Save menu form state and close when persistence succeeds.
   *
   * @param {Event} [event] - Optional submit event.
   * @returns {Promise<void>}
   */
  async #saveAndCloseFromForm(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const wasSaved = await this.#saveSettingsFromForm();
    if (wasSaved) {
      this.close();
    }
  }

  /**
   * Save menu form state and propagate live updates.
   *
   * @returns {Promise<boolean>}
   */
  async #saveSettingsFromForm() {
    if (!this.isDirty) {
      return true;
    }

    if (
      !this.verifiedToggleElement ||
      !this.verifiedBadgeToggleElement ||
      !this.aiLabelToggleElement ||
      !this.suggestedFollowToggleElement ||
      !this.trendingHideAllToggleElement
    ) {
      return false;
    }

    this.#setStatusMessage('Saving...');
    try {
      const baselineSettings = this.latestSettings || (await this.settingsStore.load());
      const enabledNotInterestedEntries = this.draftPhraseEntries
        .filter((entry) =>
          this.draftPhraseNotInterestedKeys.has(buildPhraseEntryKey(entry.pattern, entry.isRegex))
        )
        .map((entry) => ({
          pattern: entry.pattern,
          isRegex: entry.isRegex,
        }));
      const enabledNotInterestedPatterns = Array.from(
        new Set(enabledNotInterestedEntries.map((entry) => entry.pattern))
      );
      const enabledUsernameNotInterestedHandles = this.draftUserHandles.filter((handle) =>
        this.draftUserNotInterestedHandles.has(normalizeHandle(handle))
      );
      const enabledTrendingNotInterestedTopics = this.draftTrendingTopics.filter((topic) =>
        this.draftTrendingNotInterestedTopics.has(normalizeTopic(topic))
      );
      const nextSettings = {
        ...baselineSettings,
        filters: {
          ...baselineSettings.filters,
          verified: {
            ...baselineSettings.filters.verified,
            enabled: this.verifiedToggleElement.checked,
            hideBadges: this.verifiedBadgeToggleElement.checked,
            whitelistHandles: [...this.draftVerifiedWhitelistHandles],
          },
          aiLabel: {
            ...baselineSettings.filters.aiLabel,
            enabled: this.aiLabelToggleElement.checked,
          },
          suggestedFollow: {
            ...baselineSettings.filters.suggestedFollow,
            enabled: this.suggestedFollowToggleElement.checked,
          },
          trending: {
            ...baselineSettings.filters.trending,
            hideAll: this.trendingHideAllToggleElement.checked,
            blockedTopics: [...this.draftTrendingTopics],
            notInterested: {
              ...(baselineSettings.filters.trending.notInterested || {}),
              enabledTopics: enabledTrendingNotInterestedTopics,
            },
          },
          phrase: {
            ...baselineSettings.filters.phrase,
            enabled: true,
            entries: this.draftPhraseEntries.map((entry) => ({
              pattern: entry.pattern,
              isRegex: entry.isRegex,
            })),
            notInterested: {
              ...(baselineSettings.filters.phrase.notInterested || {}),
              enabledEntries: enabledNotInterestedEntries,
              enabledPatterns: enabledNotInterestedPatterns,
            },
          },
          username: {
            ...baselineSettings.filters.username,
            enabled: true,
            blockedHandles: [...this.draftUserHandles],
            notInterested: {
              ...(baselineSettings.filters.username.notInterested || {}),
              enabledHandles: enabledUsernameNotInterestedHandles,
            },
          },
        },
      };

      const normalizedSettings = await this.settingsStore.save(nextSettings);
      this.latestSettings = normalizedSettings;
      this.#populateForm(normalizedSettings);
      this.#setStatusMessage('Saved.');
      if (this.onSettingsUpdated) {
        this.onSettingsUpdated(normalizedSettings);
      }
      this.logger.info?.('Saved settings through menu.');
      return true;
    } catch (error) {
      this.logger.error?.('Failed to save settings through menu.', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.#setStatusMessage('Failed to save. Try again.');
      return false;
    }
  }

  /**
   * Discard unsaved draft changes and close the settings dialog.
   */
  #discardAndClose() {
    if (this.latestSettings) {
      this.#populateForm(this.latestSettings);
    }
    this.#setStatusMessage('');
    this.close();
  }

  /**
   * Hydrate controls from normalized settings snapshot.
   *
   * @param {object} settings - Normalized settings object.
   */
  #populateForm(settings) {
    if (
      !this.verifiedToggleElement ||
      !this.verifiedBadgeToggleElement ||
      !this.aiLabelToggleElement ||
      !this.suggestedFollowToggleElement ||
      !this.trendingHideAllToggleElement
    ) {
      return;
    }

    this.verifiedToggleElement.checked = Boolean(
      settings &&
      settings.filters &&
      settings.filters.verified &&
      settings.filters.verified.enabled === true
    );
    this.#syncSwitchAriaState(this.verifiedToggleElement);
    this.verifiedBadgeToggleElement.checked = Boolean(
      settings &&
      settings.filters &&
      settings.filters.verified &&
      settings.filters.verified.hideBadges === true
    );
    this.#syncSwitchAriaState(this.verifiedBadgeToggleElement);
    this.aiLabelToggleElement.checked = Boolean(
      settings &&
      settings.filters &&
      settings.filters.aiLabel &&
      settings.filters.aiLabel.enabled === true
    );
    this.#syncSwitchAriaState(this.aiLabelToggleElement);
    this.suggestedFollowToggleElement.checked = Boolean(
      settings &&
      settings.filters &&
      settings.filters.suggestedFollow &&
      settings.filters.suggestedFollow.enabled === true
    );
    this.#syncSwitchAriaState(this.suggestedFollowToggleElement);
    this.trendingHideAllToggleElement.checked = Boolean(
      settings &&
      settings.filters &&
      settings.filters.trending &&
      settings.filters.trending.hideAll === true
    );
    this.#syncSwitchAriaState(this.trendingHideAllToggleElement);
    this.draftPhraseEntries = resolvePhraseEntries(settings);
    this.draftPhraseNotInterestedKeys = resolvePhraseNotInterestedKeys(
      settings,
      this.draftPhraseEntries
    );
    this.#prunePhraseNotInterestedKeys();
    this.draftUserHandles = dedupeHandles(
      settings &&
        settings.filters &&
        settings.filters.username &&
        Array.isArray(settings.filters.username.blockedHandles)
        ? settings.filters.username.blockedHandles
        : []
    );
    this.draftUserNotInterestedHandles = resolveUserNotInterestedHandles(
      settings,
      this.draftUserHandles
    );
    this.#pruneUserNotInterestedHandles();
    this.draftVerifiedWhitelistHandles = dedupeHandles(
      settings &&
        settings.filters &&
        settings.filters.verified &&
        Array.isArray(settings.filters.verified.whitelistHandles)
        ? settings.filters.verified.whitelistHandles
        : []
    );
    this.draftTrendingTopics = dedupeTrendingTopics(
      settings &&
        settings.filters &&
        settings.filters.trending &&
        Array.isArray(settings.filters.trending.blockedTopics)
        ? settings.filters.trending.blockedTopics
        : []
    );
    this.draftTrendingNotInterestedTopics = resolveTrendingNotInterestedTopics(
      settings,
      this.draftTrendingTopics
    );
    this.#pruneTrendingNotInterestedTopics();
    this.#renderPhraseEntryChips();
    this.#renderUserHandleChips();
    this.#renderVerifiedWhitelistHandleChips();
    this.#renderTrendingTopicChips();
    this.#closeEditorModal();
    this.#closeConfirmModal();
    this.#closeAboutModal();
    this.#syncDirtyState({ resetBaseline: true });
  }

  /**
   * Render phrase entries as clickable edit chips.
   */
  #renderPhraseEntryChips() {
    if (!this.phraseListElement) {
      return;
    }

    this.phraseListElement.textContent = '';
    if (this.draftPhraseEntries.length === 0) {
      const emptyElement = document.createElement('span');
      emptyElement.className = 'btf-empty-list';
      emptyElement.textContent = 'No phrases configured.';
      this.phraseListElement.appendChild(emptyElement);
      return;
    }

    for (let index = 0; index < this.draftPhraseEntries.length; index += 1) {
      const entry = this.draftPhraseEntries[index];
      const chipButton = document.createElement('button');
      chipButton.type = 'button';
      chipButton.className = 'btf-chip';
      chipButton.setAttribute('data-btf-action', ACTIONS.phraseChip);
      chipButton.setAttribute('data-entry-index', String(index));
      chipButton.textContent = entry.pattern;
      chipButton.title = `Edit phrase: ${entry.pattern}`;
      if (entry.isRegex) {
        const metaElement = document.createElement('span');
        metaElement.className = 'btf-chip-meta';
        metaElement.textContent = 'Regex';
        chipButton.appendChild(metaElement);
      }
      if (
        this.draftPhraseNotInterestedKeys.has(buildPhraseEntryKey(entry.pattern, entry.isRegex))
      ) {
        const metaElement = document.createElement('span');
        metaElement.className = 'btf-chip-meta';
        metaElement.textContent = 'NI';
        chipButton.appendChild(metaElement);
      }
      this.phraseListElement.appendChild(chipButton);
    }
  }

  /**
   * Keep phrase not-interested keys aligned to the current phrase draft list.
   */
  #prunePhraseNotInterestedKeys() {
    const validKeys = new Set(
      this.draftPhraseEntries.map((entry) => buildPhraseEntryKey(entry.pattern, entry.isRegex))
    );
    this.draftPhraseNotInterestedKeys = new Set(
      Array.from(this.draftPhraseNotInterestedKeys).filter((entryKey) => validKeys.has(entryKey))
    );
  }

  /**
   * Keep username not-interested handles aligned to blocked username drafts.
   */
  #pruneUserNotInterestedHandles() {
    const blockedHandleSet = new Set(
      this.draftUserHandles.map((handle) => normalizeHandle(handle))
    );
    this.draftUserNotInterestedHandles = new Set(
      Array.from(this.draftUserNotInterestedHandles).filter((handle) =>
        blockedHandleSet.has(normalizeHandle(handle))
      )
    );
  }

  /**
   * Keep trending-topic not-interested values aligned to blocked topic drafts.
   */
  #pruneTrendingNotInterestedTopics() {
    const blockedTopicSet = new Set(this.draftTrendingTopics.map((topic) => normalizeTopic(topic)));
    this.draftTrendingNotInterestedTopics = new Set(
      Array.from(this.draftTrendingNotInterestedTopics).filter((topic) =>
        blockedTopicSet.has(normalizeTopic(topic))
      )
    );
  }

  /**
   * Render blocked usernames as clickable removal chips.
   */
  #renderUserHandleChips() {
    if (!this.userListElement) {
      return;
    }

    this.userListElement.textContent = '';
    if (this.draftUserHandles.length === 0) {
      const emptyElement = document.createElement('span');
      emptyElement.className = 'btf-empty-list';
      emptyElement.textContent = 'No usernames configured.';
      this.userListElement.appendChild(emptyElement);
      return;
    }

    for (let index = 0; index < this.draftUserHandles.length; index += 1) {
      const handle = this.draftUserHandles[index];
      const chipButton = document.createElement('button');
      chipButton.type = 'button';
      chipButton.className = 'btf-chip';
      chipButton.setAttribute('data-btf-action', ACTIONS.userChip);
      chipButton.setAttribute('data-entry-index', String(index));
      chipButton.textContent = `@${handle}`;
      chipButton.title = `Remove ${handle}`;
      if (this.draftUserNotInterestedHandles.has(handle)) {
        const metaElement = document.createElement('span');
        metaElement.className = 'btf-chip-meta';
        metaElement.textContent = 'NI';
        chipButton.appendChild(metaElement);
      }
      this.userListElement.appendChild(chipButton);
    }
  }

  /**
   * Render verified-whitelist handles as removable chips.
   */
  #renderVerifiedWhitelistHandleChips() {
    if (!this.verifiedWhitelistListElement) {
      return;
    }

    this.verifiedWhitelistListElement.textContent = '';
    if (this.draftVerifiedWhitelistHandles.length === 0) {
      const emptyElement = document.createElement('span');
      emptyElement.className = 'btf-empty-list';
      emptyElement.textContent = 'No verified handles whitelisted.';
      this.verifiedWhitelistListElement.appendChild(emptyElement);
      return;
    }

    for (let index = 0; index < this.draftVerifiedWhitelistHandles.length; index += 1) {
      const handle = this.draftVerifiedWhitelistHandles[index];
      const chipButton = document.createElement('button');
      chipButton.type = 'button';
      chipButton.className = 'btf-chip';
      chipButton.setAttribute('data-btf-action', ACTIONS.verifiedWhitelistChip);
      chipButton.setAttribute('data-entry-index', String(index));
      chipButton.textContent = `@${handle}`;
      chipButton.title = `Remove @${handle} from verified whitelist`;
      this.verifiedWhitelistListElement.appendChild(chipButton);
    }
  }

  /**
   * Render blocked trending topics as clickable removal chips.
   */
  #renderTrendingTopicChips() {
    if (!this.trendingTopicListElement) {
      return;
    }

    this.trendingTopicListElement.textContent = '';
    if (this.draftTrendingTopics.length === 0) {
      const emptyElement = document.createElement('span');
      emptyElement.className = 'btf-empty-list';
      emptyElement.textContent = 'No trending topics configured.';
      this.trendingTopicListElement.appendChild(emptyElement);
      return;
    }

    for (let index = 0; index < this.draftTrendingTopics.length; index += 1) {
      const topic = this.draftTrendingTopics[index];
      const chipButton = document.createElement('button');
      chipButton.type = 'button';
      chipButton.className = 'btf-chip';
      chipButton.setAttribute('data-btf-action', ACTIONS.trendingTopicChip);
      chipButton.setAttribute('data-entry-index', String(index));
      chipButton.textContent = topic;
      chipButton.title = `Remove trending topic: ${topic}`;
      if (this.draftTrendingNotInterestedTopics.has(topic)) {
        const metaElement = document.createElement('span');
        metaElement.className = 'btf-chip-meta';
        metaElement.textContent = 'NI';
        chipButton.appendChild(metaElement);
      }
      this.trendingTopicListElement.appendChild(chipButton);
    }
  }

  /**
   * Open phrase entry editor for add or edit mode.
   *
   * @param {number | null} [entryIndex=null] - Existing phrase index to edit.
   */
  #openPhraseEditor(entryIndex = null) {
    if (
      !this.editorModalElement ||
      !this.editorTitleElement ||
      !this.editorSubtitleElement ||
      !this.editorInputElement ||
      !this.editorRegexRowElement ||
      !this.editorRegexToggleElement ||
      !this.editorNotInterestedRowElement ||
      !this.editorNotInterestedLabelElement ||
      !this.editorNotInterestedToggleElement ||
      !this.editorSubmitButtonElement ||
      !this.editorDeleteButtonElement
    ) {
      return;
    }

    const existingEntry =
      Number.isInteger(entryIndex) && entryIndex >= 0 ? this.draftPhraseEntries[entryIndex] : null;
    const isEditMode = Boolean(existingEntry);
    this.editorState = {
      mode: 'phrase',
      entryIndex: isEditMode ? entryIndex : null,
    };
    this.editorTitleElement.textContent = isEditMode ? 'Edit phrase filter' : 'Add phrase filter';
    this.editorSubtitleElement.textContent =
      'Use regex mode only when needed, and optionally auto-send Not Interested for matches.';
    this.#refreshEditorInputAutofillSuppression();
    this.editorInputElement.placeholder = 'Type phrase or regex pattern';
    this.editorInputElement.value = isEditMode ? existingEntry.pattern : '';
    this.editorRegexToggleElement.checked = isEditMode ? existingEntry.isRegex : false;
    this.#syncSwitchAriaState(this.editorRegexToggleElement);
    this.editorRegexToggleElement.disabled = false;
    this.editorRegexRowElement.hidden = false;
    this.editorNotInterestedToggleElement.checked = isEditMode
      ? this.draftPhraseNotInterestedKeys.has(
          buildPhraseEntryKey(existingEntry.pattern, existingEntry.isRegex)
        )
      : false;
    this.#syncSwitchAriaState(this.editorNotInterestedToggleElement);
    this.editorNotInterestedToggleElement.disabled = false;
    this.editorNotInterestedRowElement.hidden = false;
    this.editorNotInterestedLabelElement.textContent = 'Auto-send Not Interested on matching posts';
    this.editorSubmitButtonElement.textContent = isEditMode ? 'Save Phrase' : 'Add Phrase';
    this.editorDeleteButtonElement.hidden = !isEditMode;
    this.#clearEditorSuggestions();
    this.#syncEditorDirtyState({ resetBaseline: true });
    this.#setEditorStatus('');
    this.#closeConfirmModal();
    this.editorModalElement.hidden = false;
    this.editorInputElement.focus();
  }

  /**
   * Open username editor for adding one or more handles.
   */
  #openUserEditor() {
    if (
      !this.editorModalElement ||
      !this.editorTitleElement ||
      !this.editorSubtitleElement ||
      !this.editorInputElement ||
      !this.editorRegexRowElement ||
      !this.editorRegexToggleElement ||
      !this.editorNotInterestedRowElement ||
      !this.editorNotInterestedLabelElement ||
      !this.editorNotInterestedToggleElement ||
      !this.editorSubmitButtonElement ||
      !this.editorDeleteButtonElement
    ) {
      return;
    }

    this.editorState = {
      mode: 'username',
      entryIndex: null,
    };
    this.editorTitleElement.textContent = 'Add filtered usernames';
    this.editorSubtitleElement.textContent =
      'Type @ to search and select usernames, or paste multiple handles separated by commas.';
    this.#refreshEditorInputAutofillSuppression();
    this.editorInputElement.placeholder = '@noisy_account, ads_bot';
    this.editorInputElement.value = '';
    this.editorRegexToggleElement.checked = false;
    this.#syncSwitchAriaState(this.editorRegexToggleElement);
    this.editorRegexToggleElement.disabled = true;
    this.editorRegexRowElement.hidden = true;
    this.editorNotInterestedToggleElement.checked = false;
    this.#syncSwitchAriaState(this.editorNotInterestedToggleElement);
    this.editorNotInterestedToggleElement.disabled = false;
    this.editorNotInterestedRowElement.hidden = false;
    this.editorNotInterestedLabelElement.textContent =
      'Auto-send Not Interested for added usernames';
    this.editorSubmitButtonElement.textContent = 'Add Users';
    this.editorDeleteButtonElement.hidden = true;
    this.#clearEditorSuggestions();
    this.#syncEditorDirtyState({ resetBaseline: true });
    this.#setEditorStatus('');
    this.#closeConfirmModal();
    this.editorModalElement.hidden = false;
    this.editorInputElement.focus();
  }

  /**
   * Open verified-whitelist editor for adding one or more trusted handles.
   */
  #openVerifiedWhitelistEditor() {
    if (
      !this.editorModalElement ||
      !this.editorTitleElement ||
      !this.editorSubtitleElement ||
      !this.editorInputElement ||
      !this.editorRegexRowElement ||
      !this.editorRegexToggleElement ||
      !this.editorNotInterestedRowElement ||
      !this.editorNotInterestedLabelElement ||
      !this.editorNotInterestedToggleElement ||
      !this.editorSubmitButtonElement ||
      !this.editorDeleteButtonElement
    ) {
      return;
    }

    this.editorState = {
      mode: 'verified-whitelist',
      entryIndex: null,
    };
    this.editorTitleElement.textContent = 'Add verified whitelist handles';
    this.editorSubtitleElement.textContent =
      'Type @ to search and select handles that should bypass verified filtering.';
    this.#refreshEditorInputAutofillSuppression();
    this.editorInputElement.placeholder = '@trusted_account, @favorite_creator';
    this.editorInputElement.value = '';
    this.editorRegexToggleElement.checked = false;
    this.#syncSwitchAriaState(this.editorRegexToggleElement);
    this.editorRegexToggleElement.disabled = true;
    this.editorRegexRowElement.hidden = true;
    this.editorNotInterestedToggleElement.checked = false;
    this.#syncSwitchAriaState(this.editorNotInterestedToggleElement);
    this.editorNotInterestedToggleElement.disabled = true;
    this.editorNotInterestedRowElement.hidden = true;
    this.editorNotInterestedLabelElement.textContent = 'Auto-send Not Interested on matching posts';
    this.editorSubmitButtonElement.textContent = 'Add Handles';
    this.editorDeleteButtonElement.hidden = true;
    this.#clearEditorSuggestions();
    this.#syncEditorDirtyState({ resetBaseline: true });
    this.#setEditorStatus('');
    this.#closeConfirmModal();
    this.editorModalElement.hidden = false;
    this.editorInputElement.focus();
  }

  /**
   * Open trending-topic editor for adding one or more topic labels.
   */
  #openTrendingTopicEditor() {
    if (
      !this.editorModalElement ||
      !this.editorTitleElement ||
      !this.editorSubtitleElement ||
      !this.editorInputElement ||
      !this.editorRegexRowElement ||
      !this.editorRegexToggleElement ||
      !this.editorNotInterestedRowElement ||
      !this.editorNotInterestedLabelElement ||
      !this.editorNotInterestedToggleElement ||
      !this.editorSubmitButtonElement ||
      !this.editorDeleteButtonElement
    ) {
      return;
    }

    this.editorState = {
      mode: 'trending-topic',
      entryIndex: null,
    };
    this.editorTitleElement.textContent = 'Add trending topics';
    this.editorSubtitleElement.textContent =
      'Add one or more topic names separated by commas to filter matching trending posts.';
    this.#refreshEditorInputAutofillSuppression();
    this.editorInputElement.placeholder = 'daily deals, local events';
    this.editorInputElement.value = '';
    this.editorRegexToggleElement.checked = false;
    this.#syncSwitchAriaState(this.editorRegexToggleElement);
    this.editorRegexToggleElement.disabled = true;
    this.editorRegexRowElement.hidden = true;
    this.editorNotInterestedToggleElement.checked = false;
    this.#syncSwitchAriaState(this.editorNotInterestedToggleElement);
    this.editorNotInterestedToggleElement.disabled = false;
    this.editorNotInterestedRowElement.hidden = false;
    this.editorNotInterestedLabelElement.textContent = 'Auto-send Not Interested for added topics';
    this.editorSubmitButtonElement.textContent = 'Add Topics';
    this.editorDeleteButtonElement.hidden = true;
    this.#clearEditorSuggestions();
    this.#syncEditorDirtyState({ resetBaseline: true });
    this.#setEditorStatus('');
    this.#closeConfirmModal();
    this.editorModalElement.hidden = false;
    this.editorInputElement.focus();
  }

  /**
   * Apply pending editor state into phrase, trending-topic, and username drafts.
   */
  #applyEditorChanges() {
    if (
      !this.editorState ||
      !this.editorInputElement ||
      !this.editorRegexToggleElement ||
      !this.editorNotInterestedToggleElement
    ) {
      return;
    }

    if (this.editorState.mode === 'phrase') {
      const shouldSendNotInterested = this.editorNotInterestedToggleElement.checked === true;
      const nextEntry = normalizePhraseEntry(
        this.editorInputElement.value,
        this.editorRegexToggleElement.checked
      );
      if (!nextEntry) {
        this.#setEditorStatus('Enter a phrase or regex before saving.');
        return;
      }

      const nextEntries = [...this.draftPhraseEntries];
      let previousEntryKey = '';
      if (Number.isInteger(this.editorState.entryIndex)) {
        const previousEntry = nextEntries[this.editorState.entryIndex];
        previousEntryKey = previousEntry
          ? buildPhraseEntryKey(previousEntry.pattern, previousEntry.isRegex)
          : '';
        nextEntries[this.editorState.entryIndex] = nextEntry;
      } else {
        nextEntries.push(nextEntry);
      }

      this.draftPhraseEntries = dedupePhraseEntries(nextEntries);
      const nextEntryKey = buildPhraseEntryKey(nextEntry.pattern, nextEntry.isRegex);
      if (previousEntryKey) {
        this.draftPhraseNotInterestedKeys.delete(previousEntryKey);
      }
      if (shouldSendNotInterested) {
        this.draftPhraseNotInterestedKeys.add(nextEntryKey);
      } else if (previousEntryKey) {
        this.draftPhraseNotInterestedKeys.delete(nextEntryKey);
      }
      this.#prunePhraseNotInterestedKeys();
      this.#renderPhraseEntryChips();
      this.#syncDirtyState();
      this.#closeEditorModal();
      this.#setStatusMessage('Phrase filters updated. Save & Close to apply.');
      return;
    }

    if (this.editorState.mode === 'trending-topic') {
      const shouldSendNotInterested = this.editorNotInterestedToggleElement.checked === true;
      const pendingTopics = dedupeTrendingTopics(
        splitCommaSeparatedList(this.editorInputElement.value)
      );
      if (pendingTopics.length === 0) {
        this.#setEditorStatus('Enter at least one trending topic before saving.');
        return;
      }

      this.draftTrendingTopics = dedupeTrendingTopics([
        ...this.draftTrendingTopics,
        ...pendingTopics,
      ]);
      for (const topic of pendingTopics) {
        if (shouldSendNotInterested) {
          this.draftTrendingNotInterestedTopics.add(topic);
        } else {
          this.draftTrendingNotInterestedTopics.delete(topic);
        }
      }
      this.#pruneTrendingNotInterestedTopics();
      this.#renderTrendingTopicChips();
      this.#syncDirtyState();
      this.#closeEditorModal();
      this.#setStatusMessage('Trending topic filters updated. Save & Close to apply.');
      return;
    }

    const pendingHandles = splitCommaSeparatedList(this.editorInputElement.value)
      .map((handle) => normalizeHandle(handle))
      .filter(Boolean);
    const shouldSendNotInterested = this.editorNotInterestedToggleElement.checked === true;
    if (pendingHandles.length === 0) {
      this.#setEditorStatus(
        this.editorState.mode === 'verified-whitelist'
          ? 'Enter at least one handle before saving.'
          : 'Enter at least one username before saving.'
      );
      return;
    }

    if (this.editorState.mode === 'username') {
      this.draftUserHandles = dedupeHandles([...this.draftUserHandles, ...pendingHandles]);
      for (const handle of pendingHandles) {
        if (shouldSendNotInterested) {
          this.draftUserNotInterestedHandles.add(handle);
        } else {
          this.draftUserNotInterestedHandles.delete(handle);
        }
      }
      this.#pruneUserNotInterestedHandles();
      this.#renderUserHandleChips();
      this.#syncDirtyState();
      this.#closeEditorModal();
      this.#setStatusMessage('Username filters updated. Save & Close to apply.');
      return;
    }

    if (this.editorState.mode === 'verified-whitelist') {
      this.draftVerifiedWhitelistHandles = dedupeHandles([
        ...this.draftVerifiedWhitelistHandles,
        ...pendingHandles,
      ]);
      this.#renderVerifiedWhitelistHandleChips();
      this.#syncDirtyState();
      this.#closeEditorModal();
      this.#setStatusMessage('Verified whitelist updated. Save & Close to apply.');
      return;
    }
  }

  /**
   * Remove currently edited phrase entry from draft state.
   */
  #removeCurrentPhraseEntry() {
    if (!this.editorState || this.editorState.mode !== 'phrase') {
      return;
    }

    if (!Number.isInteger(this.editorState.entryIndex)) {
      return;
    }

    const removedEntry = this.draftPhraseEntries[this.editorState.entryIndex];
    if (removedEntry) {
      this.draftPhraseNotInterestedKeys.delete(
        buildPhraseEntryKey(removedEntry.pattern, removedEntry.isRegex)
      );
    }
    this.draftPhraseEntries = this.draftPhraseEntries.filter(
      (_entry, index) => index !== this.editorState.entryIndex
    );
    this.#prunePhraseNotInterestedKeys();
    this.#renderPhraseEntryChips();
    this.#syncDirtyState();
    this.#closeEditorModal();
    this.#setStatusMessage('Phrase filter removed. Save & Close to apply.');
  }

  /**
   * Open handle-removal confirmation modal for one managed list.
   *
   * @param {number} entryIndex - Handle entry index.
   * @param {'username' | 'verified-whitelist' | 'trending-topic'} listName - Handle list identifier.
   */
  #openHandleRemovalConfirm(entryIndex, listName) {
    if (!this.confirmModalElement || !this.confirmMessageElement) {
      return;
    }

    const sourceList =
      listName === 'verified-whitelist'
        ? this.draftVerifiedWhitelistHandles
        : listName === 'trending-topic'
          ? this.draftTrendingTopics
          : this.draftUserHandles;
    const selectedHandle = sourceList[entryIndex];
    if (!selectedHandle) {
      return;
    }

    this.pendingHandleRemoval = {
      list: listName,
      handle: selectedHandle,
    };
    this.confirmMessageElement.textContent =
      listName === 'verified-whitelist'
        ? `Remove @${selectedHandle} from verified whitelist?`
        : listName === 'trending-topic'
          ? `Remove "${selectedHandle}" from trending topic filters?`
          : `Remove @${selectedHandle} from filtered usernames?`;
    this.confirmModalElement.hidden = false;
  }

  /**
   * Remove the selected handle from its pending list context.
   */
  #confirmHandleRemoval() {
    const removalKey =
      this.pendingHandleRemoval.list === 'trending-topic'
        ? normalizeTopic(this.pendingHandleRemoval.handle)
        : normalizeHandle(this.pendingHandleRemoval.handle);
    if (!removalKey) {
      this.#closeConfirmModal();
      return;
    }

    if (this.pendingHandleRemoval.list === 'verified-whitelist') {
      this.draftVerifiedWhitelistHandles = this.draftVerifiedWhitelistHandles.filter(
        (handle) => normalizeHandle(handle) !== removalKey
      );
      this.#renderVerifiedWhitelistHandleChips();
      this.#syncDirtyState();
      this.#closeConfirmModal();
      this.#setStatusMessage('Verified whitelist handle removed. Save & Close to apply.');
      return;
    }

    if (this.pendingHandleRemoval.list === 'trending-topic') {
      this.draftTrendingTopics = this.draftTrendingTopics.filter(
        (topic) => normalizeTopic(topic) !== removalKey
      );
      this.draftTrendingNotInterestedTopics.delete(removalKey);
      this.#pruneTrendingNotInterestedTopics();
      this.#renderTrendingTopicChips();
      this.#syncDirtyState();
      this.#closeConfirmModal();
      this.#setStatusMessage('Trending topic filter removed. Save & Close to apply.');
      return;
    }

    this.draftUserHandles = this.draftUserHandles.filter(
      (handle) => normalizeHandle(handle) !== removalKey
    );
    this.draftUserNotInterestedHandles.delete(removalKey);
    this.#pruneUserNotInterestedHandles();
    this.#renderUserHandleChips();
    this.#syncDirtyState();
    this.#closeConfirmModal();
    this.#setStatusMessage('Username filter removed. Save & Close to apply.');
  }

  /**
   * Open About modal from header trigger.
   */
  #openAboutModal() {
    if (!this.aboutModalElement) {
      return;
    }

    this.#closeEditorModal();
    this.#closeConfirmModal();
    this.aboutModalElement.hidden = false;
  }

  /**
   * Close editor modal and reset transient editor state.
   */
  #closeEditorModal() {
    if (!this.editorModalElement) {
      return;
    }

    this.editorModalElement.hidden = true;
    if (this.pendingSuggestionTimeoutId !== null) {
      clearTimeout(this.pendingSuggestionTimeoutId);
      this.pendingSuggestionTimeoutId = null;
    }
    this.#clearEditorSuggestions();
    this.editorState = null;
    this.editorBaselineSnapshot = '';
    this.editorIsDirty = false;
    this.#setEditorActionSetState(false);
    this.#setEditorStatus('');
  }

  /**
   * Rotate input identity and attributes to discourage browser history suggestions.
   */
  #refreshEditorInputAutofillSuppression() {
    if (!this.editorFormElement || !this.editorInputElement) {
      return;
    }

    this.editorInputNameSequence += 1;
    this.editorFormElement.setAttribute('autocomplete', 'off');
    this.editorInputElement.setAttribute(
      'name',
      `${EDITOR_INPUT_NAME_PREFIX}-${this.editorInputNameSequence}`
    );
    this.editorInputElement.setAttribute('autocomplete', 'off');
    this.editorInputElement.setAttribute('autocorrect', 'off');
    this.editorInputElement.setAttribute('autocapitalize', 'off');
    this.editorInputElement.setAttribute('spellcheck', 'false');
    this.editorInputElement.setAttribute('inputmode', 'text');
  }

  /**
   * Close confirmation modal and clear pending removal state.
   */
  #closeConfirmModal() {
    if (this.confirmModalElement) {
      this.confirmModalElement.hidden = true;
    }
    this.pendingHandleRemoval = {
      list: '',
      handle: '',
    };
  }

  /**
   * Close About modal.
   */
  #closeAboutModal() {
    if (this.aboutModalElement) {
      this.aboutModalElement.hidden = true;
    }
  }

  /**
   * Determine whether the editor modal is currently open.
   *
   * @returns {boolean}
   */
  #isEditorOpen() {
    return Boolean(this.editorModalElement && this.editorModalElement.hidden === false);
  }

  /**
   * Determine whether the confirmation modal is currently open.
   *
   * @returns {boolean}
   */
  #isConfirmOpen() {
    return Boolean(this.confirmModalElement && this.confirmModalElement.hidden === false);
  }

  /**
   * Determine whether the About modal is currently open.
   *
   * @returns {boolean}
   */
  #isAboutOpen() {
    return Boolean(this.aboutModalElement && this.aboutModalElement.hidden === false);
  }

  /**
   * Synchronize editor action buttons from current editor draft state.
   *
   * @param {{ resetBaseline?: boolean }} [options] - Dirty-state options.
   */
  #syncEditorDirtyState(options = {}) {
    if (!this.editorState) {
      this.editorBaselineSnapshot = '';
      this.editorIsDirty = false;
      this.#setEditorActionSetState(false);
      return;
    }

    const currentSnapshot = this.#serializeCurrentEditorSnapshot();
    if (options.resetBaseline === true) {
      this.editorBaselineSnapshot = currentSnapshot;
    }

    this.editorIsDirty = currentSnapshot !== this.editorBaselineSnapshot;
    this.#setEditorActionSetState(this.editorIsDirty);
  }

  /**
   * Serialize one stable snapshot of the open editor draft state.
   *
   * @returns {string}
   */
  #serializeCurrentEditorSnapshot() {
    if (!this.editorState || !this.editorInputElement) {
      return '';
    }

    if (this.editorState.mode === 'phrase') {
      return JSON.stringify({
        mode: this.editorState.mode,
        entryIndex: Number.isInteger(this.editorState.entryIndex)
          ? this.editorState.entryIndex
          : -1,
        pattern: String(this.editorInputElement.value || '').trim(),
        isRegex: Boolean(this.editorRegexToggleElement && this.editorRegexToggleElement.checked),
        shouldSendNotInterested: Boolean(
          this.editorNotInterestedToggleElement && this.editorNotInterestedToggleElement.checked
        ),
      });
    }

    if (this.editorState.mode === 'username') {
      return JSON.stringify({
        mode: this.editorState.mode,
        handles: splitCommaSeparatedList(this.editorInputElement.value)
          .map((handle) => normalizeHandle(handle))
          .filter(Boolean),
        shouldSendNotInterested: Boolean(
          this.editorNotInterestedToggleElement && this.editorNotInterestedToggleElement.checked
        ),
      });
    }

    if (this.editorState.mode === 'trending-topic') {
      return JSON.stringify({
        mode: this.editorState.mode,
        topics: splitCommaSeparatedList(this.editorInputElement.value)
          .map((topic) => normalizeTopic(topic))
          .filter(Boolean),
        shouldSendNotInterested: Boolean(
          this.editorNotInterestedToggleElement && this.editorNotInterestedToggleElement.checked
        ),
      });
    }

    return JSON.stringify({
      mode: this.editorState.mode,
      handles: splitCommaSeparatedList(this.editorInputElement.value)
        .map((handle) => normalizeHandle(handle))
        .filter(Boolean),
    });
  }

  /**
   * Toggle clean/dirty editor action sets with animated transitions.
   *
   * @param {boolean} isDirty - Whether the open editor state differs from baseline.
   */
  #setEditorActionSetState(isDirty) {
    if (!this.editorCleanActionsElement || !this.editorDirtyActionsElement) {
      return;
    }

    this.editorCleanActionsElement.setAttribute('aria-hidden', String(isDirty));
    this.editorDirtyActionsElement.setAttribute('aria-hidden', String(!isDirty));
  }

  /**
   * Synchronize clean/dirty footer actions from current draft state.
   *
   * @param {{ resetBaseline?: boolean }} [options] - Dirty-state options.
   */
  #syncDirtyState(options = {}) {
    const currentSnapshot = this.#serializeCurrentDraftSnapshot();
    if (options.resetBaseline === true) {
      this.baselineSnapshot = currentSnapshot;
    }

    const isDirty = currentSnapshot !== this.baselineSnapshot;
    this.isDirty = isDirty;
    if (!this.cleanActionsElement || !this.dirtyActionsElement) {
      return;
    }

    this.cleanActionsElement.setAttribute('aria-hidden', String(isDirty));
    this.dirtyActionsElement.setAttribute('aria-hidden', String(!isDirty));
  }

  /**
   * Serialize current editable state into a stable dirty-check snapshot.
   *
   * @returns {string}
   */
  #serializeCurrentDraftSnapshot() {
    return JSON.stringify({
      verifiedEnabled: Boolean(this.verifiedToggleElement && this.verifiedToggleElement.checked),
      verifiedBadgeHidden: Boolean(
        this.verifiedBadgeToggleElement && this.verifiedBadgeToggleElement.checked
      ),
      aiLabelEnabled: Boolean(this.aiLabelToggleElement && this.aiLabelToggleElement.checked),
      suggestedFollowEnabled: Boolean(
        this.suggestedFollowToggleElement && this.suggestedFollowToggleElement.checked
      ),
      trendingHideAllEnabled: Boolean(
        this.trendingHideAllToggleElement && this.trendingHideAllToggleElement.checked
      ),
      trendingTopics: [...this.draftTrendingTopics],
      trendingNotInterestedTopics: Array.from(this.draftTrendingNotInterestedTopics).sort(),
      phraseEntries: this.draftPhraseEntries.map((entry) => ({
        pattern: String(entry.pattern || ''),
        isRegex: entry.isRegex === true,
      })),
      phraseNotInterestedKeys: Array.from(this.draftPhraseNotInterestedKeys).sort(),
      blockedHandles: [...this.draftUserHandles],
      userNotInterestedHandles: Array.from(this.draftUserNotInterestedHandles).sort(),
      verifiedWhitelistHandles: [...this.draftVerifiedWhitelistHandles],
    });
  }

  /**
   * Show editor feedback without mutating main status text.
   *
   * @param {string} value - User-facing editor status message.
   */
  #setEditorStatus(value) {
    if (!this.editorStatusElement) {
      return;
    }

    this.editorStatusElement.textContent = value;
  }

  /**
   * Keep switch aria state aligned with checkbox checked state.
   *
   * @param {HTMLInputElement | null} inputElement - Switch checkbox input.
   */
  #syncSwitchAriaState(inputElement) {
    if (!inputElement) {
      return;
    }

    inputElement.setAttribute('aria-checked', String(inputElement.checked));
  }

  /**
   * Show status feedback without interrupting host interactions.
   *
   * @param {string} value - User-facing status message.
   */
  #setStatusMessage(value) {
    if (!this.statusElement) {
      return;
    }

    this.statusElement.textContent = value;
  }
}

module.exports = {
  ThreadsSettingsMenu,
  joinCommaSeparatedList,
  splitCommaSeparatedList,
};
