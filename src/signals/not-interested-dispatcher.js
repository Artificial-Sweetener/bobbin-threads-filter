/**
 * @file Orchestrate rate-limited not-interested mutation dispatch.
 */

const { normalizeHandle, normalizeTopic } = require('../storage/settings-schema');

const { NotInterestedClient } = require('./not-interested-client');
const { NotInterestedStateStore } = require('./not-interested-state-store');

const MINUTE_WINDOW_MS = 60_000;
const MAX_SENT_MEDIA_HISTORY = 5_000;
const DEFAULT_MAX_QUEUE_LENGTH = 300;

/**
 * Build one stable phrase-match key for mode-aware not-interested toggles.
 *
 * @param {string} mode - Match mode.
 * @param {string} pattern - Phrase or regex pattern.
 * @returns {string}
 */
function buildPhraseMatchKey(mode, pattern) {
  return `${mode === 'regex' ? 'regex' : 'text'}:${pattern}`;
}

/**
 * Dispatch not-interested signals for eligible phrase, username, and trending-topic matches.
 */
class NotInterestedDispatcher {
  /**
   * Initialize queue orchestration dependencies and runtime state.
   *
   * @param {{
   *   postMetadataCatalog: { getByPostCode: Function },
   *   networkObserver: { getRequestContext: Function, getDiagnostics?: Function },
   *   client?: NotInterestedClient,
   *   stateStore?: NotInterestedStateStore,
   *   maxQueueLength?: number,
   *   logger?: { debug: Function, warn: Function },
   *   nowProvider?: () => number,
   *   randomProvider?: () => number,
   *   scheduleFn?: Function,
   *   clearScheduleFn?: Function
   * }} options - Dispatcher dependencies.
   */
  constructor(options = {}) {
    const {
      postMetadataCatalog,
      networkObserver,
      client = new NotInterestedClient({
        networkObserver,
      }),
      stateStore = new NotInterestedStateStore(),
      maxQueueLength = DEFAULT_MAX_QUEUE_LENGTH,
      logger = { debug: () => {}, warn: () => {} },
      nowProvider = () => Date.now(),
      randomProvider = () => Math.random(),
      scheduleFn = (callback, delayMs) => setTimeout(callback, delayMs),
      clearScheduleFn = (timerId) => clearTimeout(timerId),
    } = options;

    this.postMetadataCatalog = postMetadataCatalog;
    this.networkObserver = networkObserver;
    this.client = client;
    this.stateStore = stateStore;
    this.maxQueueLength = Math.max(1, Number(maxQueueLength) || 1);
    this.logger = logger;
    this.nowProvider = nowProvider;
    this.randomProvider = randomProvider;
    this.scheduleFn = scheduleFn;
    this.clearScheduleFn = clearScheduleFn;

    this.isStarted = false;
    this.isProcessingQueue = false;
    this.processingTimerId = null;
    this.queue = [];
    this.queuedPostCodes = new Set();
    this.latestSettings = null;
    this.didWarnBridgeUnavailable = false;
    this.nextAllowedAtMs = 0;
    this.diagnostics = {
      bridge_ready: false,
      metadata_ingested: 0,
      eligible_for_signal: 0,
      signals_sent: 0,
      signals_skipped_missing_metadata: 0,
      signal_http_status: {},
    };
    this.state = {
      sentMediaPks: [],
      minuteWindowMs: [],
      dayWindow: { dayKey: '', count: 0 },
      lastSentAtMs: 0,
      circuitBreakerUntilMs: 0,
    };
  }

  /**
   * Load persisted state and enable queue processing.
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isStarted) {
      return;
    }

    this.state = await this.stateStore.load();
    this.nextAllowedAtMs = this.state.lastSentAtMs;
    this.#refreshObserverDiagnostics();
    this.isStarted = true;
  }

  /**
   * Stop processing and persist the latest dispatcher state.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isStarted) {
      return;
    }

    this.#clearProcessingTimer();
    this.queue = [];
    this.queuedPostCodes.clear();
    this.isStarted = false;
    await this.stateStore.save(this.state);
  }

  /**
   * Expose dispatcher diagnostics for debugging not-interested behavior.
   *
   * @returns {{
   *   bridge_ready: boolean,
   *   metadata_ingested: number,
   *   eligible_for_signal: number,
   *   signals_sent: number,
   *   signals_skipped_missing_metadata: number,
   *   signal_http_status: Record<string, number>
   * }}
   */
  getDiagnostics() {
    return {
      bridge_ready: this.diagnostics.bridge_ready,
      metadata_ingested: this.diagnostics.metadata_ingested,
      eligible_for_signal: this.diagnostics.eligible_for_signal,
      signals_sent: this.diagnostics.signals_sent,
      signals_skipped_missing_metadata: this.diagnostics.signals_skipped_missing_metadata,
      signal_http_status: { ...this.diagnostics.signal_http_status },
    };
  }

  /**
   * Queue one candidate post for not-interested signaling when eligible.
   *
   * @param {{
   *   postCode?: string,
   *   element?: HTMLElement|null
   * }} contentModel - Canonical content model.
   * @param {{
   *   blocked: boolean,
   *   matches?: Array<{ kind: string, mode: string, pattern: string }>
   * }} decision - Rule-engine decision.
   * @param {object} settings - Normalized settings.
   */
  enqueue(contentModel, decision, settings) {
    if (!this.isStarted || !decision || !decision.blocked) {
      return;
    }

    const eligibleMatchPatterns = this.#resolveEligibleMatchPatterns(decision, settings);
    if (eligibleMatchPatterns.length === 0) {
      return;
    }

    const postCode = String((contentModel && contentModel.postCode) || '').trim();
    if (!postCode || this.queuedPostCodes.has(postCode)) {
      return;
    }

    this.#refreshObserverDiagnostics();
    this.diagnostics.eligible_for_signal += 1;
    this.latestSettings = settings;
    if (
      this.isProcessingQueue &&
      this.queue.length >= this.maxQueueLength &&
      this.queue.length <= 1
    ) {
      this.logger.debug(
        'Dropped signaling candidate because queue is full while send is in flight.',
        {
          postCode,
          maxQueueLength: this.maxQueueLength,
        }
      );
      return;
    }
    this.#trimQueueToCapacity();
    const enqueuedAtMs = this.nowProvider();
    this.queue.push({
      postCode,
      matchedPatterns: eligibleMatchPatterns,
      readyAtMs: enqueuedAtMs,
      enqueuedAtMs,
      element:
        contentModel && contentModel.element && typeof contentModel.element === 'object'
          ? contentModel.element
          : null,
    });
    this.queuedPostCodes.add(postCode);

    this.#scheduleQueueProcessing(0);
  }

  /**
   * Resolve matches that are explicitly enabled for signaling.
   *
   * @param {{
   *   matches?: Array<{ kind: string, mode: string, pattern: string }>
   * }} decision - Rule decision.
   * @param {object} settings - Normalized settings.
   * @returns {string[]}
   */
  #resolveEligibleMatchPatterns(decision, settings) {
    const enabledEntryKeys = this.#resolveEnabledEntryKeys(settings);
    const enabledPatterns = this.#resolveEnabledPatterns(settings);
    const enabledUsernameHandles = this.#resolveEnabledUsernameHandles(settings);
    const enabledTrendingTopics = this.#resolveEnabledTrendingTopics(settings);
    if (
      enabledEntryKeys.size === 0 &&
      enabledPatterns.size === 0 &&
      enabledUsernameHandles.size === 0 &&
      enabledTrendingTopics.size === 0
    ) {
      return [];
    }

    const decisionMatches = Array.isArray(decision.matches) ? decision.matches : [];
    const matchedPatterns = new Set();

    for (const match of decisionMatches) {
      if (!match) {
        continue;
      }

      if (match.kind === 'username') {
        const matchedHandle = normalizeHandle(match.pattern);
        if (matchedHandle && enabledUsernameHandles.has(matchedHandle)) {
          matchedPatterns.add(`@${matchedHandle}`);
        }
        continue;
      }

      if (
        match.kind === 'trending' &&
        String(match.mode || '')
          .trim()
          .toLowerCase() === 'topic'
      ) {
        const matchedTopic = normalizeTopic(match.pattern);
        if (matchedTopic && enabledTrendingTopics.has(matchedTopic)) {
          matchedPatterns.add(`trending:${matchedTopic}`);
        }
        continue;
      }

      if (match.kind === 'phrase') {
        const pattern = String(match.pattern || '').trim();
        const mode = String(match.mode || 'text')
          .trim()
          .toLowerCase();
        const isEntryEnabled = pattern && enabledEntryKeys.has(buildPhraseMatchKey(mode, pattern));
        if (pattern && (isEntryEnabled || enabledPatterns.has(pattern))) {
          matchedPatterns.add(pattern);
        }
      }
    }

    return Array.from(matchedPatterns);
  }

  /**
   * Resolve username handles explicitly enabled for signaling.
   *
   * @param {object} settings - Normalized settings.
   * @returns {Set<string>}
   */
  #resolveEnabledUsernameHandles(settings) {
    const enabledHandleList =
      settings &&
      settings.filters &&
      settings.filters.username &&
      settings.filters.username.notInterested &&
      Array.isArray(settings.filters.username.notInterested.enabledHandles)
        ? settings.filters.username.notInterested.enabledHandles
        : [];

    return new Set(enabledHandleList.map((handle) => normalizeHandle(handle)).filter(Boolean));
  }

  /**
   * Resolve trending topics explicitly enabled for signaling.
   *
   * @param {object} settings - Normalized settings.
   * @returns {Set<string>}
   */
  #resolveEnabledTrendingTopics(settings) {
    const enabledTopicList =
      settings &&
      settings.filters &&
      settings.filters.trending &&
      settings.filters.trending.notInterested &&
      Array.isArray(settings.filters.trending.notInterested.enabledTopics)
        ? settings.filters.trending.notInterested.enabledTopics
        : [];

    return new Set(enabledTopicList.map((topic) => normalizeTopic(topic)).filter(Boolean));
  }

  /**
   * Resolve mode-aware phrase entries enabled for signaling.
   *
   * @param {object} settings - Normalized settings.
   * @returns {Set<string>}
   */
  #resolveEnabledEntryKeys(settings) {
    const enabledEntryList =
      settings &&
      settings.filters &&
      settings.filters.phrase &&
      settings.filters.phrase.notInterested &&
      Array.isArray(settings.filters.phrase.notInterested.enabledEntries)
        ? settings.filters.phrase.notInterested.enabledEntries
        : [];

    const enabledEntryKeys = new Set();
    for (const entry of enabledEntryList) {
      const candidate =
        entry && typeof entry === 'object' ? /** @type {Record<string, unknown>} */ (entry) : null;
      const pattern =
        candidate === null
          ? ''
          : String(
              candidate.pattern === undefined || candidate.pattern === null ? '' : candidate.pattern
            ).trim();
      if (!pattern) {
        continue;
      }

      const mode = candidate.isRegex === true ? 'regex' : 'text';
      enabledEntryKeys.add(buildPhraseMatchKey(mode, pattern));
    }

    return enabledEntryKeys;
  }

  /**
   * Resolve enabled phrase/regex patterns for signaling.
   *
   * @param {object} settings - Normalized settings.
   * @returns {Set<string>}
   */
  #resolveEnabledPatterns(settings) {
    const enabledPatternList =
      settings &&
      settings.filters &&
      settings.filters.phrase &&
      settings.filters.phrase.notInterested &&
      Array.isArray(settings.filters.phrase.notInterested.enabledPatterns)
        ? settings.filters.phrase.notInterested.enabledPatterns
        : [];

    return new Set(
      enabledPatternList
        .map((pattern) => String(pattern || '').trim())
        .filter((pattern) => pattern.length > 0)
    );
  }

  /**
   * Resolve effective rate-limit configuration from normalized settings.
   *
   * @returns {{
   *   minIntervalSeconds: number,
   *   jitterSeconds: number,
   *   maxPerMinute: number,
   *   maxPerDay: number,
   *   circuitBreakerMinutes: number
   * }}
   */
  #resolveRateLimit() {
    const rateLimit =
      this.latestSettings &&
      this.latestSettings.filters &&
      this.latestSettings.filters.phrase &&
      this.latestSettings.filters.phrase.notInterested &&
      this.latestSettings.filters.phrase.notInterested.rateLimit
        ? this.latestSettings.filters.phrase.notInterested.rateLimit
        : null;

    if (!rateLimit) {
      return {
        minIntervalSeconds: 8,
        jitterSeconds: 2,
        maxPerMinute: 6,
        maxPerDay: 120,
        circuitBreakerMinutes: 15,
      };
    }

    return {
      minIntervalSeconds: Number(rateLimit.minIntervalSeconds) || 8,
      jitterSeconds: Number(rateLimit.jitterSeconds) || 0,
      maxPerMinute: Number(rateLimit.maxPerMinute) || 6,
      maxPerDay: Number(rateLimit.maxPerDay) || 120,
      circuitBreakerMinutes: Number(rateLimit.circuitBreakerMinutes) || 15,
    };
  }

  /**
   * Process queued mutation candidates while enforcing strict rate policies.
   *
   * @returns {Promise<void>}
   */
  async #processQueue() {
    if (!this.isStarted || this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;
    try {
      while (this.queue.length > 0) {
        this.#refreshObserverDiagnostics();
        const rateLimit = this.#resolveRateLimit();
        const nowMs = this.nowProvider();

        this.#pruneMinuteWindow(nowMs);
        this.#alignDayWindow(nowMs);

        if (this.state.circuitBreakerUntilMs > nowMs) {
          this.#scheduleQueueProcessing(this.state.circuitBreakerUntilMs - nowMs);
          return;
        }

        const nextQueueItem = this.queue[0];
        if (!nextQueueItem) {
          return;
        }

        if (nextQueueItem.readyAtMs > nowMs) {
          this.#scheduleQueueProcessing(nextQueueItem.readyAtMs - nowMs);
          return;
        }

        if (!this.#isQueueCandidateConnected(nextQueueItem)) {
          this.logger.debug('Dropped signaling candidate because post node left the DOM.', {
            postCode: nextQueueItem.postCode,
            matchedPatterns: nextQueueItem.matchedPatterns,
          });
          this.#dequeueHead();
          continue;
        }

        const rateLimitedDelayMs = this.#resolveRateLimitedDelay(nowMs, rateLimit);
        if (rateLimitedDelayMs > 0) {
          this.#scheduleQueueProcessing(rateLimitedDelayMs);
          return;
        }

        const postMetadata = this.postMetadataCatalog.getByPostCode(nextQueueItem.postCode);
        if (!postMetadata) {
          this.diagnostics.signals_skipped_missing_metadata += 1;
          this.logger.debug('Skipped signaling because post metadata is unavailable.', {
            postCode: nextQueueItem.postCode,
            matchedPatterns: nextQueueItem.matchedPatterns,
          });
          this.#dequeueHead();
          continue;
        }

        if (!String(postMetadata.rankingInfoToken || '').trim()) {
          this.diagnostics.signals_skipped_missing_metadata += 1;
          this.logger.debug('Skipped signaling because ranking metadata is unavailable.', {
            postCode: nextQueueItem.postCode,
            mediaPk: postMetadata.mediaPk,
            matchedPatterns: nextQueueItem.matchedPatterns,
          });
          this.#dequeueHead();
          continue;
        }

        if (this.#wasAlreadySent(postMetadata.mediaPk)) {
          this.#dequeueHead();
          continue;
        }

        const viewerPk = this.#readCookieValue('ds_user_id');
        if (!viewerPk) {
          this.logger.warn('Skipped signaling because viewer id is unavailable.');
          this.#dequeueHead();
          continue;
        }

        const mutationResult = await this.client.sendNotInterested({
          viewerPk,
          mediaPk: postMetadata.mediaPk,
          rankingInfoToken: postMetadata.rankingInfoToken,
        });
        this.#recordSignalHttpStatus(mutationResult.statusCode);
        this.logger.debug('Executed not-interested send attempt.', {
          mediaPk: postMetadata.mediaPk,
          statusCode: mutationResult.statusCode,
          reason: mutationResult.reason,
          ok: mutationResult.ok,
        });
        if (mutationResult.ok) {
          this.#recordSuccessfulSend(postMetadata.mediaPk, nowMs, rateLimit);
          this.diagnostics.signals_sent += 1;
          this.#dequeueHead();
          await this.stateStore.save(this.state);
          continue;
        }

        if (mutationResult.statusCode === 429) {
          this.state.circuitBreakerUntilMs = nowMs + rateLimit.circuitBreakerMinutes * 60 * 1_000;
          await this.stateStore.save(this.state);
          this.#dequeueHead();
          this.#scheduleQueueProcessing(this.state.circuitBreakerUntilMs - nowMs);
          return;
        }

        this.logger.warn('Dropped signaling candidate after mutation failure.', {
          postCode: nextQueueItem.postCode,
          statusCode: mutationResult.statusCode,
          reason: mutationResult.reason,
        });
        this.#dequeueHead();
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Resolve wait time required before the next mutation send is allowed.
   *
   * @param {number} nowMs - Current timestamp.
   * @param {{
   *   maxPerMinute: number,
   *   maxPerDay: number
   * }} rateLimit - Effective rate-limit settings.
   * @returns {number}
   */
  #resolveRateLimitedDelay(nowMs, rateLimit) {
    if (this.nextAllowedAtMs > nowMs) {
      return this.nextAllowedAtMs - nowMs;
    }

    if (this.state.minuteWindowMs.length >= rateLimit.maxPerMinute) {
      const oldestSendTimestamp = this.state.minuteWindowMs[0];
      return oldestSendTimestamp + MINUTE_WINDOW_MS - nowMs;
    }

    if (this.state.dayWindow.count >= rateLimit.maxPerDay) {
      return this.#millisecondsUntilNextUtcDay(nowMs);
    }

    return 0;
  }

  /**
   * Record one successful mutation send for dedupe and rate tracking.
   *
   * @param {string} mediaPk - Target post id.
   * @param {number} nowMs - Current timestamp.
   * @param {{
   *   minIntervalSeconds: number,
   *   jitterSeconds: number
   * }} rateLimit - Effective rate-limit settings.
   */
  #recordSuccessfulSend(mediaPk, nowMs, rateLimit) {
    this.state.sentMediaPks.push(mediaPk);
    if (this.state.sentMediaPks.length > MAX_SENT_MEDIA_HISTORY) {
      this.state.sentMediaPks = this.state.sentMediaPks.slice(-MAX_SENT_MEDIA_HISTORY);
    }

    this.state.minuteWindowMs.push(nowMs);
    this.state.lastSentAtMs = nowMs;
    this.state.dayWindow.count += 1;

    const jitterWindowMs = rateLimit.jitterSeconds * 1_000;
    const jitterOffsetMs =
      jitterWindowMs > 0 ? Math.floor(this.randomProvider() * jitterWindowMs) : 0;
    this.nextAllowedAtMs = nowMs + rateLimit.minIntervalSeconds * 1_000 + jitterOffsetMs;
  }

  /**
   * Refresh observer-backed bridge diagnostics and warn once when degraded.
   */
  #refreshObserverDiagnostics() {
    if (!this.networkObserver || typeof this.networkObserver.getDiagnostics !== 'function') {
      return;
    }

    const observerDiagnostics = this.networkObserver.getDiagnostics();
    this.diagnostics.bridge_ready = Boolean(
      observerDiagnostics && observerDiagnostics.bridge_ready === true
    );
    this.diagnostics.metadata_ingested = Number(
      observerDiagnostics && observerDiagnostics.metadata_ingested
    );
    if (!Number.isFinite(this.diagnostics.metadata_ingested)) {
      this.diagnostics.metadata_ingested = 0;
    }

    if (
      !this.diagnostics.bridge_ready &&
      this.diagnostics.metadata_ingested === 0 &&
      !this.didWarnBridgeUnavailable
    ) {
      this.didWarnBridgeUnavailable = true;
      this.logger.warn('Auto-signaling is degraded because metadata capture is unavailable.');
    }
  }

  /**
   * Drop oldest queued candidates when queue length reaches configured bounds.
   */
  #trimQueueToCapacity() {
    while (this.queue.length >= this.maxQueueLength) {
      const dropIndex = this.isProcessingQueue && this.queue.length > 1 ? 1 : 0;
      const droppedEntries = this.queue.splice(dropIndex, 1);
      const droppedCandidate = droppedEntries.length > 0 ? droppedEntries[0] : null;
      if (!droppedCandidate) {
        return;
      }

      this.queuedPostCodes.delete(droppedCandidate.postCode);
      this.logger.debug('Dropped signaling candidate because queue reached max capacity.', {
        postCode: droppedCandidate.postCode,
        maxQueueLength: this.maxQueueLength,
      });
    }
  }

  /**
   * Track one observed response status code for mutation send attempts.
   *
   * @param {number} statusCode - HTTP status code.
   */
  #recordSignalHttpStatus(statusCode) {
    const normalizedStatusCode = Number.isFinite(Number(statusCode)) ? Number(statusCode) : 0;
    const statusKey = String(normalizedStatusCode);
    this.diagnostics.signal_http_status[statusKey] =
      (this.diagnostics.signal_http_status[statusKey] || 0) + 1;
  }

  /**
   * Determine whether queue head still points to an element attached to DOM.
   *
   * @param {{ element?: HTMLElement|null }} queueCandidate - Candidate queue entry.
   * @returns {boolean}
   */
  #isQueueCandidateConnected(queueCandidate) {
    if (!queueCandidate || !queueCandidate.element || typeof queueCandidate.element !== 'object') {
      return true;
    }

    if (typeof queueCandidate.element.isConnected === 'boolean') {
      return queueCandidate.element.isConnected;
    }

    if (typeof document === 'undefined' || typeof document.contains !== 'function') {
      return true;
    }

    return document.contains(queueCandidate.element);
  }

  /**
   * Prune minute-window timestamps that are outside the rolling window.
   *
   * @param {number} nowMs - Current timestamp.
   */
  #pruneMinuteWindow(nowMs) {
    const threshold = nowMs - MINUTE_WINDOW_MS;
    this.state.minuteWindowMs = this.state.minuteWindowMs.filter(
      (timestamp) => timestamp > threshold
    );
  }

  /**
   * Align day-window counter with the current UTC day.
   *
   * @param {number} nowMs - Current timestamp.
   */
  #alignDayWindow(nowMs) {
    const dayKey = this.#buildUtcDayKey(nowMs);
    if (this.state.dayWindow.dayKey === dayKey) {
      return;
    }

    this.state.dayWindow = {
      dayKey,
      count: 0,
    };
  }

  /**
   * Determine whether one media pk has already been signaled.
   *
   * @param {string} mediaPk - Target media id.
   * @returns {boolean}
   */
  #wasAlreadySent(mediaPk) {
    return this.state.sentMediaPks.includes(mediaPk);
  }

  /**
   * Remove the current queue head and its dedupe marker.
   */
  #dequeueHead() {
    const dequeuedItem = this.queue.shift();
    if (!dequeuedItem) {
      return;
    }

    this.queuedPostCodes.delete(dequeuedItem.postCode);
  }

  /**
   * Schedule queue processing after a delay.
   *
   * @param {number} delayMs - Milliseconds until next processing attempt.
   */
  #scheduleQueueProcessing(delayMs) {
    if (!this.isStarted) {
      return;
    }

    const safeDelayMs = Math.max(0, Math.floor(delayMs));
    this.#clearProcessingTimer();
    this.processingTimerId = this.scheduleFn(() => {
      this.processingTimerId = null;
      void this.#processQueue();
    }, safeDelayMs);
  }

  /**
   * Clear pending queue-processing timer if present.
   */
  #clearProcessingTimer() {
    if (this.processingTimerId === null || this.processingTimerId === undefined) {
      return;
    }

    this.clearScheduleFn(this.processingTimerId);
    this.processingTimerId = null;
  }

  /**
   * Build normalized UTC day key from one timestamp.
   *
   * @param {number} timestampMs - Timestamp in milliseconds.
   * @returns {string}
   */
  #buildUtcDayKey(timestampMs) {
    return new Date(timestampMs).toISOString().slice(0, 10);
  }

  /**
   * Resolve milliseconds until the next UTC day boundary.
   *
   * @param {number} nowMs - Current timestamp.
   * @returns {number}
   */
  #millisecondsUntilNextUtcDay(nowMs) {
    const nowDate = new Date(nowMs);
    const nextDayDate = new Date(
      Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate() + 1)
    );
    return Math.max(0, nextDayDate.getTime() - nowMs);
  }

  /**
   * Read cookie value by key.
   *
   * @param {string} cookieName - Cookie name.
   * @returns {string}
   */
  #readCookieValue(cookieName) {
    if (typeof document === 'undefined' || typeof document.cookie !== 'string') {
      return '';
    }

    const segments = document.cookie.split(';');
    for (const segment of segments) {
      const [rawName, ...rawValueParts] = segment.split('=');
      const normalizedName = String(rawName || '').trim();
      if (normalizedName !== cookieName) {
        continue;
      }

      return decodeURIComponent(rawValueParts.join('=').trim());
    }

    return '';
  }
}

module.exports = {
  NotInterestedDispatcher,
};
