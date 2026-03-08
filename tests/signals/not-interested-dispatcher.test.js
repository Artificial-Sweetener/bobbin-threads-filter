const { NotInterestedDispatcher } = require('../../src/signals/not-interested-dispatcher');

function createSettings(overrides = {}) {
  const usernameOverrides =
    overrides.filters && overrides.filters.username && overrides.filters.username.notInterested
      ? overrides.filters.username.notInterested
      : {};
  const trendingOverrides =
    overrides.filters && overrides.filters.trending && overrides.filters.trending.notInterested
      ? overrides.filters.trending.notInterested
      : {};
  const phraseOverrides =
    overrides.filters && overrides.filters.phrase && overrides.filters.phrase.notInterested
      ? overrides.filters.phrase.notInterested
      : {};
  return {
    filters: {
      username: {
        notInterested: {
          enabledHandles: [],
          ...usernameOverrides,
        },
      },
      trending: {
        notInterested: {
          enabledTopics: [],
          ...trendingOverrides,
        },
      },
      phrase: {
        notInterested: {
          enabledEntries: [],
          enabledPatterns: [],
          rateLimit: {
            minIntervalSeconds: 8,
            jitterSeconds: 2,
            maxPerMinute: 6,
            maxPerDay: 120,
            circuitBreakerMinutes: 15,
          },
          ...phraseOverrides,
        },
      },
    },
  };
}

function createCatalog(map) {
  return {
    getByPostCode(postCode) {
      return map[postCode] || null;
    },
  };
}

function createNetworkObserver(overrides = {}) {
  return {
    getRequestContext: () => ({ headers: {}, formFields: {} }),
    getDiagnostics: () => ({ bridge_ready: true, metadata_ingested: 1 }),
    ...overrides,
  };
}

function createStateStore() {
  const state = {
    sentMediaPks: [],
    minuteWindowMs: [],
    dayWindow: { dayKey: '', count: 0 },
    lastSentAtMs: 0,
    circuitBreakerUntilMs: 0,
  };

  return {
    load: jest.fn(async () => ({ ...state })),
    save: jest.fn(async () => {}),
  };
}

function createDecision(pattern) {
  return {
    blocked: true,
    matches: [{ kind: 'phrase', mode: 'text', pattern }],
  };
}

function createUsernameDecision(handle) {
  return {
    blocked: true,
    matches: [{ kind: 'username', mode: 'handle', pattern: handle }],
  };
}

function createTrendingDecision(topic) {
  return {
    blocked: true,
    matches: [{ kind: 'trending', mode: 'topic', pattern: topic }],
  };
}

describe('NotInterestedDispatcher', () => {
  test('sends not-interested mutation for enabled phrase pattern', async () => {
    document.cookie = 'ds_user_id=12345';

    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const stateStore = createStateStore();
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST01: {
          postCode: 'POST01',
          mediaPk: '90001',
          rankingInfoToken: 'token-a',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore,
      nowProvider: () => 1000,
      randomProvider: () => 0,
      scheduleFn: (callback, _delayMs) => {
        callback();
        return 1;
      },
      clearScheduleFn: () => {},
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    dispatcher.enqueue({ postCode: 'POST01' }, createDecision('AI slop'), {
      ...createSettings(),
      filters: {
        phrase: {
          notInterested: {
            ...createSettings().filters.phrase.notInterested,
            enabledPatterns: ['AI slop'],
          },
        },
      },
    });
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(1);
    expect(client.sendNotInterested).toHaveBeenCalledWith({
      viewerPk: '12345',
      mediaPk: '90001',
      rankingInfoToken: 'token-a',
    });
  });

  test('sends not-interested mutation for enabled username handle', async () => {
    document.cookie = 'ds_user_id=67890';

    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST42: {
          postCode: 'POST42',
          mediaPk: '9042',
          rankingInfoToken: 'token-user',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      nowProvider: () => 1_500,
      randomProvider: () => 0,
      scheduleFn: (callback, _delayMs) => {
        callback();
        return 1;
      },
      clearScheduleFn: () => {},
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    dispatcher.enqueue(
      { postCode: 'POST42' },
      createUsernameDecision('Noisy_Account'),
      createSettings({
        filters: {
          username: {
            notInterested: {
              enabledHandles: ['@noisy_account'],
            },
          },
        },
      })
    );
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(1);
    expect(client.sendNotInterested).toHaveBeenCalledWith({
      viewerPk: '67890',
      mediaPk: '9042',
      rankingInfoToken: 'token-user',
    });
  });

  test('skips username signaling when matched handle is not enabled', async () => {
    document.cookie = 'ds_user_id=67890';

    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST43: {
          postCode: 'POST43',
          mediaPk: '9043',
          rankingInfoToken: 'token-user',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      nowProvider: () => 1_500,
      randomProvider: () => 0,
      scheduleFn: (callback, _delayMs) => {
        callback();
        return 1;
      },
      clearScheduleFn: () => {},
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    dispatcher.enqueue(
      { postCode: 'POST43' },
      createUsernameDecision('silent_account'),
      createSettings({
        filters: {
          username: {
            notInterested: {
              enabledHandles: ['noisy_account'],
            },
          },
        },
      })
    );
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(0);
  });

  test('sends not-interested mutation for enabled trending topic', async () => {
    document.cookie = 'ds_user_id=67890';

    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST44: {
          postCode: 'POST44',
          mediaPk: '9044',
          rankingInfoToken: 'token-trending',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      nowProvider: () => 1_500,
      randomProvider: () => 0,
      scheduleFn: (callback, _delayMs) => {
        callback();
        return 1;
      },
      clearScheduleFn: () => {},
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    dispatcher.enqueue(
      { postCode: 'POST44' },
      createTrendingDecision('Daily Deals'),
      createSettings({
        filters: {
          trending: {
            notInterested: {
              enabledTopics: ['daily deals'],
            },
          },
        },
      })
    );
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(1);
    expect(client.sendNotInterested).toHaveBeenCalledWith({
      viewerPk: '67890',
      mediaPk: '9044',
      rankingInfoToken: 'token-trending',
    });
  });

  test('skips trending signaling when matched topic is not enabled', async () => {
    document.cookie = 'ds_user_id=67890';

    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST45: {
          postCode: 'POST45',
          mediaPk: '9045',
          rankingInfoToken: 'token-trending',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      nowProvider: () => 1_500,
      randomProvider: () => 0,
      scheduleFn: (callback, _delayMs) => {
        callback();
        return 1;
      },
      clearScheduleFn: () => {},
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    dispatcher.enqueue(
      { postCode: 'POST45' },
      createTrendingDecision('Local Events'),
      createSettings({
        filters: {
          trending: {
            notInterested: {
              enabledTopics: ['daily deals'],
            },
          },
        },
      })
    );
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(0);
  });

  test('skips not-interested dispatch for non-phrase rule matches', async () => {
    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({}),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      scheduleFn: () => 1,
      clearScheduleFn: () => {},
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    dispatcher.enqueue(
      { postCode: 'POST01' },
      {
        blocked: true,
        matches: [],
      },
      createSettings({
        filters: {
          phrase: {
            notInterested: {
              enabledPatterns: ['AI slop'],
            },
          },
        },
      })
    );

    expect(client.sendNotInterested).toHaveBeenCalledTimes(0);
  });

  test('matches mode-aware enabled entries before legacy pattern fallback', async () => {
    document.cookie = 'ds_user_id=4321';

    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST01: {
          postCode: 'POST01',
          mediaPk: '90001',
          rankingInfoToken: 'token-a',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      nowProvider: () => 1_000,
      randomProvider: () => 0,
      scheduleFn: (callback, _delayMs) => {
        callback();
        return 1;
      },
      clearScheduleFn: () => {},
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    dispatcher.enqueue(
      { postCode: 'POST01' },
      {
        blocked: true,
        matches: [{ kind: 'phrase', mode: 'regex', pattern: 'sale' }],
      },
      createSettings({
        filters: {
          phrase: {
            notInterested: {
              enabledEntries: [{ pattern: 'sale', isRegex: true }],
              enabledPatterns: [],
            },
          },
        },
      })
    );
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(1);
  });

  test('enforces per-minute rate limit', async () => {
    let nowMs = 2_000;
    let timerId = 0;
    const scheduledDelays = [];
    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };

    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST01: {
          postCode: 'POST01',
          mediaPk: '90001',
          rankingInfoToken: 'token-a',
        },
        POST02: {
          postCode: 'POST02',
          mediaPk: '90002',
          rankingInfoToken: 'token-b',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      nowProvider: () => nowMs,
      randomProvider: () => 0,
      scheduleFn: (callback, delayMs) => {
        timerId += 1;
        scheduledDelays.push(delayMs);
        if (delayMs === 0) {
          callback();
        }
        return timerId;
      },
      clearScheduleFn: () => {},
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    const settings = createSettings({
      filters: {
        phrase: {
          notInterested: {
            enabledPatterns: ['AI slop'],
            rateLimit: {
              minIntervalSeconds: 0,
              jitterSeconds: 0,
              maxPerMinute: 1,
              maxPerDay: 100,
              circuitBreakerMinutes: 15,
            },
          },
        },
      },
    });

    dispatcher.enqueue({ postCode: 'POST01' }, createDecision('AI slop'), settings);
    await Promise.resolve();
    expect(client.sendNotInterested).toHaveBeenCalledTimes(1);

    nowMs = 2_001;
    dispatcher.enqueue({ postCode: 'POST02' }, createDecision('AI slop'), settings);
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(1);
    expect(scheduledDelays.some((delayMs) => delayMs > 0)).toBe(true);
  });

  test('sends only once per media id', async () => {
    document.cookie = 'ds_user_id=999';

    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST01: {
          postCode: 'POST01',
          mediaPk: '90001',
          rankingInfoToken: 'token-a',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      nowProvider: () => 3_000,
      randomProvider: () => 0,
      scheduleFn: (callback, _delayMs) => {
        callback();
        return 1;
      },
      clearScheduleFn: () => {},
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    const settings = createSettings({
      filters: {
        phrase: {
          notInterested: {
            enabledPatterns: ['AI slop'],
            rateLimit: {
              minIntervalSeconds: 0,
              jitterSeconds: 0,
              maxPerMinute: 10,
              maxPerDay: 100,
              circuitBreakerMinutes: 15,
            },
          },
        },
      },
    });

    dispatcher.enqueue({ postCode: 'POST01' }, createDecision('AI slop'), settings);
    await Promise.resolve();
    dispatcher.enqueue({ postCode: 'POST01' }, createDecision('AI slop'), settings);
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(1);
  });

  test('skips signaling and increments diagnostics when metadata is missing', async () => {
    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const logger = { debug: jest.fn(), warn: jest.fn() };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({}),
      networkObserver: createNetworkObserver({
        getDiagnostics: () => ({ bridge_ready: false, metadata_ingested: 0 }),
      }),
      client,
      stateStore: createStateStore(),
      nowProvider: () => 4_000,
      randomProvider: () => 0,
      scheduleFn: (callback, _delayMs) => {
        callback();
        return 1;
      },
      clearScheduleFn: () => {},
      logger,
    });

    await dispatcher.start();
    dispatcher.enqueue(
      { postCode: 'POST02' },
      createDecision('AI slop'),
      createSettings({
        filters: {
          phrase: {
            notInterested: {
              enabledPatterns: ['AI slop'],
            },
          },
        },
      })
    );
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(0);
    expect(dispatcher.getDiagnostics().signals_skipped_missing_metadata).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Auto-signaling is degraded because metadata capture is unavailable.'
    );
  });

  test('skips signaling when ranking token is missing from captured metadata', async () => {
    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const logger = { debug: jest.fn(), warn: jest.fn() };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST03: {
          postCode: 'POST03',
          mediaPk: '90003',
          rankingInfoToken: '',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      nowProvider: () => 4_500,
      randomProvider: () => 0,
      scheduleFn: (callback, _delayMs) => {
        callback();
        return 1;
      },
      clearScheduleFn: () => {},
      logger,
    });

    await dispatcher.start();
    dispatcher.enqueue(
      { postCode: 'POST03' },
      createDecision('AI slop'),
      createSettings({
        filters: {
          phrase: {
            notInterested: {
              enabledPatterns: ['AI slop'],
            },
          },
        },
      })
    );
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(0);
    expect(dispatcher.getDiagnostics().signals_skipped_missing_metadata).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith(
      'Skipped signaling because ranking metadata is unavailable.',
      {
        postCode: 'POST03',
        mediaPk: '90003',
        matchedPatterns: ['AI slop'],
      }
    );
  });

  test('drops oldest queued candidates when queue reaches max length', async () => {
    document.cookie = 'ds_user_id=123';

    let nextTimerId = 0;
    const scheduledCallbacks = new Map();
    const scheduleFn = (callback, _delayMs) => {
      nextTimerId += 1;
      scheduledCallbacks.set(nextTimerId, callback);
      return nextTimerId;
    };
    const clearScheduleFn = (timerId) => {
      scheduledCallbacks.delete(timerId);
    };
    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST01: {
          postCode: 'POST01',
          mediaPk: '90001',
          rankingInfoToken: 'token-a',
        },
        POST02: {
          postCode: 'POST02',
          mediaPk: '90002',
          rankingInfoToken: 'token-b',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      maxQueueLength: 1,
      nowProvider: () => 5_000,
      randomProvider: () => 0,
      scheduleFn,
      clearScheduleFn,
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    const settings = createSettings({
      filters: {
        phrase: {
          notInterested: {
            enabledPatterns: ['AI slop'],
            rateLimit: {
              minIntervalSeconds: 0,
              jitterSeconds: 0,
              maxPerMinute: 10,
              maxPerDay: 100,
              circuitBreakerMinutes: 15,
            },
          },
        },
      },
    });

    dispatcher.enqueue({ postCode: 'POST01' }, createDecision('AI slop'), settings);
    dispatcher.enqueue({ postCode: 'POST02' }, createDecision('AI slop'), settings);

    for (const callback of scheduledCallbacks.values()) {
      callback();
    }
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(1);
    expect(client.sendNotInterested).toHaveBeenCalledWith({
      viewerPk: '123',
      mediaPk: '90002',
      rankingInfoToken: 'token-b',
    });
  });

  test('drops queued candidate when original post element disconnects', async () => {
    document.cookie = 'ds_user_id=123';

    const detachedElement = document.createElement('div');
    const client = {
      sendNotInterested: jest.fn(async () => ({
        ok: true,
        statusCode: 200,
        reason: 'ok',
      })),
    };
    const dispatcher = new NotInterestedDispatcher({
      postMetadataCatalog: createCatalog({
        POST01: {
          postCode: 'POST01',
          mediaPk: '90001',
          rankingInfoToken: 'token-a',
        },
      }),
      networkObserver: createNetworkObserver(),
      client,
      stateStore: createStateStore(),
      nowProvider: () => 6_000,
      randomProvider: () => 0,
      scheduleFn: (callback, _delayMs) => {
        callback();
        return 1;
      },
      clearScheduleFn: () => {},
      logger: { debug: () => {}, warn: () => {} },
    });

    await dispatcher.start();
    dispatcher.enqueue(
      {
        postCode: 'POST01',
        element: detachedElement,
      },
      createDecision('AI slop'),
      createSettings({
        filters: {
          phrase: {
            notInterested: {
              enabledPatterns: ['AI slop'],
            },
          },
        },
      })
    );
    await Promise.resolve();

    expect(client.sendNotInterested).toHaveBeenCalledTimes(0);
  });
});
