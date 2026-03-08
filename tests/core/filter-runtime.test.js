const { FilterRuntime } = require('../../src/core/filter-runtime');
const { BlockedPostCatalog } = require('../../src/core/blocked-post-catalog');
const { SettingsSchema } = require('../../src/storage/settings-schema');

function createRuntimeHarness({
  contentModels = [],
  evaluateDecision = { blocked: false, reasons: [] },
  evaluateFn = null,
  blockedPostCatalog = null,
  nowProvider = () => Date.now(),
  scheduleFn = null,
  clearScheduleFn = null,
} = {}) {
  const settings = new SettingsSchema().createDefaults();
  const settingsStore = {
    load: jest.fn().mockResolvedValue(settings),
  };
  const feedAdapter = {
    collectContentModels: jest.fn().mockReturnValue(contentModels),
  };
  const ruleEngine = {
    evaluate:
      typeof evaluateFn === 'function'
        ? jest.fn().mockImplementation(evaluateFn)
        : jest.fn().mockReturnValue(evaluateDecision),
  };
  const styleManager = {
    ensureFilterStyles: jest.fn(),
    hideElement: jest.fn(),
    unhideElement: jest.fn(),
    clearAllHiddenMarkers: jest.fn(),
    syncFirstVisibleTimelineDividers: jest.fn(),
    clearAllTimelineDividerMarkers: jest.fn(),
    setVerifiedBadgesHidden: jest.fn(),
    clearAllVerifiedBadgeMarkers: jest.fn(),
  };
  const menuCommandRegistrar = {
    register: jest.fn(),
  };
  const settingsMenu = {
    isOpen: false,
    toggle: jest.fn().mockImplementation(async () => {
      settingsMenu.isOpen = !settingsMenu.isOpen;
    }),
    destroy: jest.fn(),
  };
  const settingsMenuTrigger = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    setMenuOpen: jest.fn(),
  };
  const mutationManager = {
    start: jest.fn(),
    stop: jest.fn(),
  };
  const activityWatcher = {
    start: jest.fn(),
    stop: jest.fn(),
  };
  const networkObserver = {
    start: jest.fn(),
    stop: jest.fn(),
  };
  const postMetadataCatalog = {
    getByPostCode: jest.fn().mockReturnValue(null),
  };
  const notInterestedDispatcher = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    enqueue: jest.fn(),
  };
  const logger = {
    setLevel: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const resolvedBlockedPostCatalog = blockedPostCatalog || new BlockedPostCatalog({ nowProvider });

  const runtime = new FilterRuntime({
    settingsStore,
    feedAdapter,
    ruleEngine,
    blockedPostCatalog: resolvedBlockedPostCatalog,
    mutationManager,
    activityWatcher,
    styleManager,
    menuCommandRegistrar,
    settingsMenu,
    settingsMenuTrigger,
    postMetadataCatalog,
    networkObserver,
    notInterestedDispatcher,
    nowProvider,
    scheduleFn: typeof scheduleFn === 'function' ? scheduleFn : undefined,
    clearScheduleFn: typeof clearScheduleFn === 'function' ? clearScheduleFn : undefined,
    logger,
  });

  return {
    runtime,
    settings,
    settingsStore,
    feedAdapter,
    ruleEngine,
    styleManager,
    menuCommandRegistrar,
    settingsMenu,
    settingsMenuTrigger,
    mutationManager,
    activityWatcher,
    postMetadataCatalog,
    networkObserver,
    notInterestedDispatcher,
    blockedPostCatalog: resolvedBlockedPostCatalog,
    logger,
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('FilterRuntime', () => {
  test('registers settings toggle command and delegates to settings menu', async () => {
    const { runtime, menuCommandRegistrar, settingsMenu, settingsMenuTrigger } =
      createRuntimeHarness();

    await runtime.start();

    expect(menuCommandRegistrar.register).toHaveBeenCalledTimes(1);
    expect(settingsMenuTrigger.start).toHaveBeenCalledTimes(1);
    const [label, handler] = menuCommandRegistrar.register.mock.calls[0];
    expect(label).toBe('Bobbin Threads Filter: Toggle Settings');

    handler();
    await flushAsyncWork();
    expect(settingsMenu.toggle).toHaveBeenCalledTimes(1);
    expect(settingsMenuTrigger.setMenuOpen).toHaveBeenCalledWith(true);

    runtime.stop();
    expect(settingsMenu.destroy).toHaveBeenCalledTimes(1);
    expect(settingsMenuTrigger.stop).toHaveBeenCalledTimes(1);
  });

  test('clears stale hide markers only after sustained zero-model extraction', async () => {
    let nowMs = 1_000;
    const { runtime, styleManager, ruleEngine } = createRuntimeHarness({
      contentModels: [],
      nowProvider: () => nowMs,
    });

    await runtime.runCycle();

    expect(styleManager.clearAllHiddenMarkers).not.toHaveBeenCalled();
    expect(ruleEngine.evaluate).not.toHaveBeenCalled();

    nowMs = 3_600;
    await runtime.runCycle();

    expect(styleManager.clearAllHiddenMarkers).toHaveBeenCalledTimes(1);
    expect(styleManager.clearAllHiddenMarkers).toHaveBeenCalledWith(document);
    expect(ruleEngine.evaluate).not.toHaveBeenCalled();

    nowMs = 5_000;
    await runtime.runCycle();
    expect(styleManager.clearAllHiddenMarkers).toHaveBeenCalledTimes(1);
  });

  test('resets empty-extraction recovery timer after a non-empty cycle', async () => {
    let nowMs = 1_000;
    const modelElement = document.createElement('div');
    const { runtime, feedAdapter, styleManager } = createRuntimeHarness({
      contentModels: [],
      nowProvider: () => nowMs,
    });

    feedAdapter.collectContentModels
      .mockImplementationOnce(() => [])
      .mockImplementationOnce(() => [
        {
          element: modelElement,
          postCode: 'POST01',
          authorHandle: 'demo',
        },
      ])
      .mockImplementationOnce(() => [])
      .mockImplementationOnce(() => []);

    await runtime.runCycle();
    expect(styleManager.clearAllHiddenMarkers).not.toHaveBeenCalled();

    nowMs = 2_000;
    await runtime.runCycle();
    expect(styleManager.clearAllHiddenMarkers).not.toHaveBeenCalled();

    nowMs = 2_100;
    await runtime.runCycle();
    expect(styleManager.clearAllHiddenMarkers).not.toHaveBeenCalled();

    nowMs = 4_800;
    await runtime.runCycle();
    expect(styleManager.clearAllHiddenMarkers).toHaveBeenCalledTimes(1);
  });

  test('passes post code marker when hiding blocked content', async () => {
    const modelElement = document.createElement('div');
    const { runtime, styleManager } = createRuntimeHarness({
      contentModels: [
        {
          element: modelElement,
          postCode: 'POST01',
          authorHandle: 'demo',
        },
      ],
      evaluateDecision: {
        blocked: true,
        reasons: ['phrase:match'],
        matches: [{ kind: 'phrase', mode: 'text', pattern: 'sale' }],
      },
    });

    await runtime.runCycle();

    expect(styleManager.hideElement).toHaveBeenCalledTimes(1);
    expect(styleManager.hideElement).toHaveBeenCalledWith(modelElement, ['phrase:match'], {
      postCode: 'POST01',
    });
    expect(styleManager.syncFirstVisibleTimelineDividers).toHaveBeenCalledWith(
      [modelElement],
      document
    );
  });

  test('enriches models with AI metadata from every referenced post code', async () => {
    const modelElement = document.createElement('div');
    const { runtime, ruleEngine, postMetadataCatalog } = createRuntimeHarness({
      contentModels: [
        {
          element: modelElement,
          postCode: 'REPOST01',
          postCodes: ['REPOST01', 'SOURCE01'],
          authorHandle: 'reposter',
        },
      ],
      evaluateDecision: {
        blocked: false,
        reasons: [],
        matches: [],
      },
    });
    postMetadataCatalog.getByPostCode.mockImplementation((postCode) => {
      if (postCode === 'SOURCE01') {
        return {
          postCode: 'SOURCE01',
          mediaPk: 'source-media',
          rankingInfoToken: 'source-token',
          authorPk: 'source-author',
          hasAiLabel: true,
          genAIDetectionMethod: 'SELF_DISCLOSURE_FLOW',
        };
      }

      return null;
    });

    await runtime.runCycle();

    expect(ruleEngine.evaluate).toHaveBeenCalledTimes(1);
    expect(ruleEngine.evaluate.mock.calls[0][0].hasAiLabel).toBe(true);
    expect(ruleEngine.evaluate.mock.calls[0][0].aiDetectionMethods).toEqual([
      'SELF_DISCLOSURE_FLOW',
    ]);
  });

  test('does not mark models as AI-labeled when metadata detection method is NONE', async () => {
    const modelElement = document.createElement('div');
    const { runtime, ruleEngine, postMetadataCatalog } = createRuntimeHarness({
      contentModels: [
        {
          element: modelElement,
          postCode: 'POSTNONE',
          authorHandle: 'normal_user',
        },
      ],
      evaluateDecision: {
        blocked: false,
        reasons: [],
        matches: [],
      },
    });
    postMetadataCatalog.getByPostCode.mockReturnValue({
      postCode: 'POSTNONE',
      mediaPk: 'postnone-media',
      rankingInfoToken: 'postnone-token',
      authorPk: 'normal-author',
      hasAiLabel: false,
      genAIDetectionMethod: 'NONE',
    });

    await runtime.runCycle();

    expect(ruleEngine.evaluate).toHaveBeenCalledTimes(1);
    expect(ruleEngine.evaluate.mock.calls[0][0].hasAiLabel).toBe(false);
    expect(ruleEngine.evaluate.mock.calls[0][0].aiDetectionMethods).toEqual([]);
  });

  test('disables verified row filtering on profile routes', async () => {
    window.history.pushState({}, '', '/@verified_user');
    const modelElement = document.createElement('div');
    const { runtime, ruleEngine, styleManager } = createRuntimeHarness({
      contentModels: [
        {
          element: modelElement,
          postCode: 'POST01',
          authorHandle: 'verified_user',
          isVerified: true,
          hasBlueCheck: true,
        },
      ],
      evaluateFn: (_model, settings) => {
        if (settings.filters.verified.enabled === true) {
          return {
            blocked: true,
            reasons: ['verified:badge'],
            matches: [],
          };
        }

        return {
          blocked: false,
          reasons: [],
          matches: [],
        };
      },
    });

    await runtime.runCycle();

    expect(ruleEngine.evaluate).toHaveBeenCalledTimes(1);
    expect(ruleEngine.evaluate.mock.calls[0][1].filters.verified.enabled).toBe(false);
    expect(styleManager.hideElement).not.toHaveBeenCalled();
    expect(styleManager.unhideElement).toHaveBeenCalledWith(modelElement);
    window.history.pushState({}, '', '/');
  });

  test('keeps non-verified filters active on profile routes', async () => {
    window.history.pushState({}, '', '/@trusted_creator');
    const modelElement = document.createElement('div');
    const { runtime, styleManager } = createRuntimeHarness({
      contentModels: [
        {
          element: modelElement,
          postCode: 'POST02',
          text: 'promoted post body',
        },
      ],
      evaluateFn: (_model, settings) => ({
        blocked: settings.filters.phrase.enabled === true,
        reasons: settings.filters.phrase.enabled === true ? ['phrase:match'] : [],
        matches: [],
      }),
    });

    await runtime.runCycle();

    expect(styleManager.hideElement).toHaveBeenCalledWith(modelElement, ['phrase:match'], {
      postCode: 'POST02',
    });
    window.history.pushState({}, '', '/');
  });

  test('applies verified badge masking independently of row filtering', async () => {
    const modelElement = document.createElement('div');
    const { runtime, settings, styleManager } = createRuntimeHarness({
      contentModels: [
        {
          element: modelElement,
          postCode: 'POST01',
          authorHandle: 'demo',
        },
      ],
      evaluateDecision: {
        blocked: false,
        reasons: [],
        matches: [],
      },
    });
    settings.filters.verified.hideBadges = true;

    await runtime.runCycle();

    expect(styleManager.setVerifiedBadgesHidden).toHaveBeenCalledWith(modelElement, true);
    expect(styleManager.unhideElement).toHaveBeenCalledWith(modelElement);
    expect(styleManager.clearAllVerifiedBadgeMarkers).not.toHaveBeenCalled();
  });

  test('clears badge visibility markers after badge masking is disabled', async () => {
    const modelElement = document.createElement('div');
    const { runtime, settings, feedAdapter, styleManager } = createRuntimeHarness({
      contentModels: [],
      evaluateDecision: {
        blocked: false,
        reasons: [],
        matches: [],
      },
    });
    feedAdapter.collectContentModels
      .mockImplementationOnce(() => [
        {
          element: modelElement,
          postCode: 'POST01',
          authorHandle: 'demo',
        },
      ])
      .mockImplementationOnce(() => []);

    settings.filters.verified.hideBadges = true;
    await runtime.runCycle();

    settings.filters.verified.hideBadges = false;
    await runtime.runCycle();

    expect(styleManager.clearAllVerifiedBadgeMarkers).toHaveBeenCalledWith(document);
  });

  test('requests timeline backfill when current model batch is fully filtered', async () => {
    const timelineRegion = document.createElement('div');
    timelineRegion.setAttribute('aria-label', 'Column body');
    Object.defineProperty(timelineRegion, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(timelineRegion, 'scrollHeight', {
      value: 1_800,
      configurable: true,
    });
    Object.defineProperty(timelineRegion, 'clientHeight', {
      value: 900,
      configurable: true,
    });
    document.body.appendChild(timelineRegion);

    let regionScrollEventCount = 0;
    timelineRegion.addEventListener('scroll', () => {
      regionScrollEventCount += 1;
    });

    const windowDispatchSpy = jest.spyOn(window, 'dispatchEvent');
    const modelElement = document.createElement('div');
    const { runtime } = createRuntimeHarness({
      contentModels: [
        {
          element: modelElement,
          postCode: 'POST01',
        },
      ],
      evaluateDecision: {
        blocked: true,
        reasons: ['verified:badge'],
        matches: [],
      },
    });

    await runtime.runCycle();

    expect(timelineRegion.scrollTop).toBeGreaterThan(0);
    expect(regionScrollEventCount).toBeGreaterThan(0);
    expect(
      windowDispatchSpy.mock.calls.some(
        (call) => Array.isArray(call) && call[0] && call[0].type === 'scroll'
      )
    ).toBe(true);

    windowDispatchSpy.mockRestore();
    timelineRegion.remove();
  });

  test('skips timeline backfill when unfiltered content remains visible', async () => {
    const timelineRegion = document.createElement('div');
    timelineRegion.setAttribute('aria-label', 'Column body');
    Object.defineProperty(timelineRegion, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(timelineRegion, 'scrollHeight', {
      value: 1_800,
      configurable: true,
    });
    Object.defineProperty(timelineRegion, 'clientHeight', {
      value: 900,
      configurable: true,
    });
    document.body.appendChild(timelineRegion);

    let regionScrollEventCount = 0;
    timelineRegion.addEventListener('scroll', () => {
      regionScrollEventCount += 1;
    });

    const blockedElement = document.createElement('div');
    const allowedElement = document.createElement('div');
    const { runtime } = createRuntimeHarness({
      contentModels: [
        {
          element: blockedElement,
          postCode: 'BLOCKED01',
        },
        {
          element: allowedElement,
          postCode: 'ALLOWED01',
        },
      ],
      evaluateFn: (model) => {
        if (model.postCode === 'BLOCKED01') {
          return {
            blocked: true,
            reasons: ['verified:badge'],
            matches: [],
          };
        }

        return {
          blocked: false,
          reasons: [],
          matches: [],
        };
      },
    });

    await runtime.runCycle();

    expect(timelineRegion.scrollTop).toBe(0);
    expect(regionScrollEventCount).toBe(0);
    timelineRegion.remove();
  });

  test('retries timeline recovery after full filtering when subsequent cycle extracts no models', async () => {
    const timelineRegion = document.createElement('div');
    timelineRegion.setAttribute('aria-label', 'Column body');
    Object.defineProperty(timelineRegion, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(timelineRegion, 'scrollHeight', {
      value: 1_800,
      configurable: true,
    });
    Object.defineProperty(timelineRegion, 'clientHeight', {
      value: 900,
      configurable: true,
    });
    document.body.appendChild(timelineRegion);

    const blockedElement = document.createElement('div');
    const recoveredElement = document.createElement('div');
    const scheduledRecoveryRuns = [];
    const scheduleFn = jest.fn((callback, delayMs) => {
      scheduledRecoveryRuns.push({ callback, delayMs });
      return scheduledRecoveryRuns.length;
    });
    const clearScheduleFn = jest.fn();
    const { runtime, feedAdapter, styleManager } = createRuntimeHarness({
      contentModels: [],
      evaluateFn: (model) => {
        if (model.postCode === 'BLOCKED01') {
          return {
            blocked: true,
            reasons: ['verified:badge'],
            matches: [],
          };
        }

        return {
          blocked: false,
          reasons: [],
          matches: [],
        };
      },
      scheduleFn,
      clearScheduleFn,
    });

    feedAdapter.collectContentModels
      .mockImplementationOnce(() => [
        {
          element: blockedElement,
          postCode: 'BLOCKED01',
        },
      ])
      .mockImplementationOnce(() => [])
      .mockImplementationOnce(() => [
        {
          element: recoveredElement,
          postCode: 'VISIBLE01',
        },
      ]);

    await runtime.runCycle();
    expect(scheduleFn).toHaveBeenCalledTimes(1);
    expect(scheduledRecoveryRuns[0].delayMs).toBe(900);

    scheduledRecoveryRuns[0].callback();
    await flushAsyncWork();
    expect(scheduleFn).toHaveBeenCalledTimes(2);

    scheduledRecoveryRuns[1].callback();
    await flushAsyncWork();
    expect(styleManager.unhideElement).toHaveBeenCalledWith(recoveredElement);
    expect(scheduleFn).toHaveBeenCalledTimes(2);

    timelineRegion.remove();
  });

  test('cascade-hides replies that reference filtered parent posts in the same cycle', async () => {
    const parentElement = document.createElement('div');
    const replyElement = document.createElement('div');
    const { runtime, styleManager } = createRuntimeHarness({
      contentModels: [
        {
          element: parentElement,
          postCode: 'PARENT01',
          postCodes: ['PARENT01'],
        },
        {
          element: replyElement,
          postCode: 'REPLY01',
          postCodes: ['REPLY01', 'PARENT01'],
        },
      ],
      evaluateFn: (model) => {
        if (model.postCode === 'PARENT01') {
          return {
            blocked: true,
            reasons: ['phrase:match'],
            matches: [{ kind: 'phrase', mode: 'text', pattern: 'blocked phrase' }],
          };
        }

        return {
          blocked: false,
          reasons: [],
          matches: [],
        };
      },
    });

    await runtime.runCycle();

    expect(styleManager.hideElement).toHaveBeenCalledTimes(2);
    expect(styleManager.hideElement).toHaveBeenNthCalledWith(1, parentElement, ['phrase:match'], {
      postCode: 'PARENT01',
    });
    expect(styleManager.hideElement).toHaveBeenNthCalledWith(2, replyElement, ['thread:cascade'], {
      postCode: 'REPLY01',
    });
  });

  test('cascade-hides replies that reference previously filtered parent posts', async () => {
    const parentElement = document.createElement('div');
    const replyElement = document.createElement('div');
    const { runtime, feedAdapter, styleManager } = createRuntimeHarness({
      contentModels: [],
      evaluateFn: (model) => {
        if (model.postCode === 'PARENT01') {
          return {
            blocked: true,
            reasons: ['phrase:match'],
            matches: [{ kind: 'phrase', mode: 'text', pattern: 'blocked phrase' }],
          };
        }

        return {
          blocked: false,
          reasons: [],
          matches: [],
        };
      },
    });

    feedAdapter.collectContentModels
      .mockImplementationOnce(() => [
        {
          element: parentElement,
          postCode: 'PARENT01',
          postCodes: ['PARENT01'],
        },
      ])
      .mockImplementationOnce(() => [
        {
          element: replyElement,
          postCode: 'REPLY01',
          postCodes: ['REPLY01', 'PARENT01'],
        },
      ]);

    await runtime.runCycle();
    await runtime.runCycle();

    expect(styleManager.hideElement).toHaveBeenCalledTimes(2);
    expect(styleManager.hideElement).toHaveBeenNthCalledWith(2, replyElement, ['thread:cascade'], {
      postCode: 'REPLY01',
    });
  });

  test('resets blocked-post catalog when active settings object changes', async () => {
    const modelElement = document.createElement('div');
    const settingsSchema = new SettingsSchema();
    const firstSettings = settingsSchema.createDefaults();
    const secondSettings = settingsSchema.createDefaults();
    const blockedPostCatalog = new BlockedPostCatalog();
    const resetSpy = jest.spyOn(blockedPostCatalog, 'reset');
    const { runtime } = createRuntimeHarness({
      contentModels: [
        {
          element: modelElement,
          postCode: 'POST01',
          postCodes: ['POST01'],
        },
      ],
      blockedPostCatalog,
      evaluateDecision: {
        blocked: false,
        reasons: [],
        matches: [],
      },
    });

    runtime.settings = firstSettings;
    await runtime.runCycle();
    runtime.settings = secondSettings;
    await runtime.runCycle();

    expect(resetSpy).toHaveBeenCalledTimes(2);
  });
});
