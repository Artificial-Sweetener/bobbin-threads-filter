/**
 * @file Observe Threads network traffic to capture mutation prerequisites.
 */

const REQUEST_CONTEXT_FORM_FIELDS = [
  'av',
  '__user',
  '__a',
  '__hs',
  'dpr',
  '__ccg',
  '__rev',
  '__s',
  '__hsi',
  '__dyn',
  '__csr',
  '__hsdp',
  '__hblp',
  '__sjsp',
  '__comet_req',
  'fb_dtsg',
  'jazoest',
  'lsd',
  '__spin_r',
  '__spin_b',
  '__spin_t',
  '__jssesw',
  '__crn',
];

const BRIDGE_CONTEXT_EVENT_NAME = 'btf:threads-network-observer:context';
const BRIDGE_PAYLOAD_EVENT_NAME = 'btf:threads-network-observer:payload';
const BRIDGE_READY_EVENT_NAME = 'btf:threads-network-observer:ready';
const BRIDGE_STOP_EVENT_NAME = 'btf:threads-network-observer:stop';
const GRAPHQL_QUERY_PATH_PATTERN = /\/graphql\/query(?:\?|$)/i;
const LOCAL_XHR_STATE_PROPERTY = '__btfXhrRequestState';
const BRIDGE_HANDSHAKE_TIMEOUT_MS = 1_500;
const BOOTSTRAP_SCRIPT_SELECTOR = 'script[type="application/json"]';
const BOOTSTRAP_METADATA_MARKERS = ['logging_info_token', 'gen_ai_detection_method'];

/**
 * Parse one serialized bridge event payload safely.
 *
 * @param {unknown} serializedValue - Serialized JSON payload.
 * @returns {Record<string, unknown>|null}
 */
function parseSerializedBridgePayload(serializedValue) {
  if (typeof serializedValue !== 'string' || serializedValue.length === 0) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(serializedValue);
    return parsedValue && typeof parsedValue === 'object'
      ? /** @type {Record<string, unknown>} */ (parsedValue)
      : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Build one page-context bootstrap script for GraphQL fetch observation.
 *
 * @returns {string}
 */
function buildPageBridgeScriptSource() {
  /**
   * Patch page fetch, emit serialized context updates, and stream payload snapshots.
   *
   * @param {{
   *   bridgeMarker: string,
   *   contextEventName: string,
   *   payloadEventName: string,
   *   readyEventName: string,
   *   stopEventName: string
   * }} config - Bridge configuration.
   */
  function bootstrapPageBridge(config) {
    const globalObject = typeof window !== 'undefined' ? window : null;
    const documentObject = typeof document !== 'undefined' ? document : null;
    if (!globalObject || !documentObject) {
      return;
    }

    const existingBridge = globalObject[config.bridgeMarker];
    if (existingBridge && existingBridge.isActive) {
      return;
    }

    const originalFetch =
      typeof globalObject.fetch === 'function' ? globalObject.fetch.bind(globalObject) : null;
    const xhrConstructor =
      typeof globalObject.XMLHttpRequest === 'function' ? globalObject.XMLHttpRequest : null;
    const xhrPrototype =
      xhrConstructor && xhrConstructor.prototype ? xhrConstructor.prototype : null;
    const originalXhrOpen =
      xhrPrototype && typeof xhrPrototype.open === 'function' ? xhrPrototype.open : null;
    const originalXhrSetRequestHeader =
      xhrPrototype && typeof xhrPrototype.setRequestHeader === 'function'
        ? xhrPrototype.setRequestHeader
        : null;
    const originalXhrSend =
      xhrPrototype && typeof xhrPrototype.send === 'function' ? xhrPrototype.send : null;
    const xhrStateProperty = '__btfThreadsNetworkObserverRequestState';

    if (!originalFetch && (!originalXhrOpen || !originalXhrSetRequestHeader || !originalXhrSend)) {
      return;
    }

    /**
     * Resolve absolute request URL from fetch input.
     *
     * @param {unknown} input - Fetch input.
     * @returns {string}
     */
    function resolveRequestUrl(input) {
      if (typeof input === 'string') {
        return input;
      }

      if (typeof URL !== 'undefined' && input instanceof URL) {
        return input.toString();
      }

      if (input && typeof input === 'object' && typeof input.url === 'string') {
        return input.url;
      }

      return '';
    }

    /**
     * Resolve request method from fetch input and init.
     *
     * @param {unknown} input - Fetch input.
     * @param {RequestInit|undefined} init - Fetch init.
     * @returns {string}
     */
    function resolveRequestMethod(input, init) {
      const methodFromInit = init && typeof init.method === 'string' ? init.method : '';
      if (methodFromInit) {
        return methodFromInit.toUpperCase();
      }

      if (input && typeof input === 'object' && typeof input.method === 'string') {
        return input.method.toUpperCase();
      }

      return 'GET';
    }

    /**
     * Recognize whether one request targets Threads GraphQL query endpoint.
     *
     * @param {string} method - Normalized HTTP method.
     * @param {string} requestUrl - Absolute or relative request URL.
     * @returns {boolean}
     */
    function isGraphqlRequest(method, requestUrl) {
      return method === 'POST' && /\/graphql\/query(?:\?|$)/i.test(requestUrl);
    }

    /**
     * Append normalized header key/value pairs from arbitrary header containers.
     *
     * @param {Record<string, string>} targetHeaders - Header accumulator.
     * @param {unknown} sourceHeaders - Candidate source headers.
     */
    function appendNormalizedHeaders(targetHeaders, sourceHeaders) {
      if (!sourceHeaders) {
        return;
      }

      if (typeof Headers !== 'undefined' && sourceHeaders instanceof Headers) {
        sourceHeaders.forEach((value, key) => {
          targetHeaders[String(key || '').toLowerCase()] = String(value || '');
        });
        return;
      }

      if (Array.isArray(sourceHeaders)) {
        for (const entry of sourceHeaders) {
          if (!Array.isArray(entry) || entry.length < 2) {
            continue;
          }
          targetHeaders[String(entry[0] || '').toLowerCase()] = String(entry[1] || '');
        }
        return;
      }

      if (typeof sourceHeaders === 'object') {
        for (const [key, value] of Object.entries(sourceHeaders)) {
          targetHeaders[String(key || '').toLowerCase()] = String(value || '');
        }
      }
    }

    /**
     * Resolve normalized request headers from one fetch call.
     *
     * @param {unknown} input - Fetch input.
     * @param {RequestInit|undefined} init - Fetch init.
     * @returns {Record<string, string>}
     */
    function resolveRequestHeaders(input, init) {
      const normalizedHeaders = {};
      appendNormalizedHeaders(normalizedHeaders, input && input.headers);
      appendNormalizedHeaders(normalizedHeaders, init && init.headers);
      return normalizedHeaders;
    }

    /**
     * Parse URL-encoded form fields from one request body input.
     *
     * @param {unknown} body - Candidate request body.
     * @returns {Record<string, string>}
     */
    function resolveFormFieldsFromBody(body) {
      if (body === undefined || body === null) {
        return {};
      }

      if (typeof body === 'string') {
        return Object.fromEntries(new URLSearchParams(body).entries());
      }

      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
        return Object.fromEntries(body.entries());
      }

      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const formFields = {};
        for (const [fieldName, fieldValue] of body.entries()) {
          if (typeof fieldValue === 'string') {
            formFields[fieldName] = fieldValue;
          }
        }
        return formFields;
      }

      return {};
    }

    /**
     * Parse URL-encoded form fields from fetch init payload.
     *
     * @param {RequestInit|undefined} init - Fetch init.
     * @returns {Record<string, string>}
     */
    function resolveFormFields(init) {
      return resolveFormFieldsFromBody(init ? init.body : undefined);
    }

    /**
     * Dispatch one serialized bridge payload through the host document.
     *
     * @param {string} eventName - Custom event name.
     * @param {unknown} value - Serializable payload.
     */
    function emitSerializedEvent(eventName, value) {
      let serializedValue = '';
      try {
        serializedValue = JSON.stringify(value);
      } catch (_error) {
        return;
      }

      try {
        documentObject.dispatchEvent(new CustomEvent(eventName, { detail: serializedValue }));
      } catch (_error) {
        // Ignore event dispatch failures to keep host fetch stable.
      }
    }

    /**
     * Capture request context from one GraphQL request.
     *
     * @param {unknown} input - Fetch input.
     * @param {RequestInit|undefined} init - Fetch init.
     * @returns {{ isGraphqlQuery: boolean }}
     */
    function captureRequestSnapshot(input, init) {
      const requestUrl = resolveRequestUrl(input);
      const method = resolveRequestMethod(input, init);
      const isGraphqlQuery = isGraphqlRequest(method, requestUrl);

      if (isGraphqlQuery) {
        emitSerializedEvent(config.contextEventName, {
          headers: resolveRequestHeaders(input, init),
          formFields: resolveFormFields(init),
        });
      }

      return { isGraphqlQuery };
    }

    /**
     * Capture GraphQL response payload and forward it to the bridge listener.
     *
     * @param {{ isGraphqlQuery: boolean }} requestSnapshot - Request metadata.
     * @param {Response} response - Fetch response.
     */
    function captureResponsePayload(requestSnapshot, response) {
      if (!requestSnapshot.isGraphqlQuery || !response || typeof response.clone !== 'function') {
        return;
      }

      const responseClone = response.clone();
      void responseClone
        .json()
        .then((payload) => {
          emitSerializedEvent(config.payloadEventName, {
            payload,
          });
        })
        .catch(() => {
          // Ignore non-JSON payloads.
        });
    }

    /**
     * Parse and emit payload from one completed XMLHttpRequest.
     *
     * @param {{ isGraphqlQuery: boolean }} requestSnapshot - Request metadata.
     * @param {XMLHttpRequest} xhrInstance - Target request instance.
     */
    function captureXhrResponsePayload(requestSnapshot, xhrInstance) {
      if (!requestSnapshot.isGraphqlQuery || !xhrInstance) {
        return;
      }

      const responseType = String(xhrInstance.responseType || '').toLowerCase();
      let payload = null;
      if (responseType === '' || responseType === 'text') {
        const responseText =
          typeof xhrInstance.responseText === 'string' ? xhrInstance.responseText : '';
        if (!responseText) {
          return;
        }

        try {
          payload = JSON.parse(responseText);
        } catch (_error) {
          return;
        }
      } else if (responseType === 'json') {
        payload =
          xhrInstance.response && typeof xhrInstance.response === 'object'
            ? xhrInstance.response
            : null;
      }

      if (!payload || typeof payload !== 'object') {
        return;
      }

      emitSerializedEvent(config.payloadEventName, {
        payload,
      });
    }

    const patchedFetch = originalFetch
      ? async function patchedFetch(input, init) {
          const requestSnapshot = captureRequestSnapshot(input, init);
          const response = await originalFetch(input, init);
          captureResponsePayload(requestSnapshot, response);
          return response;
        }
      : null;

    if (xhrPrototype && originalXhrOpen && originalXhrSetRequestHeader && originalXhrSend) {
      xhrPrototype.open = function patchedXhrOpen(method, url) {
        this[xhrStateProperty] = {
          method: String(method || 'GET').toUpperCase(),
          requestUrl: resolveRequestUrl(url),
          headers: {},
        };
        return originalXhrOpen.apply(this, arguments);
      };

      xhrPrototype.setRequestHeader = function patchedXhrSetRequestHeader(headerName, headerValue) {
        const requestState =
          this[xhrStateProperty] && typeof this[xhrStateProperty] === 'object'
            ? this[xhrStateProperty]
            : null;
        if (requestState) {
          requestState.headers[String(headerName || '').toLowerCase()] = String(headerValue || '');
        }
        return originalXhrSetRequestHeader.apply(this, arguments);
      };

      xhrPrototype.send = function patchedXhrSend(body) {
        const requestState =
          this[xhrStateProperty] && typeof this[xhrStateProperty] === 'object'
            ? this[xhrStateProperty]
            : {
                method: 'GET',
                requestUrl: '',
                headers: {},
              };
        const requestSnapshot = {
          isGraphqlQuery: isGraphqlRequest(
            String(requestState.method || 'GET').toUpperCase(),
            String(requestState.requestUrl || '')
          ),
        };

        if (requestSnapshot.isGraphqlQuery) {
          emitSerializedEvent(config.contextEventName, {
            headers:
              requestState.headers && typeof requestState.headers === 'object'
                ? requestState.headers
                : {},
            formFields: resolveFormFieldsFromBody(body),
          });

          if (typeof this.addEventListener === 'function') {
            const handleReadyStateChange = () => {
              if (this.readyState !== 4) {
                return;
              }

              this.removeEventListener('readystatechange', handleReadyStateChange);
              captureXhrResponsePayload(requestSnapshot, this);
            };
            this.addEventListener('readystatechange', handleReadyStateChange);
          }
        }

        return originalXhrSend.apply(this, arguments);
      };
    }

    /**
     * Restore page fetch and remove bridge lifecycle hooks.
     */
    function stopBridge() {
      if (patchedFetch && globalObject.fetch === patchedFetch) {
        globalObject.fetch = originalFetch;
      }
      if (xhrPrototype && originalXhrOpen && xhrPrototype.open !== originalXhrOpen) {
        xhrPrototype.open = originalXhrOpen;
      }
      if (
        xhrPrototype &&
        originalXhrSetRequestHeader &&
        xhrPrototype.setRequestHeader !== originalXhrSetRequestHeader
      ) {
        xhrPrototype.setRequestHeader = originalXhrSetRequestHeader;
      }
      if (xhrPrototype && originalXhrSend && xhrPrototype.send !== originalXhrSend) {
        xhrPrototype.send = originalXhrSend;
      }
      documentObject.removeEventListener(config.stopEventName, stopBridge);
      delete globalObject[config.bridgeMarker];
    }

    if (patchedFetch) {
      globalObject.fetch = patchedFetch;
    }
    documentObject.addEventListener(config.stopEventName, stopBridge);
    globalObject[config.bridgeMarker] = { isActive: true };
    emitSerializedEvent(config.readyEventName, {
      ready: true,
    });
  }

  return `;(${bootstrapPageBridge.toString()})(${JSON.stringify({
    bridgeMarker: '__btfThreadsNetworkObserverBridge',
    contextEventName: BRIDGE_CONTEXT_EVENT_NAME,
    payloadEventName: BRIDGE_PAYLOAD_EVENT_NAME,
    readyEventName: BRIDGE_READY_EVENT_NAME,
    stopEventName: BRIDGE_STOP_EVENT_NAME,
  })});`;
}

/**
 * Passively capture GraphQL context and post metadata from fetch traffic.
 */
class ThreadsNetworkObserver {
  /**
   * Initialize observer state and dependencies.
   *
   * @param {{
   *   postMetadataCatalog: { ingestGraphqlPayload: Function },
   *   bridgeHandshakeTimeoutMs?: number,
   *   logger?: { debug: Function, warn: Function }
   * }} options - Observer dependencies.
   */
  constructor(options = {}) {
    const {
      postMetadataCatalog,
      bridgeHandshakeTimeoutMs = BRIDGE_HANDSHAKE_TIMEOUT_MS,
      logger = { debug: () => {}, warn: () => {} },
    } = options;
    this.postMetadataCatalog = postMetadataCatalog;
    this.bridgeHandshakeTimeoutMs = bridgeHandshakeTimeoutMs;
    this.logger = logger;

    this.originalFetch = null;
    this.patchedFetch = null;
    this.originalXhrOpen = null;
    this.originalXhrSetRequestHeader = null;
    this.originalXhrSend = null;
    this.isStarted = false;
    this.usesPageBridge = false;
    this.usesLocalFetchPatch = false;
    this.usesBootstrapScriptObserver = false;
    this.bridgeReady = false;
    this.didWarnBridgeDegraded = false;
    this.metadataIngestedCount = 0;
    this.bridgeTrustedTypesPolicy = null;
    this.bootstrapScriptObserver = null;
    this.bootstrapScriptPayloadByElement = new WeakMap();
    this.requestContext = {
      headers: {},
      formFields: {},
    };
    this.handleBridgeContextEvent = (event) => this.#captureBridgeContext(event);
    this.handleBridgePayloadEvent = (event) => this.#captureBridgePayload(event);
    this.handleBridgeReadyEvent = (event) => this.#captureBridgeReady(event);
    this.handleBootstrapMutationRecords = (mutationRecords) =>
      this.#captureBootstrapMutationRecords(mutationRecords);
  }

  /**
   * Start intercepting fetch calls from the host page.
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isStarted) {
      return;
    }

    this.bridgeReady = false;
    const didStartBootstrapScriptObserver = this.#startBootstrapScriptObserver();
    const didStartBridge = await this.#startPageBridge();
    let didStartLocalFetchPatch = false;
    if (!didStartBridge) {
      didStartLocalFetchPatch = this.#startLocalFetchPatch();
      if (didStartLocalFetchPatch) {
        this.#warnBridgeDegradedOnce(
          'Fell back to local fetch patch because page bridge handshake failed.'
        );
      } else {
        this.#warnBridgeDegradedOnce(
          'Skipped page-bridge startup because bridge handshake failed and fallback patch was unavailable.'
        );
      }
    }

    this.usesPageBridge = didStartBridge;
    this.usesLocalFetchPatch = didStartLocalFetchPatch;
    this.usesBootstrapScriptObserver = didStartBootstrapScriptObserver;
    this.#ingestBootstrapScriptPayloads();
    const globalObject = typeof globalThis !== 'undefined' ? globalThis : null;
    const hasLocalNetworkApi =
      globalObject &&
      (typeof globalObject.fetch === 'function' ||
        typeof globalObject.XMLHttpRequest === 'function');
    if (
      !didStartBridge &&
      !didStartLocalFetchPatch &&
      !didStartBootstrapScriptObserver &&
      !hasLocalNetworkApi
    ) {
      this.logger.warn('Skipped network observer startup because network APIs are unavailable.');
      return;
    }

    this.isStarted = true;
  }

  /**
   * Stop interception and restore original fetch implementation.
   */
  stop() {
    if (!this.isStarted) {
      return;
    }

    if (this.usesPageBridge) {
      this.#stopPageBridge();
    }
    if (this.usesLocalFetchPatch) {
      this.#stopLocalFetchPatch();
    }
    if (this.usesBootstrapScriptObserver) {
      this.#stopBootstrapScriptObserver();
    }

    this.usesPageBridge = false;
    this.usesLocalFetchPatch = false;
    this.usesBootstrapScriptObserver = false;
    this.bridgeReady = false;
    this.isStarted = false;
  }

  /**
   * Resolve best-known request context required by silent mutation requests.
   *
   * @returns {{ headers: Record<string, string>, formFields: Record<string, string> }}
   */
  getRequestContext() {
    return {
      headers: { ...this.requestContext.headers },
      formFields: { ...this.requestContext.formFields },
    };
  }

  /**
   * Report whether page-context bridge handshake has completed.
   *
   * @returns {boolean}
   */
  isBridgeReady() {
    return this.bridgeReady;
  }

  /**
   * Expose observer diagnostics for not-interested observability.
   *
   * @returns {{ bridge_ready: boolean, metadata_ingested: number }}
   */
  getDiagnostics() {
    return {
      bridge_ready: this.bridgeReady,
      metadata_ingested: this.metadataIngestedCount,
    };
  }

  /**
   * Observe late bootstrap scripts so initial profile payloads are not missed.
   *
   * @returns {boolean}
   */
  #startBootstrapScriptObserver() {
    const documentObject = typeof document !== 'undefined' ? document : null;
    const mutationObserverConstructor =
      typeof MutationObserver === 'function' ? MutationObserver : null;
    const observationRoot =
      documentObject && documentObject.documentElement ? documentObject.documentElement : null;
    if (
      !documentObject ||
      !observationRoot ||
      !mutationObserverConstructor ||
      this.bootstrapScriptObserver
    ) {
      return false;
    }

    this.bootstrapScriptObserver = new mutationObserverConstructor((mutationRecords) => {
      this.handleBootstrapMutationRecords(mutationRecords);
    });
    this.bootstrapScriptObserver.observe(observationRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return true;
  }

  /**
   * Stop observing bootstrap script mutations and clear tracked payload snapshots.
   */
  #stopBootstrapScriptObserver() {
    if (this.bootstrapScriptObserver) {
      this.bootstrapScriptObserver.disconnect();
      this.bootstrapScriptObserver = null;
    }

    this.bootstrapScriptPayloadByElement = new WeakMap();
  }

  /**
   * Start page-context bridge listeners and inject fetch observer script.
   *
   * @returns {Promise<boolean>}
   */
  async #startPageBridge() {
    const documentObject = typeof document !== 'undefined' ? document : null;
    if (
      !documentObject ||
      typeof documentObject.addEventListener !== 'function' ||
      typeof documentObject.createElement !== 'function'
    ) {
      return false;
    }

    documentObject.addEventListener(BRIDGE_CONTEXT_EVENT_NAME, this.handleBridgeContextEvent);
    documentObject.addEventListener(BRIDGE_PAYLOAD_EVENT_NAME, this.handleBridgePayloadEvent);
    documentObject.addEventListener(BRIDGE_READY_EVENT_NAME, this.handleBridgeReadyEvent);

    let bridgeScriptElement = null;
    try {
      bridgeScriptElement = documentObject.createElement('script');
    } catch (_error) {
      documentObject.removeEventListener(BRIDGE_CONTEXT_EVENT_NAME, this.handleBridgeContextEvent);
      documentObject.removeEventListener(BRIDGE_PAYLOAD_EVENT_NAME, this.handleBridgePayloadEvent);
      documentObject.removeEventListener(BRIDGE_READY_EVENT_NAME, this.handleBridgeReadyEvent);
      return false;
    }

    bridgeScriptElement.type = 'text/javascript';
    this.#applyPageNonce(bridgeScriptElement, documentObject);
    const bridgeSource = buildPageBridgeScriptSource();
    const trustedTypesPolicy = this.#resolveBridgeTrustedTypesPolicy();
    const globalObject = typeof globalThis !== 'undefined' ? globalThis : null;
    const supportsBlobScriptUrl =
      globalObject &&
      globalObject.URL &&
      typeof globalObject.URL.createObjectURL === 'function' &&
      typeof globalObject.URL.revokeObjectURL === 'function' &&
      typeof globalObject.Blob === 'function';

    let bridgeScriptUrl = '';
    let usedBlobScriptUrl = false;
    const revokeBridgeScriptUrl = () => {
      if (!bridgeScriptUrl || !supportsBlobScriptUrl) {
        return;
      }

      globalObject.URL.revokeObjectURL(bridgeScriptUrl);
      bridgeScriptUrl = '';
    };

    if (supportsBlobScriptUrl) {
      try {
        const scriptBlob = new globalObject.Blob([bridgeSource], {
          type: 'text/javascript',
        });
        bridgeScriptUrl = globalObject.URL.createObjectURL(scriptBlob);
        if (trustedTypesPolicy && typeof trustedTypesPolicy.createScriptURL === 'function') {
          bridgeScriptElement.src = trustedTypesPolicy.createScriptURL(bridgeScriptUrl);
        } else {
          bridgeScriptElement.src = bridgeScriptUrl;
        }
        usedBlobScriptUrl = true;
      } catch (_error) {
        revokeBridgeScriptUrl();
      }
    }

    if (!usedBlobScriptUrl) {
      try {
        if (trustedTypesPolicy && typeof trustedTypesPolicy.createScript === 'function') {
          bridgeScriptElement.text = trustedTypesPolicy.createScript(bridgeSource);
        } else {
          bridgeScriptElement.textContent = bridgeSource;
        }
      } catch (_error) {
        documentObject.removeEventListener(
          BRIDGE_CONTEXT_EVENT_NAME,
          this.handleBridgeContextEvent
        );
        documentObject.removeEventListener(
          BRIDGE_PAYLOAD_EVENT_NAME,
          this.handleBridgePayloadEvent
        );
        documentObject.removeEventListener(BRIDGE_READY_EVENT_NAME, this.handleBridgeReadyEvent);
        return false;
      }
    }

    const injectionRoot =
      documentObject.documentElement ||
      documentObject.head ||
      documentObject.body ||
      documentObject;
    if (!injectionRoot || typeof injectionRoot.appendChild !== 'function') {
      documentObject.removeEventListener(BRIDGE_CONTEXT_EVENT_NAME, this.handleBridgeContextEvent);
      documentObject.removeEventListener(BRIDGE_PAYLOAD_EVENT_NAME, this.handleBridgePayloadEvent);
      documentObject.removeEventListener(BRIDGE_READY_EVENT_NAME, this.handleBridgeReadyEvent);
      return false;
    }

    const handshakePromise = this.#waitForBridgeHandshake(documentObject);
    try {
      injectionRoot.appendChild(bridgeScriptElement);
      if (usedBlobScriptUrl) {
        const cleanupBlobInjection = () => {
          bridgeScriptElement.remove();
          revokeBridgeScriptUrl();
        };
        bridgeScriptElement.addEventListener('load', cleanupBlobInjection, {
          once: true,
        });
        bridgeScriptElement.addEventListener('error', cleanupBlobInjection, {
          once: true,
        });
      } else {
        bridgeScriptElement.remove();
      }
      const didHandshake = await handshakePromise;
      if (didHandshake) {
        this.bridgeReady = true;
        return true;
      }
      this.#stopPageBridge();
      return false;
    } catch (_error) {
      bridgeScriptElement.remove();
      revokeBridgeScriptUrl();
      documentObject.removeEventListener(BRIDGE_CONTEXT_EVENT_NAME, this.handleBridgeContextEvent);
      documentObject.removeEventListener(BRIDGE_PAYLOAD_EVENT_NAME, this.handleBridgePayloadEvent);
      documentObject.removeEventListener(BRIDGE_READY_EVENT_NAME, this.handleBridgeReadyEvent);
      return false;
    }
  }

  /**
   * Resolve trusted-types policy used for page-bridge script injection.
   *
   * @returns {{
   *   createScript?: (value: string) => unknown
   *   createScriptURL?: (value: string) => unknown
   * }|null}
   */
  #resolveBridgeTrustedTypesPolicy() {
    if (this.bridgeTrustedTypesPolicy) {
      return this.bridgeTrustedTypesPolicy;
    }

    const globalObject = typeof globalThis !== 'undefined' ? globalThis : null;
    const trustedTypesApi =
      globalObject && globalObject.trustedTypes && typeof globalObject.trustedTypes === 'object'
        ? globalObject.trustedTypes
        : null;
    if (!trustedTypesApi || typeof trustedTypesApi.createPolicy !== 'function') {
      return null;
    }

    const policyName = 'btfThreadsNetworkObserverPolicy';
    if (typeof trustedTypesApi.getPolicy === 'function') {
      const existingPolicy = trustedTypesApi.getPolicy(policyName);
      if (existingPolicy) {
        this.bridgeTrustedTypesPolicy = existingPolicy;
        return existingPolicy;
      }
    }

    try {
      this.bridgeTrustedTypesPolicy = trustedTypesApi.createPolicy(policyName, {
        createScript: (value) => value,
        createScriptURL: (value) => value,
      });
      return this.bridgeTrustedTypesPolicy;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Copy active page nonce onto one injected script element when available.
   *
   * @param {HTMLScriptElement} scriptElement - Injected script tag.
   * @param {Document} documentObject - Active document.
   */
  #applyPageNonce(scriptElement, documentObject) {
    const nonceValue = this.#resolvePageNonce(documentObject);
    if (!nonceValue) {
      return;
    }

    scriptElement.setAttribute('nonce', nonceValue);
  }

  /**
   * Resolve nonce value from page-authored script tags.
   *
   * @param {Document} documentObject - Active document.
   * @returns {string}
   */
  #resolvePageNonce(documentObject) {
    if (!documentObject || typeof documentObject.querySelector !== 'function') {
      return '';
    }

    const nonceScriptElement = documentObject.querySelector('script[nonce]');
    if (!nonceScriptElement) {
      return '';
    }

    const nonceAttribute = String(nonceScriptElement.getAttribute('nonce') || '').trim();
    if (nonceAttribute) {
      return nonceAttribute;
    }

    const nonceProperty = String(nonceScriptElement.nonce || '').trim();
    return nonceProperty;
  }

  /**
   * Await page bridge ready event and fail startup when handshake times out.
   *
   * @param {Document} documentObject - Active document.
   * @returns {Promise<boolean>}
   */
  #waitForBridgeHandshake(documentObject) {
    return new Promise((resolve) => {
      let isSettled = false;
      let timeoutId = null;
      const completeHandshake = (didSucceed) => {
        if (isSettled) {
          return;
        }

        isSettled = true;
        clearTimeout(timeoutId);
        documentObject.removeEventListener(BRIDGE_READY_EVENT_NAME, handleReadyEvent);
        resolve(didSucceed);
      };
      const handleReadyEvent = (event) => {
        const bridgePayload = parseSerializedBridgePayload(event && event.detail);
        const readyFlag =
          !bridgePayload || !Object.prototype.hasOwnProperty.call(bridgePayload, 'ready')
            ? true
            : Boolean(bridgePayload.ready);
        completeHandshake(readyFlag);
      };
      const timeoutMs = Math.max(1, Number(this.bridgeHandshakeTimeoutMs) || 1);
      timeoutId = setTimeout(() => completeHandshake(false), timeoutMs);

      documentObject.addEventListener(BRIDGE_READY_EVENT_NAME, handleReadyEvent);
    });
  }

  /**
   * Warn once when bridge startup is degraded and local fallback is used.
   *
   * @param {string} message - Warning message.
   */
  #warnBridgeDegradedOnce(message) {
    if (this.didWarnBridgeDegraded) {
      return;
    }

    this.didWarnBridgeDegraded = true;
    this.logger.warn(message);
  }

  /**
   * Stop page-context bridge listeners and signal fetch restoration.
   */
  #stopPageBridge() {
    const documentObject = typeof document !== 'undefined' ? document : null;
    if (!documentObject || typeof documentObject.removeEventListener !== 'function') {
      return;
    }

    documentObject.removeEventListener(BRIDGE_CONTEXT_EVENT_NAME, this.handleBridgeContextEvent);
    documentObject.removeEventListener(BRIDGE_PAYLOAD_EVENT_NAME, this.handleBridgePayloadEvent);
    documentObject.removeEventListener(BRIDGE_READY_EVENT_NAME, this.handleBridgeReadyEvent);

    try {
      documentObject.dispatchEvent(new CustomEvent(BRIDGE_STOP_EVENT_NAME));
    } catch (_error) {
      // Ignore bridge stop dispatch failures.
    }
  }

  /**
   * Capture request context updates from page bridge events.
   *
   * @param {Event} event - Bridge event.
   */
  #captureBridgeContext(event) {
    const bridgePayload = parseSerializedBridgePayload(event && event.detail);
    if (!bridgePayload) {
      return;
    }

    const headers =
      bridgePayload.headers && typeof bridgePayload.headers === 'object'
        ? /** @type {Record<string, string>} */ (bridgePayload.headers)
        : {};
    const formFields =
      bridgePayload.formFields && typeof bridgePayload.formFields === 'object'
        ? /** @type {Record<string, string>} */ (bridgePayload.formFields)
        : {};

    this.#updateRequestContext(headers, formFields);
  }

  /**
   * Capture GraphQL payload updates from page bridge events.
   *
   * @param {Event} event - Bridge event.
   */
  #captureBridgePayload(event) {
    const bridgePayload = parseSerializedBridgePayload(event && event.detail);
    if (!bridgePayload || !Object.prototype.hasOwnProperty.call(bridgePayload, 'payload')) {
      return;
    }

    this.#ingestGraphqlPayload(bridgePayload.payload);
  }

  /**
   * Capture bridge-ready lifecycle events emitted by page script bootstrap.
   *
   * @param {Event} event - Bridge event.
   */
  #captureBridgeReady(event) {
    const bridgePayload = parseSerializedBridgePayload(event && event.detail);
    if (bridgePayload && Object.prototype.hasOwnProperty.call(bridgePayload, 'ready')) {
      this.bridgeReady = Boolean(bridgePayload.ready);
      return;
    }

    this.bridgeReady = true;
  }

  /**
   * Start local-context network interception as fallback when bridge injection fails.
   *
   * @returns {boolean}
   */
  #startLocalFetchPatch() {
    const globalObject = typeof globalThis !== 'undefined' ? globalThis : null;
    if (!globalObject) {
      return false;
    }

    let didPatchFetch = false;
    if (typeof globalObject.fetch === 'function') {
      this.originalFetch = globalObject.fetch.bind(globalObject);
      this.patchedFetch = async (input, init) => {
        const requestSnapshot = this.#captureRequestSnapshot(input, init);
        const response = await this.originalFetch(input, init);
        this.#capturePostMetadataFromResponse(requestSnapshot, response);
        return response;
      };
      globalObject.fetch = this.patchedFetch;
      didPatchFetch = true;
    }

    const didPatchXhr = this.#startLocalXhrPatch(globalObject);
    return didPatchFetch || didPatchXhr;
  }

  /**
   * Start local-context XHR interception for GraphQL context and payload capture.
   *
   * @param {typeof globalThis} globalObject - Active global object.
   * @returns {boolean}
   */
  #startLocalXhrPatch(globalObject) {
    if (
      !globalObject ||
      this.originalXhrOpen ||
      this.originalXhrSetRequestHeader ||
      this.originalXhrSend
    ) {
      return false;
    }

    const xhrConstructor =
      typeof globalObject.XMLHttpRequest === 'function' ? globalObject.XMLHttpRequest : null;
    const xhrPrototype =
      xhrConstructor && xhrConstructor.prototype ? xhrConstructor.prototype : null;
    if (
      !xhrPrototype ||
      typeof xhrPrototype.open !== 'function' ||
      typeof xhrPrototype.setRequestHeader !== 'function' ||
      typeof xhrPrototype.send !== 'function'
    ) {
      return false;
    }

    this.originalXhrOpen = xhrPrototype.open;
    this.originalXhrSetRequestHeader = xhrPrototype.setRequestHeader;
    this.originalXhrSend = xhrPrototype.send;

    const originalXhrOpen = this.originalXhrOpen;
    const originalXhrSetRequestHeader = this.originalXhrSetRequestHeader;
    const originalXhrSend = this.originalXhrSend;
    const isGraphqlRequest = (method, requestUrl) => this.#isGraphqlRequest(method, requestUrl);
    const resolveRequestUrl = (input) => this.#resolveRequestUrl(input);
    const resolveFormFieldsFromBody = (body) => this.#resolveFormFieldsFromBody(body);
    const updateRequestContext = (headers, formFields) =>
      this.#updateRequestContext(headers, formFields);
    const ingestGraphqlPayload = (payload) => this.#ingestGraphqlPayload(payload);
    const parseXhrResponsePayload = (xhrInstance) => this.#parseXhrResponsePayload(xhrInstance);

    xhrPrototype.open = function patchedXhrOpen(method, url) {
      this[LOCAL_XHR_STATE_PROPERTY] = {
        method: String(method || 'GET').toUpperCase(),
        requestUrl: resolveRequestUrl(url),
        headers: {},
      };
      return originalXhrOpen.apply(this, arguments);
    };

    xhrPrototype.setRequestHeader = function patchedXhrSetRequestHeader(headerName, headerValue) {
      const requestState =
        this[LOCAL_XHR_STATE_PROPERTY] && typeof this[LOCAL_XHR_STATE_PROPERTY] === 'object'
          ? this[LOCAL_XHR_STATE_PROPERTY]
          : null;
      if (requestState) {
        requestState.headers[String(headerName || '').toLowerCase()] = String(headerValue || '');
      }

      return originalXhrSetRequestHeader.apply(this, arguments);
    };

    xhrPrototype.send = function patchedXhrSend(body) {
      const requestState =
        this[LOCAL_XHR_STATE_PROPERTY] && typeof this[LOCAL_XHR_STATE_PROPERTY] === 'object'
          ? this[LOCAL_XHR_STATE_PROPERTY]
          : {
              method: 'GET',
              requestUrl: '',
              headers: {},
            };
      const requestMethod = String(requestState.method || 'GET').toUpperCase();
      const requestUrl = String(requestState.requestUrl || '');
      const isGraphqlQuery = isGraphqlRequest(requestMethod, requestUrl);

      if (isGraphqlQuery) {
        const normalizedHeaders =
          requestState.headers && typeof requestState.headers === 'object'
            ? requestState.headers
            : {};
        const formFields = resolveFormFieldsFromBody(body);
        updateRequestContext(normalizedHeaders, formFields);

        if (typeof this.addEventListener === 'function') {
          const handleReadyStateChange = () => {
            if (this.readyState !== 4) {
              return;
            }

            if (typeof this.removeEventListener === 'function') {
              this.removeEventListener('readystatechange', handleReadyStateChange);
            }
            const payload = parseXhrResponsePayload(this);
            if (payload) {
              ingestGraphqlPayload(payload);
            }
          };
          this.addEventListener('readystatechange', handleReadyStateChange);
        }
      }

      return originalXhrSend.apply(this, arguments);
    };

    return true;
  }

  /**
   * Restore local-context network APIs after fallback interception.
   */
  #stopLocalFetchPatch() {
    const globalObject = typeof globalThis !== 'undefined' ? globalThis : null;
    if (globalObject && this.originalFetch) {
      globalObject.fetch = this.originalFetch;
    }

    this.#stopLocalXhrPatch(globalObject);
    this.originalFetch = null;
    this.patchedFetch = null;
  }

  /**
   * Restore local-context XMLHttpRequest prototype methods.
   *
   * @param {typeof globalThis|null} globalObject - Active global object.
   */
  #stopLocalXhrPatch(globalObject) {
    const xhrConstructor =
      globalObject && typeof globalObject.XMLHttpRequest === 'function'
        ? globalObject.XMLHttpRequest
        : null;
    const xhrPrototype =
      xhrConstructor && xhrConstructor.prototype ? xhrConstructor.prototype : null;
    if (xhrPrototype && this.originalXhrOpen) {
      xhrPrototype.open = this.originalXhrOpen;
    }
    if (xhrPrototype && this.originalXhrSetRequestHeader) {
      xhrPrototype.setRequestHeader = this.originalXhrSetRequestHeader;
    }
    if (xhrPrototype && this.originalXhrSend) {
      xhrPrototype.send = this.originalXhrSend;
    }

    this.originalXhrOpen = null;
    this.originalXhrSetRequestHeader = null;
    this.originalXhrSend = null;
  }

  /**
   * Determine whether one request targets Threads GraphQL query endpoint.
   *
   * @param {string} method - Normalized request method.
   * @param {string} requestUrl - Absolute or relative URL.
   * @returns {boolean}
   */
  #isGraphqlRequest(method, requestUrl) {
    return method === 'POST' && GRAPHQL_QUERY_PATH_PATTERN.test(requestUrl);
  }

  /**
   * Capture request metadata and update mutation context from GraphQL requests.
   *
   * @param {unknown} input - Fetch input.
   * @param {RequestInit|undefined} init - Fetch init.
   * @returns {{ isGraphqlQuery: boolean }}
   */
  #captureRequestSnapshot(input, init) {
    const requestUrl = this.#resolveRequestUrl(input);
    const method = this.#resolveRequestMethod(input, init);
    const isGraphqlQuery = this.#isGraphqlRequest(method, requestUrl);

    if (isGraphqlQuery) {
      const headers = this.#resolveRequestHeaders(input, init);
      const formFields = this.#resolveFormFields(init);
      this.#updateRequestContext(headers, formFields);
    }

    return { isGraphqlQuery };
  }

  /**
   * Parse and ingest post metadata from GraphQL responses.
   *
   * @param {{ isGraphqlQuery: boolean }} requestSnapshot - Captured request metadata.
   * @param {Response} response - Fetch response.
   */
  #capturePostMetadataFromResponse(requestSnapshot, response) {
    if (!requestSnapshot.isGraphqlQuery || !response || typeof response.clone !== 'function') {
      return;
    }

    const responseClone = response.clone();
    void responseClone
      .json()
      .then((payload) => {
        this.#ingestGraphqlPayload(payload);
      })
      .catch(() => {
        // Ignore non-JSON and read failures to avoid host page breakage.
      });
  }

  /**
   * Parse one completed XMLHttpRequest payload into JSON object form.
   *
   * @param {XMLHttpRequest} xhrInstance - Completed request instance.
   * @returns {Record<string, unknown>|null}
   */
  #parseXhrResponsePayload(xhrInstance) {
    if (!xhrInstance) {
      return null;
    }

    const responseType = String(xhrInstance.responseType || '').toLowerCase();
    if (responseType === '' || responseType === 'text') {
      const responseText =
        typeof xhrInstance.responseText === 'string' ? xhrInstance.responseText : '';
      if (!responseText) {
        return null;
      }

      try {
        const payload = JSON.parse(responseText);
        return payload && typeof payload === 'object'
          ? /** @type {Record<string, unknown>} */ (payload)
          : null;
      } catch (_error) {
        return null;
      }
    }

    if (responseType === 'json') {
      return xhrInstance.response && typeof xhrInstance.response === 'object'
        ? /** @type {Record<string, unknown>} */ (xhrInstance.response)
        : null;
    }

    return null;
  }

  /**
   * Ingest candidate GraphQL payload and emit structured debug telemetry.
   *
   * @param {unknown} payload - Candidate response payload.
   */
  #ingestGraphqlPayload(payload) {
    const ingestedRecordCount = this.postMetadataCatalog.ingestGraphqlPayload(payload);
    if (ingestedRecordCount > 0) {
      this.metadataIngestedCount += ingestedRecordCount;
      this.logger.debug('Captured post metadata records from GraphQL response.', {
        ingestedRecordCount,
      });
    }
  }

  /**
   * Ingest post metadata serialized into initial page bootstrap scripts.
   */
  #ingestBootstrapScriptPayloads() {
    const ingestedRecordCount = this.#ingestBootstrapScriptPayloadsFromRootNode();
    if (ingestedRecordCount > 0) {
      this.metadataIngestedCount += ingestedRecordCount;
      this.logger.debug('Captured post metadata records from bootstrap scripts.', {
        ingestedRecordCount,
      });
    }
  }

  /**
   * Skip bootstrap scripts that cannot contain post metadata.
   *
   * @param {string} serializedPayload - Raw script text.
   * @returns {boolean}
   */
  #isBootstrapMetadataCandidate(serializedPayload) {
    if (!serializedPayload) {
      return false;
    }

    return BOOTSTRAP_METADATA_MARKERS.some((marker) => serializedPayload.includes(marker));
  }

  /**
   * Capture bootstrap metadata when Threads mutates application-json script content.
   *
   * @param {MutationRecord[]} mutationRecords - Observed DOM mutation records.
   */
  #captureBootstrapMutationRecords(mutationRecords) {
    if (!Array.isArray(mutationRecords) || mutationRecords.length === 0) {
      return;
    }

    let ingestedRecordCount = 0;
    for (const mutationRecord of mutationRecords) {
      if (!mutationRecord) {
        continue;
      }

      if (mutationRecord.type === 'childList') {
        if (this.#isBootstrapScriptElement(mutationRecord.target)) {
          ingestedRecordCount += this.#ingestBootstrapScriptPayloadsFromRootNode(
            mutationRecord.target
          );
        }
        for (const addedNode of mutationRecord.addedNodes) {
          ingestedRecordCount += this.#ingestBootstrapScriptPayloadsFromRootNode(addedNode);
        }
        continue;
      }

      if (mutationRecord.type === 'characterData') {
        const parentNode = mutationRecord.target ? mutationRecord.target.parentNode : null;
        if (this.#isBootstrapScriptElement(parentNode)) {
          ingestedRecordCount += this.#ingestBootstrapScriptPayloadsFromRootNode(parentNode);
        }
      }
    }

    if (ingestedRecordCount > 0) {
      this.metadataIngestedCount += ingestedRecordCount;
      this.logger.debug('Captured post metadata records from bootstrap scripts.', {
        ingestedRecordCount,
      });
    }
  }

  /**
   * Scan one DOM root for bootstrap scripts and ingest unseen payload snapshots.
   *
   * @param {Node|Document|null} [rootNode] - Candidate scan root.
   * @returns {number}
   */
  #ingestBootstrapScriptPayloadsFromRootNode(rootNode) {
    let ingestedRecordCount = 0;
    for (const scriptElement of this.#collectBootstrapScriptElements(rootNode)) {
      ingestedRecordCount += this.#ingestBootstrapScriptElement(scriptElement);
    }

    return ingestedRecordCount;
  }

  /**
   * Resolve bootstrap script elements reachable from one DOM root.
   *
   * @param {Node|Document|null} [rootNode] - Candidate scan root.
   * @returns {HTMLScriptElement[]}
   */
  #collectBootstrapScriptElements(rootNode) {
    const documentObject = typeof document !== 'undefined' ? document : null;
    const effectiveRoot = rootNode || documentObject;
    if (!effectiveRoot) {
      return [];
    }

    const scriptElements = [];
    if (this.#isBootstrapScriptElement(effectiveRoot)) {
      scriptElements.push(/** @type {HTMLScriptElement} */ (effectiveRoot));
    }

    if (typeof effectiveRoot.querySelectorAll === 'function') {
      scriptElements.push(...Array.from(effectiveRoot.querySelectorAll(BOOTSTRAP_SCRIPT_SELECTOR)));
    }

    return scriptElements;
  }

  /**
   * Ingest one bootstrap script only when its serialized payload changed.
   *
   * @param {HTMLScriptElement} scriptElement - Candidate bootstrap script.
   * @returns {number}
   */
  #ingestBootstrapScriptElement(scriptElement) {
    if (!this.#isBootstrapScriptElement(scriptElement)) {
      return 0;
    }

    const serializedPayload =
      scriptElement && typeof scriptElement.textContent === 'string'
        ? scriptElement.textContent
        : '';
    const previousPayload = this.bootstrapScriptPayloadByElement.get(scriptElement);
    if (previousPayload === serializedPayload) {
      return 0;
    }

    this.bootstrapScriptPayloadByElement.set(scriptElement, serializedPayload);
    if (!this.#isBootstrapMetadataCandidate(serializedPayload)) {
      return 0;
    }

    try {
      const parsedPayload = JSON.parse(serializedPayload);
      if (parsedPayload && typeof parsedPayload === 'object') {
        return this.postMetadataCatalog.ingestGraphqlPayload(parsedPayload);
      }
    } catch (_error) {
      // Ignore malformed bootstrap blobs so host-page startup stays resilient.
    }

    return 0;
  }

  /**
   * Recognize application-json script elements that can host bootstrap payloads.
   *
   * @param {unknown} candidate - Candidate DOM node.
   * @returns {boolean}
   */
  #isBootstrapScriptElement(candidate) {
    return Boolean(
      candidate &&
      typeof candidate === 'object' &&
      candidate.nodeType === 1 &&
      typeof candidate.matches === 'function' &&
      candidate.matches(BOOTSTRAP_SCRIPT_SELECTOR)
    );
  }

  /**
   * Update mutation request context using observed request headers and params.
   *
   * @param {Record<string, string>} headers - Normalized request headers.
   * @param {Record<string, string>} formFields - Parsed request form fields.
   */
  #updateRequestContext(headers, formFields) {
    const currentHeaders = this.requestContext.headers;
    const currentFormFields = this.requestContext.formFields;

    for (const [headerKey, headerValue] of Object.entries(headers)) {
      if (!headerValue) {
        continue;
      }
      currentHeaders[headerKey] = headerValue;
    }

    for (const fieldName of REQUEST_CONTEXT_FORM_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(formFields, fieldName)) {
        continue;
      }
      const fieldValue = String(formFields[fieldName] || '').trim();
      if (!fieldValue) {
        continue;
      }
      currentFormFields[fieldName] = fieldValue;
    }
  }

  /**
   * Resolve absolute request URL from fetch input.
   *
   * @param {unknown} input - Fetch input.
   * @returns {string}
   */
  #resolveRequestUrl(input) {
    if (typeof input === 'string') {
      return input;
    }

    if (typeof URL !== 'undefined' && input instanceof URL) {
      return input.toString();
    }

    if (input && typeof input === 'object' && typeof input.url === 'string') {
      return input.url;
    }

    return '';
  }

  /**
   * Resolve request method from fetch input and init.
   *
   * @param {unknown} input - Fetch input.
   * @param {RequestInit|undefined} init - Fetch init.
   * @returns {string}
   */
  #resolveRequestMethod(input, init) {
    const methodFromInit = init && typeof init.method === 'string' ? init.method : '';
    if (methodFromInit) {
      return methodFromInit.toUpperCase();
    }

    if (input && typeof input === 'object' && typeof input.method === 'string') {
      return input.method.toUpperCase();
    }

    return 'GET';
  }

  /**
   * Normalize request headers into lowercase key/value pairs.
   *
   * @param {unknown} input - Fetch input.
   * @param {RequestInit|undefined} init - Fetch init.
   * @returns {Record<string, string>}
   */
  #resolveRequestHeaders(input, init) {
    const normalizedHeaders = {};

    this.#appendNormalizedHeaders(normalizedHeaders, input && input.headers);
    this.#appendNormalizedHeaders(normalizedHeaders, init && init.headers);

    return normalizedHeaders;
  }

  /**
   * Append normalized header key/value pairs from arbitrary header containers.
   *
   * @param {Record<string, string>} targetHeaders - Header accumulator.
   * @param {unknown} sourceHeaders - Candidate source headers.
   */
  #appendNormalizedHeaders(targetHeaders, sourceHeaders) {
    if (!sourceHeaders) {
      return;
    }

    if (typeof Headers !== 'undefined' && sourceHeaders instanceof Headers) {
      sourceHeaders.forEach((value, key) => {
        targetHeaders[String(key || '').toLowerCase()] = String(value || '');
      });
      return;
    }

    if (Array.isArray(sourceHeaders)) {
      for (const entry of sourceHeaders) {
        if (!Array.isArray(entry) || entry.length < 2) {
          continue;
        }
        targetHeaders[String(entry[0] || '').toLowerCase()] = String(entry[1] || '');
      }
      return;
    }

    if (typeof sourceHeaders === 'object') {
      for (const [key, value] of Object.entries(sourceHeaders)) {
        targetHeaders[String(key || '').toLowerCase()] = String(value || '');
      }
    }
  }

  /**
   * Parse URL-encoded form body from fetch init payload.
   *
   * @param {RequestInit|undefined} init - Fetch init.
   * @returns {Record<string, string>}
   */
  #resolveFormFields(init) {
    return this.#resolveFormFieldsFromBody(init ? init.body : undefined);
  }

  /**
   * Parse URL-encoded form body from generic request payload input.
   *
   * @param {unknown} body - Candidate request body.
   * @returns {Record<string, string>}
   */
  #resolveFormFieldsFromBody(body) {
    if (body === undefined || body === null) {
      return {};
    }

    if (typeof body === 'string') {
      return this.#parseSearchParams(new URLSearchParams(body));
    }

    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      return this.#parseSearchParams(body);
    }

    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const formFields = {};
      for (const [fieldName, fieldValue] of body.entries()) {
        if (typeof fieldValue === 'string') {
          formFields[fieldName] = fieldValue;
        }
      }
      return formFields;
    }

    return {};
  }

  /**
   * Convert URLSearchParams into plain object form.
   *
   * @param {URLSearchParams} searchParams - Search param container.
   * @returns {Record<string, string>}
   */
  #parseSearchParams(searchParams) {
    const formFields = {};
    for (const [fieldName, fieldValue] of searchParams.entries()) {
      formFields[fieldName] = fieldValue;
    }
    return formFields;
  }
}

module.exports = {
  ThreadsNetworkObserver,
};
