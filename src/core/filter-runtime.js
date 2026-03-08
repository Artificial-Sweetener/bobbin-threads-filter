/**
 * @file Orchestrate settings, extraction, rule evaluation, and DOM updates.
 */

const { ActivityWatcher } = require('../dom/activity-watcher');
const { whenBodyReady } = require('../dom/body-ready');
const { MutationManager } = require('../dom/mutation-manager');
const { StyleManager } = require('../dom/style-manager');
const { ThreadsFeedAdapter } = require('../dom/threads-feed-adapter');
const { FilterRuleEngine } = require('../filters/rule-engine');
const { Logger } = require('../observability/logger');
const { NotInterestedDispatcher } = require('../signals/not-interested-dispatcher');
const { ThreadsAccountSearchClient } = require('../signals/threads-account-search-client');
const { ThreadsNetworkObserver } = require('../signals/threads-network-observer');
const { ThreadsPostMetadataCatalog } = require('../signals/threads-post-metadata-catalog');
const { SettingsStore } = require('../storage/settings-store');
const { MenuCommandRegistrar } = require('../ui/menu-command');
const { ThreadsSidebarMenuTrigger } = require('../ui/sidebar-menu-trigger');
const { ThreadsSettingsMenu } = require('../ui/settings-menu');

const { BlockedPostCatalog, normalizePostCodeList } = require('./blocked-post-catalog');
const { ContentModel } = require('./content-model');

const EMPTY_MODEL_RECOVERY_DELAY_MS = 2_500;
const TIMELINE_BACKFILL_COOLDOWN_MS = 1_500;
const FULL_FILTER_RECOVERY_RETRY_DELAY_MS = 900;
const FULL_FILTER_RECOVERY_MAX_ATTEMPTS = 4;
const TIMELINE_SCROLL_REGION_SELECTOR = '[aria-label="Column body"]';
const REPLY_CASCADE_REASON = 'thread:cascade';
const PROFILE_ROUTE_PATTERN = /^\/@[^/?#]+(?:\/.*)?$/i;

/**
 * Run the end-to-end filtering lifecycle for Threads.
 */
class FilterRuntime {
  /**
   * Initialize runtime collaborators and internal state.
   *
   * @param {{
   *   settingsStore?: SettingsStore,
   *   feedAdapter?: ThreadsFeedAdapter,
   *   ruleEngine?: FilterRuleEngine,
   *   blockedPostCatalog?: BlockedPostCatalog,
   *   mutationManager?: MutationManager,
   *   activityWatcher?: ActivityWatcher,
   *   styleManager?: StyleManager,
   *   menuCommandRegistrar?: MenuCommandRegistrar,
   *   settingsMenu?: ThreadsSettingsMenu,
   *   settingsMenuTrigger?: ThreadsSidebarMenuTrigger,
   *   postMetadataCatalog?: ThreadsPostMetadataCatalog,
   *   networkObserver?: ThreadsNetworkObserver,
   *   accountSearchClient?: ThreadsAccountSearchClient,
   *   notInterestedDispatcher?: NotInterestedDispatcher,
   *   nowProvider?: () => number,
   *   scheduleFn?: (callback: Function, delayMs: number) => unknown,
   *   clearScheduleFn?: (timerId: unknown) => void,
   *   logger?: Logger
   * }} [options] - Runtime options.
   */
  constructor(options = {}) {
    const { logger = new Logger({ namespace: 'runtime', level: 'warn' }) } = options;

    this.logger = logger;
    this.nowProvider = typeof options.nowProvider === 'function' ? options.nowProvider : Date.now;
    this.scheduleFn =
      typeof options.scheduleFn === 'function'
        ? options.scheduleFn
        : (callback, delayMs) => setTimeout(callback, delayMs);
    this.clearScheduleFn =
      typeof options.clearScheduleFn === 'function'
        ? options.clearScheduleFn
        : (timerId) => clearTimeout(timerId);
    this.settingsStore = options.settingsStore || new SettingsStore();
    this.feedAdapter = options.feedAdapter || new ThreadsFeedAdapter();
    this.ruleEngine = options.ruleEngine || new FilterRuleEngine({ logger: this.logger });
    this.blockedPostCatalog =
      options.blockedPostCatalog ||
      new BlockedPostCatalog({
        nowProvider: this.nowProvider,
      });
    this.styleManager = options.styleManager || new StyleManager();
    this.menuCommandRegistrar = options.menuCommandRegistrar || new MenuCommandRegistrar();
    this.postMetadataCatalog = options.postMetadataCatalog || new ThreadsPostMetadataCatalog();
    this.networkObserver =
      options.networkObserver ||
      new ThreadsNetworkObserver({
        postMetadataCatalog: this.postMetadataCatalog,
        logger: this.logger,
      });
    this.accountSearchClient =
      options.accountSearchClient ||
      new ThreadsAccountSearchClient({
        networkObserver: this.networkObserver,
        logger: this.logger,
      });
    this.settingsMenu =
      options.settingsMenu ||
      new ThreadsSettingsMenu({
        settingsStore: this.settingsStore,
        accountSearchClient: this.accountSearchClient,
        logger: this.logger,
        onSettingsUpdated: (nextSettings) => {
          this.#adoptSettings(nextSettings);
          void this.runCycle();
        },
        onVisibilityChanged: (isOpen) => {
          this.settingsMenuTrigger?.setMenuOpen(isOpen);
        },
      });
    this.settingsMenuTrigger =
      options.settingsMenuTrigger ||
      new ThreadsSidebarMenuTrigger({
        onActivate: async () => {
          await this.#toggleSettingsMenu();
        },
        isMenuOpenProvider: () => Boolean(this.settingsMenu && this.settingsMenu.isOpen),
        logger: this.logger,
      });
    this.notInterestedDispatcher =
      options.notInterestedDispatcher ||
      new NotInterestedDispatcher({
        postMetadataCatalog: this.postMetadataCatalog,
        networkObserver: this.networkObserver,
        logger: this.logger,
      });
    this.mutationManager =
      options.mutationManager || new MutationManager({ onMutations: () => this.runCycle() });
    this.activityWatcher =
      options.activityWatcher || new ActivityWatcher({ onActivity: () => this.runCycle() });

    this.settings = null;
    this.settingsReference = null;
    this.isRunning = false;
    this.hasPendingRun = false;
    this.emptyModelRecoveryStartedAtMs = null;
    this.didRunEmptyModelRecovery = false;
    this.lastTimelineBackfillAtMs = null;
    this.fullFilterRecoveryAttemptCount = 0;
    this.fullFilterRecoveryTimerId = null;
    this.wasVerifiedBadgeHidingEnabled = false;
  }

  /**
   * Start runtime and attach observers only after initial settings load.
   *
   * @returns {Promise<void>}
   */
  async start() {
    this.#adoptSettings(await this.settingsStore.load());

    await this.notInterestedDispatcher.start();
    await this.networkObserver.start();
    this.#registerMenuCommands();
    whenBodyReady(() => {
      this.styleManager.ensureFilterStyles();
      void this.settingsMenuTrigger.start();
      this.mutationManager.start(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      this.activityWatcher.start();
      void this.runCycle();
    });

    this.logger.info('Started filter runtime.');
  }

  /**
   * Stop runtime observation and activity listeners.
   */
  stop() {
    this.#clearFullFilterRecoveryTimer();
    this.fullFilterRecoveryAttemptCount = 0;
    if (typeof document !== 'undefined') {
      this.styleManager.clearAllVerifiedBadgeMarkers(document);
      this.styleManager.clearAllTimelineDividerMarkers(document);
    }
    this.wasVerifiedBadgeHidingEnabled = false;
    this.settingsMenuTrigger.stop();
    this.mutationManager.stop();
    this.activityWatcher.stop();
    this.networkObserver.stop();
    void this.notInterestedDispatcher.stop();
    this.settingsMenu.destroy();
  }

  /**
   * Process current feed snapshot while preserving single-run semantics.
   *
   * @returns {Promise<void>}
   */
  async runCycle() {
    if (this.isRunning) {
      this.hasPendingRun = true;
      return;
    }

    this.isRunning = true;
    try {
      const settings = this.settings || (await this.settingsStore.load());
      this.#adoptSettings(settings);
      const contentModels = this.feedAdapter.collectContentModels(document);
      const shouldHideVerifiedBadges = this.#shouldHideVerifiedBadges(settings);
      const effectiveRuleSettings = this.#resolveRuleSettingsForCurrentRoute(settings);
      let hiddenCount = 0;
      let cascadeHiddenCount = 0;

      if (contentModels.length === 0) {
        this.#attemptEmptyModelRecovery();
        this.#attemptEmptyCycleBackfillRecovery();
      } else {
        this.emptyModelRecoveryStartedAtMs = null;
        this.didRunEmptyModelRecovery = false;
      }

      const evaluatedModels = this.#evaluateContentModels(contentModels, effectiveRuleSettings);
      let modelCountWithElement = 0;
      for (const { model, decision, postCodes, isCascadeBlocked } of evaluatedModels) {
        if (!model.element) {
          continue;
        }

        modelCountWithElement += 1;
        this.styleManager.setVerifiedBadgesHidden(model.element, shouldHideVerifiedBadges);
        if (decision.blocked) {
          hiddenCount += 1;
          if (isCascadeBlocked) {
            cascadeHiddenCount += 1;
          }
          this.styleManager.hideElement(model.element, decision.reasons, {
            postCode: model.postCode,
          });
          this.blockedPostCatalog.markBlockedPostCodes(postCodes);
          this.notInterestedDispatcher.enqueue(model, decision, settings);
        } else {
          this.styleManager.unhideElement(model.element);
        }
      }

      this.styleManager.syncFirstVisibleTimelineDividers(
        evaluatedModels.map(({ model }) => model.element).filter(Boolean),
        document
      );

      if (!shouldHideVerifiedBadges && this.wasVerifiedBadgeHidingEnabled) {
        this.styleManager.clearAllVerifiedBadgeMarkers(document);
      }
      this.wasVerifiedBadgeHidingEnabled = shouldHideVerifiedBadges;

      this.#attemptTimelineBackfill(modelCountWithElement, hiddenCount);
      if (modelCountWithElement > hiddenCount) {
        this.#resetFullFilterRecovery();
      }

      this.logger.debug('Completed run cycle.', {
        totalModels: contentModels.length,
        hiddenCount,
        cascadeHiddenCount,
      });
    } catch (error) {
      this.logger.error('Run cycle failed.', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isRunning = false;
      if (this.hasPendingRun) {
        this.hasPendingRun = false;
        await this.runCycle();
      }
    }
  }

  /**
   * Register userscript command that opens and closes filter settings.
   */
  #registerMenuCommands() {
    this.menuCommandRegistrar.register('Bobbin Threads Filter: Toggle Settings', () => {
      void this.#toggleSettingsMenu();
    });
  }

  /**
   * Toggle settings menu and keep sidebar trigger state synchronized.
   *
   * @returns {Promise<void>}
   */
  async #toggleSettingsMenu() {
    try {
      await this.settingsMenu.toggle();
    } catch (error) {
      this.logger.error('Settings menu toggle failed.', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.settingsMenuTrigger.setMenuOpen(Boolean(this.settingsMenu && this.settingsMenu.isOpen));
    }
  }

  /**
   * Adopt active settings and reset cascade state when semantics change.
   *
   * @param {object} settings - Normalized runtime settings.
   */
  #adoptSettings(settings) {
    if (!settings || typeof settings !== 'object') {
      return;
    }

    this.settings = settings;
    if (this.settingsReference !== settings) {
      this.settingsReference = settings;
      this.blockedPostCatalog.reset();
    }

    if (settings.observability && settings.observability.level) {
      this.logger.setLevel(settings.observability.level);
    }
  }

  /**
   * Decide whether runtime should hide visible verified badges without filtering rows.
   *
   * @param {object} settings - Normalized runtime settings.
   * @returns {boolean}
   */
  #shouldHideVerifiedBadges(settings) {
    return Boolean(
      settings &&
      settings.filters &&
      settings.filters.verified &&
      settings.filters.verified.hideBadges === true
    );
  }

  /**
   * Disable verified post filtering on profile routes while keeping all other filters active.
   *
   * @param {object} settings - Normalized runtime settings.
   * @returns {object}
   */
  #resolveRuleSettingsForCurrentRoute(settings) {
    if (!this.#isProfileRoute() || !settings || !settings.filters || !settings.filters.verified) {
      return settings;
    }

    if (settings.filters.verified.enabled !== true) {
      return settings;
    }

    return {
      ...settings,
      filters: {
        ...settings.filters,
        verified: {
          ...settings.filters.verified,
          enabled: false,
        },
      },
    };
  }

  /**
   * Detect whether the current route is a user profile path.
   *
   * @returns {boolean}
   */
  #isProfileRoute() {
    if (typeof location === 'undefined') {
      return false;
    }

    const pathname = String(location.pathname || '').trim();
    return PROFILE_ROUTE_PATTERN.test(pathname);
  }

  /**
   * Evaluate models and cascade-block replies that reference blocked parent posts.
   *
   * @param {Array<{ postCode?: string, postCodes?: string[] }>} contentModels - Candidate models.
   * @param {object} settings - Normalized runtime settings.
   * @returns {Array<{
   *   model: { postCode?: string, postCodes?: string[], element?: HTMLElement|null },
   *   decision: { blocked: boolean, reasons: string[], matches?: Array<{ kind: string, mode: string, pattern: string }> },
   *   postCodes: string[],
   *   isCascadeBlocked: boolean
   * }>}
   */
  #evaluateContentModels(contentModels, settings) {
    const evaluatedModels = [];
    const currentlyBlockedCodes = new Set();
    for (const contentModel of contentModels) {
      const model = this.#buildMetadataAwareContentModel(contentModel);
      const postCodes = this.#resolveModelPostCodes(model);
      const decision = this.ruleEngine.evaluate(model, settings);
      if (decision && decision.blocked) {
        for (const postCode of postCodes) {
          currentlyBlockedCodes.add(postCode);
        }
      }

      evaluatedModels.push({
        model,
        decision,
        postCodes,
        isCascadeBlocked: false,
      });
    }

    return evaluatedModels.map((evaluatedModel) => {
      if (evaluatedModel.decision && evaluatedModel.decision.blocked) {
        return evaluatedModel;
      }

      if (
        !this.#containsBlockedPostCode(
          evaluatedModel.postCodes,
          currentlyBlockedCodes,
          evaluatedModel.model.postCode
        )
      ) {
        return evaluatedModel;
      }

      return {
        ...evaluatedModel,
        decision: this.#buildCascadeDecision(evaluatedModel.decision),
        isCascadeBlocked: true,
      };
    });
  }

  /**
   * Enrich one content model with catalog-backed metadata before rule evaluation.
   *
   * @param {import('./content-model').ContentModel|Record<string, unknown>} contentModel - Candidate model.
   * @returns {import('./content-model').ContentModel}
   */
  #buildMetadataAwareContentModel(contentModel) {
    const baseModel =
      contentModel instanceof ContentModel ? contentModel : new ContentModel(contentModel || {});
    const postCodes = this.#resolveModelPostCodes(baseModel);
    if (
      postCodes.length === 0 ||
      !this.postMetadataCatalog ||
      typeof this.postMetadataCatalog.getByPostCode !== 'function'
    ) {
      return baseModel;
    }

    const aiDetectionMethods = new Set(
      Array.isArray(baseModel.aiDetectionMethods) ? baseModel.aiDetectionMethods : []
    );
    let hasAiLabel = baseModel.hasAiLabel === true;
    for (const postCode of postCodes) {
      const postMetadata = this.postMetadataCatalog.getByPostCode(postCode);
      if (!postMetadata) {
        continue;
      }

      const normalizedDetectionMethod = String(postMetadata.genAIDetectionMethod || '')
        .trim()
        .toUpperCase();
      const hasDetectedAiLabel =
        postMetadata.hasAiLabel === true && normalizedDetectionMethod !== 'NONE';
      if (
        hasDetectedAiLabel ||
        (normalizedDetectionMethod && normalizedDetectionMethod !== 'NONE')
      ) {
        hasAiLabel = true;
      }

      if (normalizedDetectionMethod && normalizedDetectionMethod !== 'NONE') {
        aiDetectionMethods.add(normalizedDetectionMethod);
      }
    }

    if (
      hasAiLabel === baseModel.hasAiLabel &&
      aiDetectionMethods.size === baseModel.aiDetectionMethods.length
    ) {
      return baseModel;
    }

    return new ContentModel({
      ...baseModel,
      hasAiLabel,
      aiDetectionMethods: Array.from(aiDetectionMethods),
    });
  }

  /**
   * Normalize all post codes represented by one model.
   *
   * @param {{ postCode?: string, postCodes?: string[] }} model - Candidate content model.
   * @returns {string[]}
   */
  #resolveModelPostCodes(model) {
    const candidatePostCodes = [];
    if (model && Array.isArray(model.postCodes)) {
      candidatePostCodes.push(...model.postCodes);
    }
    if (model && model.postCode) {
      candidatePostCodes.push(model.postCode);
    }

    return normalizePostCodeList(candidatePostCodes);
  }

  /**
   * Determine whether model post codes intersect blocked code state.
   *
   * @param {string[]} postCodes - Normalized model post codes.
   * @param {Set<string>} currentlyBlockedCodes - Post codes blocked in this run.
   * @param {string} primaryPostCode - Primary post code for this model.
   * @returns {boolean}
   */
  #containsBlockedPostCode(postCodes, currentlyBlockedCodes, primaryPostCode) {
    if (postCodes.length === 0) {
      return false;
    }

    for (const postCode of postCodes) {
      if (!currentlyBlockedCodes.has(postCode)) {
        continue;
      }

      if (postCodes.length > 1 || postCode !== primaryPostCode) {
        return true;
      }
    }

    return this.blockedPostCatalog.hasBlockedPostCode(postCodes);
  }

  /**
   * Build synthetic block decision used for thread-level cascade hides.
   *
   * @param {{ reasons?: string[], matches?: Array<{ kind: string, mode: string, pattern: string }> }} decision - Rule decision.
   * @returns {{ blocked: boolean, reasons: string[], matches: Array<{ kind: string, mode: string, pattern: string }> }}
   */
  #buildCascadeDecision(decision) {
    const reasons = Array.isArray(decision && decision.reasons) ? [...decision.reasons] : [];
    if (!reasons.includes(REPLY_CASCADE_REASON)) {
      reasons.push(REPLY_CASCADE_REASON);
    }

    return {
      blocked: true,
      reasons,
      matches: Array.isArray(decision && decision.matches) ? decision.matches : [],
    };
  }

  /**
   * Request additional feed rows when current viewport batch is fully filtered.
   *
   * @param {number} modelCountWithElement - Number of extracted models with DOM elements.
   * @param {number} hiddenCount - Number of currently hidden models.
   */
  #attemptTimelineBackfill(modelCountWithElement, hiddenCount) {
    if (modelCountWithElement <= 0 || hiddenCount < modelCountWithElement) {
      return;
    }

    const nowMs = this.nowProvider();
    if (
      this.lastTimelineBackfillAtMs !== null &&
      nowMs - this.lastTimelineBackfillAtMs < TIMELINE_BACKFILL_COOLDOWN_MS
    ) {
      return;
    }

    const scrollRegion = this.#resolveTimelineScrollRegion();
    if (!scrollRegion || !this.#emitTimelineScrollSignals(scrollRegion)) {
      return;
    }

    this.lastTimelineBackfillAtMs = nowMs;
    this.#scheduleFullFilterRecoveryRetry();
    this.logger.debug('Requested timeline backfill after full-batch filtering.', {
      modelCountWithElement,
      hiddenCount,
    });
  }

  /**
   * Continue requesting backfill while the feed stays empty after full filtering.
   */
  #attemptEmptyCycleBackfillRecovery() {
    if (this.fullFilterRecoveryAttemptCount <= 0) {
      return;
    }

    if (this.fullFilterRecoveryAttemptCount >= FULL_FILTER_RECOVERY_MAX_ATTEMPTS) {
      this.#resetFullFilterRecovery();
      return;
    }

    const nowMs = this.nowProvider();
    if (
      this.lastTimelineBackfillAtMs !== null &&
      nowMs - this.lastTimelineBackfillAtMs < TIMELINE_BACKFILL_COOLDOWN_MS
    ) {
      this.#scheduleFullFilterRecoveryRetry();
      return;
    }

    const scrollRegion = this.#resolveTimelineScrollRegion();
    if (!scrollRegion || !this.#emitTimelineScrollSignals(scrollRegion)) {
      return;
    }

    this.lastTimelineBackfillAtMs = nowMs;
    this.#scheduleFullFilterRecoveryRetry();
    this.logger.debug('Requested timeline backfill during empty-feed recovery window.', {
      recoveryAttempt: this.fullFilterRecoveryAttemptCount,
    });
  }

  /**
   * Resolve timeline scroll host used by Threads feed loading.
   *
   * @returns {HTMLElement|null}
   */
  #resolveTimelineScrollRegion() {
    if (typeof document === 'undefined') {
      return null;
    }

    const region = document.querySelector(TIMELINE_SCROLL_REGION_SELECTOR);
    if (region && typeof region.dispatchEvent === 'function') {
      return region;
    }

    const fallbackRegion = document.scrollingElement;
    if (fallbackRegion && typeof fallbackRegion.dispatchEvent === 'function') {
      return fallbackRegion;
    }

    return null;
  }

  /**
   * Emit scroll movement and events that trigger Threads feed backfill.
   *
   * @param {HTMLElement} scrollRegion - Timeline scroll host.
   * @returns {boolean}
   */
  #emitTimelineScrollSignals(scrollRegion) {
    let didSignal = false;
    if (
      typeof scrollRegion.scrollTop === 'number' &&
      typeof scrollRegion.scrollHeight === 'number' &&
      typeof scrollRegion.clientHeight === 'number'
    ) {
      const scrollIncrement = Math.max(Math.floor(scrollRegion.clientHeight * 0.9), 600);
      const nextScrollTop = Math.min(
        scrollRegion.scrollHeight,
        scrollRegion.scrollTop + scrollIncrement
      );
      if (nextScrollTop > scrollRegion.scrollTop) {
        scrollRegion.scrollTop = nextScrollTop;
        didSignal = true;
      }
    }

    if (typeof scrollRegion.dispatchEvent === 'function') {
      scrollRegion.dispatchEvent(new Event('scroll', { bubbles: true }));
      didSignal = true;
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('scroll'));
      didSignal = true;
    }

    return didSignal;
  }

  /**
   * Queue one bounded retry run so full-filtered timelines can recover.
   */
  #scheduleFullFilterRecoveryRetry() {
    if (this.fullFilterRecoveryAttemptCount >= FULL_FILTER_RECOVERY_MAX_ATTEMPTS) {
      return;
    }

    if (this.fullFilterRecoveryTimerId !== null) {
      return;
    }

    this.fullFilterRecoveryAttemptCount += 1;
    this.fullFilterRecoveryTimerId = this.scheduleFn(() => {
      this.fullFilterRecoveryTimerId = null;
      void this.runCycle();
    }, FULL_FILTER_RECOVERY_RETRY_DELAY_MS);
    this.logger.debug('Scheduled full-filter recovery retry run.', {
      recoveryAttempt: this.fullFilterRecoveryAttemptCount,
    });
  }

  /**
   * Cancel any pending full-filter recovery retry timer.
   */
  #clearFullFilterRecoveryTimer() {
    if (this.fullFilterRecoveryTimerId === null) {
      return;
    }

    this.clearScheduleFn(this.fullFilterRecoveryTimerId);
    this.fullFilterRecoveryTimerId = null;
  }

  /**
   * Reset full-filter recovery state once visible content reappears.
   */
  #resetFullFilterRecovery() {
    this.#clearFullFilterRecoveryTimer();
    this.fullFilterRecoveryAttemptCount = 0;
  }

  /**
   * Delay stale-marker recovery until zero-model extraction persists.
   */
  #attemptEmptyModelRecovery() {
    const nowMs = this.nowProvider();
    if (this.emptyModelRecoveryStartedAtMs === null) {
      this.emptyModelRecoveryStartedAtMs = nowMs;
      this.logger.debug(
        'Deferred stale hide-marker recovery during empty extraction grace window.'
      );
      return;
    }

    if (this.didRunEmptyModelRecovery) {
      return;
    }

    if (nowMs - this.emptyModelRecoveryStartedAtMs < EMPTY_MODEL_RECOVERY_DELAY_MS) {
      return;
    }

    this.styleManager.clearAllHiddenMarkers(document);
    this.didRunEmptyModelRecovery = true;
    this.logger.debug('Cleared stale hide markers after sustained empty extraction window.');
  }
}

module.exports = {
  FilterRuntime,
};
