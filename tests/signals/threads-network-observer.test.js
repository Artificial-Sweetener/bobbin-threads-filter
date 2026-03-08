const { ThreadsNetworkObserver } = require('../../src/signals/threads-network-observer');

const BRIDGE_CONTEXT_EVENT_NAME = 'btf:threads-network-observer:context';
const BRIDGE_PAYLOAD_EVENT_NAME = 'btf:threads-network-observer:payload';
const BRIDGE_READY_EVENT_NAME = 'btf:threads-network-observer:ready';

function createObserverHarness(overrides = {}) {
  const postMetadataCatalog = {
    ingestGraphqlPayload: jest.fn(() => 0),
  };
  const logger = {
    debug: jest.fn(),
    warn: jest.fn(),
  };
  const observer = new ThreadsNetworkObserver({
    postMetadataCatalog,
    logger,
    bridgeHandshakeTimeoutMs: 25,
    ...overrides,
  });

  return {
    observer,
    postMetadataCatalog,
    logger,
  };
}

function dispatchBridgeReadyEvent() {
  document.dispatchEvent(
    new CustomEvent(BRIDGE_READY_EVENT_NAME, {
      detail: JSON.stringify({ ready: true }),
    })
  );
}

async function flushDomMutations() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ThreadsNetworkObserver', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('ingests bootstrap metadata from existing application-json scripts on start', async () => {
    const { observer, postMetadataCatalog, logger } = createObserverHarness();
    postMetadataCatalog.ingestGraphqlPayload.mockReturnValue(2);
    const bootstrapScript = document.createElement('script');
    bootstrapScript.type = 'application/json';
    bootstrapScript.textContent = JSON.stringify({
      require: [
        [
          'ScheduledServerJS',
          'handle',
          null,
          [
            {
              data: {
                post: {
                  pk: '123',
                  code: 'POST123',
                  logging_info_token: 'token-123',
                  gen_ai_detection_method: {
                    detection_method: 'SELF_DISCLOSURE_FLOW',
                  },
                },
              },
            },
          ],
        ],
      ],
    });
    document.head.appendChild(bootstrapScript);

    try {
      const startPromise = observer.start();
      dispatchBridgeReadyEvent();
      await startPromise;

      expect(postMetadataCatalog.ingestGraphqlPayload).toHaveBeenCalledWith({
        require: [
          [
            'ScheduledServerJS',
            'handle',
            null,
            [
              {
                data: {
                  post: {
                    pk: '123',
                    code: 'POST123',
                    logging_info_token: 'token-123',
                    gen_ai_detection_method: {
                      detection_method: 'SELF_DISCLOSURE_FLOW',
                    },
                  },
                },
              },
            ],
          ],
        ],
      });
      expect(observer.getDiagnostics()).toEqual({
        bridge_ready: true,
        metadata_ingested: 2,
      });
      expect(logger.debug).toHaveBeenCalledWith(
        'Captured post metadata records from bootstrap scripts.',
        {
          ingestedRecordCount: 2,
        }
      );
    } finally {
      bootstrapScript.remove();
      observer.stop();
    }
  });

  test('ingests bootstrap metadata from scripts added after start', async () => {
    const { observer, postMetadataCatalog, logger } = createObserverHarness();
    postMetadataCatalog.ingestGraphqlPayload.mockReturnValue(1);

    const startPromise = observer.start();
    dispatchBridgeReadyEvent();
    await startPromise;

    const bootstrapScript = document.createElement('script');
    bootstrapScript.type = 'application/json';
    try {
      bootstrapScript.textContent = JSON.stringify({
        data: {
          post: {
            pk: '456',
            code: 'POST456',
            logging_info_token: null,
            gen_ai_detection_method: {
              detection_method: 'SELF_DISCLOSURE_FLOW',
            },
          },
        },
      });
      document.body.appendChild(bootstrapScript);
      await flushDomMutations();

      expect(postMetadataCatalog.ingestGraphqlPayload).toHaveBeenCalledWith({
        data: {
          post: {
            pk: '456',
            code: 'POST456',
            logging_info_token: null,
            gen_ai_detection_method: {
              detection_method: 'SELF_DISCLOSURE_FLOW',
            },
          },
        },
      });
      expect(observer.getDiagnostics()).toEqual({
        bridge_ready: true,
        metadata_ingested: 1,
      });
      expect(logger.debug).toHaveBeenCalledWith(
        'Captured post metadata records from bootstrap scripts.',
        {
          ingestedRecordCount: 1,
        }
      );
    } finally {
      bootstrapScript.remove();
      observer.stop();
    }
  });

  test('ingests bootstrap metadata when a script payload is populated after insertion', async () => {
    const { observer, postMetadataCatalog, logger } = createObserverHarness();
    postMetadataCatalog.ingestGraphqlPayload.mockReturnValue(1);

    const startPromise = observer.start();
    dispatchBridgeReadyEvent();
    await startPromise;

    const bootstrapScript = document.createElement('script');
    bootstrapScript.type = 'application/json';
    try {
      document.body.appendChild(bootstrapScript);
      await flushDomMutations();
      expect(postMetadataCatalog.ingestGraphqlPayload).toHaveBeenCalledTimes(0);

      bootstrapScript.textContent = JSON.stringify({
        data: {
          post: {
            pk: '789',
            code: 'POST789',
            logging_info_token: null,
            gen_ai_detection_method: {
              detection_method: 'SELF_DISCLOSURE_FLOW',
            },
          },
        },
      });
      await flushDomMutations();

      expect(postMetadataCatalog.ingestGraphqlPayload).toHaveBeenCalledWith({
        data: {
          post: {
            pk: '789',
            code: 'POST789',
            logging_info_token: null,
            gen_ai_detection_method: {
              detection_method: 'SELF_DISCLOSURE_FLOW',
            },
          },
        },
      });
      expect(observer.getDiagnostics()).toEqual({
        bridge_ready: true,
        metadata_ingested: 1,
      });
      expect(logger.debug).toHaveBeenCalledWith(
        'Captured post metadata records from bootstrap scripts.',
        {
          ingestedRecordCount: 1,
        }
      );
    } finally {
      bootstrapScript.remove();
      observer.stop();
    }
  });

  test('captures bridge context and payload updates after handshake', async () => {
    const { observer, postMetadataCatalog, logger } = createObserverHarness();
    postMetadataCatalog.ingestGraphqlPayload.mockReturnValue(3);

    const startPromise = observer.start();
    dispatchBridgeReadyEvent();
    await startPromise;

    document.dispatchEvent(
      new CustomEvent(BRIDGE_CONTEXT_EVENT_NAME, {
        detail: JSON.stringify({
          headers: {
            'x-csrftoken': 'csrf-token',
          },
          formFields: {
            av: '1784',
            fb_dtsg: 'fb-dtsg-token',
            jazoest: '26312',
            lsd: 'lsd-token',
          },
        }),
      })
    );
    document.dispatchEvent(
      new CustomEvent(BRIDGE_PAYLOAD_EVENT_NAME, {
        detail: JSON.stringify({
          payload: {
            data: {
              demo: true,
            },
          },
        }),
      })
    );

    expect(observer.getRequestContext()).toEqual({
      headers: {
        'x-csrftoken': 'csrf-token',
      },
      formFields: {
        av: '1784',
        fb_dtsg: 'fb-dtsg-token',
        jazoest: '26312',
        lsd: 'lsd-token',
      },
    });
    expect(observer.getDiagnostics()).toEqual({
      bridge_ready: true,
      metadata_ingested: 3,
    });
    expect(postMetadataCatalog.ingestGraphqlPayload).toHaveBeenCalledTimes(1);
    expect(postMetadataCatalog.ingestGraphqlPayload).toHaveBeenCalledWith({
      data: {
        demo: true,
      },
    });
    expect(logger.debug).toHaveBeenCalledWith(
      'Captured post metadata records from GraphQL response.',
      {
        ingestedRecordCount: 3,
      }
    );
  });

  test('falls back when bridge handshake never arrives', async () => {
    const { observer, logger } = createObserverHarness({
      bridgeHandshakeTimeoutMs: 1,
    });
    const originalFetch = global.fetch;
    const upstreamFetch = jest.fn(async () => ({
      clone: () => ({
        json: async () => ({
          data: {
            sample: true,
          },
        }),
      }),
    }));
    global.fetch = upstreamFetch;

    try {
      await observer.start();

      expect(observer.isBridgeReady()).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Fell back to local fetch patch because page bridge handshake failed.'
      );
      expect(observer.getDiagnostics().bridge_ready).toBe(false);
    } finally {
      observer.stop();
      global.fetch = originalFetch;
    }
  });

  test('ignores invalid bridge payload serialization', async () => {
    const { observer, postMetadataCatalog } = createObserverHarness();

    const startPromise = observer.start();
    dispatchBridgeReadyEvent();
    await startPromise;

    document.dispatchEvent(
      new CustomEvent(BRIDGE_CONTEXT_EVENT_NAME, {
        detail: '{',
      })
    );
    document.dispatchEvent(
      new CustomEvent(BRIDGE_PAYLOAD_EVENT_NAME, {
        detail: '',
      })
    );

    expect(observer.getRequestContext()).toEqual({
      headers: {},
      formFields: {},
    });
    expect(postMetadataCatalog.ingestGraphqlPayload).toHaveBeenCalledTimes(0);
  });

  test('falls back to local XHR patch when bridge injection fails', async () => {
    const { observer, postMetadataCatalog, logger } = createObserverHarness();
    postMetadataCatalog.ingestGraphqlPayload.mockReturnValue(2);
    const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('bridge injection blocked');
    });
    const originalXMLHttpRequest = global.XMLHttpRequest;

    class MockXMLHttpRequest {
      constructor() {
        this.readyState = 0;
        this.responseType = '';
        this.responseText = '';
        this.listeners = new Map();
      }

      open(method, requestUrl) {
        this.method = method;
        this.requestUrl = requestUrl;
      }

      setRequestHeader(headerName, headerValue) {
        this.lastHeaderName = headerName;
        this.lastHeaderValue = headerValue;
      }

      addEventListener(eventName, handler) {
        const handlers = this.listeners.get(eventName) || [];
        handlers.push(handler);
        this.listeners.set(eventName, handlers);
      }

      removeEventListener(eventName, handler) {
        const handlers = this.listeners.get(eventName) || [];
        this.listeners.set(
          eventName,
          handlers.filter((candidateHandler) => candidateHandler !== handler)
        );
      }

      send(_body) {
        this.readyState = 4;
        this.responseText = JSON.stringify({
          data: {
            post: {
              pk: '123',
              code: 'POST123',
              logging_info_token: 'token-123',
            },
          },
        });
        const readyStateHandlers = this.listeners.get('readystatechange') || [];
        for (const readyStateHandler of readyStateHandlers) {
          readyStateHandler.call(this);
        }
      }
    }

    global.XMLHttpRequest = MockXMLHttpRequest;

    try {
      await observer.start();
      const xhrRequest = new global.XMLHttpRequest();
      xhrRequest.open('POST', 'https://www.threads.com/graphql/query');
      xhrRequest.setRequestHeader('x-csrftoken', 'csrf-token');
      xhrRequest.send('av=1784&fb_dtsg=fb-dtsg-token&jazoest=26312&lsd=lsd-token');

      expect(observer.getRequestContext()).toEqual({
        headers: {
          'x-csrftoken': 'csrf-token',
        },
        formFields: {
          av: '1784',
          fb_dtsg: 'fb-dtsg-token',
          jazoest: '26312',
          lsd: 'lsd-token',
        },
      });
      expect(postMetadataCatalog.ingestGraphqlPayload).toHaveBeenCalledWith({
        data: {
          post: {
            pk: '123',
            code: 'POST123',
            logging_info_token: 'token-123',
          },
        },
      });
      expect(logger.debug).toHaveBeenCalledWith(
        'Captured post metadata records from GraphQL response.',
        {
          ingestedRecordCount: 2,
        }
      );
    } finally {
      observer.stop();
      createElementSpy.mockRestore();
      global.XMLHttpRequest = originalXMLHttpRequest;
    }
  });

  test('falls back to local fetch patch when bridge injection fails', async () => {
    const { observer, postMetadataCatalog } = createObserverHarness();
    const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('bridge injection blocked');
    });
    const originalFetch = global.fetch;
    const upstreamFetch = jest.fn(async () => ({
      clone: () => ({
        json: async () => ({
          data: {
            sample: true,
          },
        }),
      }),
    }));
    global.fetch = upstreamFetch;

    try {
      await observer.start();
      await global.fetch('https://www.threads.com/graphql/query', {
        method: 'POST',
        headers: {
          'x-csrftoken': 'csrf-token',
        },
        body: 'av=1784&fb_dtsg=fb-dtsg-token&jazoest=26312&lsd=lsd-token',
      });
      await Promise.resolve();

      expect(postMetadataCatalog.ingestGraphqlPayload).toHaveBeenCalledWith({
        data: {
          sample: true,
        },
      });
      expect(observer.getRequestContext()).toEqual({
        headers: {
          'x-csrftoken': 'csrf-token',
        },
        formFields: {
          av: '1784',
          fb_dtsg: 'fb-dtsg-token',
          jazoest: '26312',
          lsd: 'lsd-token',
        },
      });
    } finally {
      observer.stop();
      createElementSpy.mockRestore();
      global.fetch = originalFetch;
    }
  });
});
