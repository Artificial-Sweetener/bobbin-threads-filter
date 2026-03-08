/**
 * @file Query Threads mention/account GraphQL endpoints for username suggestions.
 */

const { normalizeHandle } = require('../storage/settings-schema');

const MENTION_NULLSTATE_QUERY = {
  docId: '33929666426648878',
  friendlyName: 'useBarcelonaMentionsNullStateDataSourceQuery',
  rootFieldName: 'xdt_mention_nullstate_sugesstions',
};

const ACCOUNT_SEARCH_QUERY = {
  docId: '34971288492470563',
  friendlyName: 'useBarcelonaAccountSearchGraphQLDataSourceQuery',
  rootFieldName: 'xdt_api__v1__users__search_connection',
};

/**
 * Fetch username suggestions from Threads GraphQL endpoints.
 */
class ThreadsAccountSearchClient {
  /**
   * Initialize account-search dependencies and request sequence state.
   *
   * @param {{
   *   networkObserver: { getRequestContext: Function },
   *   logger?: { debug: Function, warn: Function }
   * }} options - Client dependencies.
   */
  constructor(options = {}) {
    const { networkObserver, logger = { debug: () => {}, warn: () => {} } } = options;
    this.networkObserver = networkObserver;
    this.logger = logger;
    this.requestSequence = 0;
  }

  /**
   * Resolve mention candidates from either null-state or typed search queries.
   *
   * @param {unknown} queryText - Raw search token without committing to filter state.
   * @returns {Promise<Array<{ handle: string, displayName: string, isVerified: boolean, profilePictureUrl: string }>>}
   */
  async searchMentionCandidates(queryText) {
    const normalizedQuery = normalizeHandle(queryText);
    const queryConfig = normalizedQuery ? ACCOUNT_SEARCH_QUERY : MENTION_NULLSTATE_QUERY;
    const context =
      this.networkObserver && typeof this.networkObserver.getRequestContext === 'function'
        ? this.networkObserver.getRequestContext()
        : { headers: {}, formFields: {} };

    const formFields = this.#buildQueryFormFields(
      context.formFields,
      context.headers,
      queryConfig,
      normalizedQuery
    );

    let response;
    try {
      response = await fetch(this.#resolveEndpointUrl(), {
        method: 'POST',
        headers: this.#buildQueryHeaders(context.headers, formFields, queryConfig),
        body: new URLSearchParams(formFields).toString(),
        credentials: 'include',
      });
    } catch (_error) {
      return [];
    }

    if (!response || !response.ok) {
      return [];
    }

    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      return [];
    }

    const rawSuggestions = normalizedQuery
      ? this.#extractAccountSearchSuggestions(payload)
      : this.#extractNullStateSuggestions(payload);
    return this.#dedupeSuggestions(rawSuggestions);
  }

  /**
   * Resolve query endpoint URL for the current host context.
   *
   * @returns {string}
   */
  #resolveEndpointUrl() {
    if (typeof location !== 'undefined' && location.origin) {
      return `${location.origin}/graphql/query`;
    }

    return 'https://www.threads.com/graphql/query';
  }

  /**
   * Build GraphQL form fields from observed request context and query intent.
   *
   * @param {Record<string, string>} contextFormFields - Observed request form fields.
   * @param {Record<string, string>} contextHeaders - Observed request headers.
   * @param {{ docId: string, friendlyName: string }} queryConfig - Query metadata.
   * @param {string} normalizedQuery - Normalized username token without @.
   * @returns {Record<string, string>}
   */
  #buildQueryFormFields(contextFormFields, contextHeaders, queryConfig, normalizedQuery) {
    const variables = normalizedQuery
      ? {
          query: normalizedQuery,
          first: 10,
          should_fetch_ig_inactive_on_text_app: true,
          should_fetch_friendship_status: false,
          should_fetch_fediverse_profiles: true,
          hide_unconnected_private: false,
          __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
          __relay_internal__pv__BarcelonaIsCrawlerrelayprovider: false,
          __relay_internal__pv__BarcelonaHasDisplayNamesrelayprovider: false,
        }
      : {
          count: 15,
          __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
          __relay_internal__pv__BarcelonaIsCrawlerrelayprovider: false,
          __relay_internal__pv__BarcelonaHasDisplayNamesrelayprovider: false,
        };

    const queryFormFields = {
      ...contextFormFields,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: queryConfig.friendlyName,
      doc_id: queryConfig.docId,
      server_timestamps: 'true',
      __req: this.#nextRequestSequence(),
      variables: JSON.stringify(variables),
    };

    this.#applyFormFieldFallbacks(queryFormFields, contextHeaders);

    if (!queryFormFields.__user) {
      queryFormFields.__user = '0';
    }
    if (!queryFormFields.__a) {
      queryFormFields.__a = '1';
    }
    if (!queryFormFields.dpr) {
      queryFormFields.dpr =
        typeof devicePixelRatio === 'number' && devicePixelRatio > 0
          ? String(devicePixelRatio)
          : '1';
    }

    return queryFormFields;
  }

  /**
   * Fill missing form fields from host runtime state when observer context is sparse.
   *
   * @param {Record<string, string>} queryFormFields - Mutable form field bag.
   * @param {Record<string, string>} contextHeaders - Observed request headers.
   */
  #applyFormFieldFallbacks(queryFormFields, contextHeaders) {
    const userContext = this.#resolveCurrentUserContext();

    if (!queryFormFields.av && userContext.actorId) {
      queryFormFields.av = userContext.actorId;
    }

    if (!queryFormFields.fb_dtsg) {
      queryFormFields.fb_dtsg = this.#readModuleToken('DTSGInitialData', 'token');
    }
    if (!queryFormFields.fb_dtsg) {
      queryFormFields.fb_dtsg = this.#readEqmcToken('f');
    }

    if (!queryFormFields.lsd) {
      queryFormFields.lsd = this.#readModuleToken('LSD', 'token');
    }
    if (!queryFormFields.lsd) {
      queryFormFields.lsd = String(contextHeaders['x-fb-lsd'] || '').trim();
    }
    if (!queryFormFields.lsd) {
      queryFormFields.lsd = this.#readEqmcToken('l');
    }

    if (!queryFormFields.jazoest && queryFormFields.fb_dtsg) {
      queryFormFields.jazoest = this.#deriveJazoestToken(queryFormFields.fb_dtsg);
    }
  }

  /**
   * Resolve actor identifiers from host CurrentUser module and cookie fallbacks.
   *
   * @returns {{ actorId: string }}
   */
  #resolveCurrentUserContext() {
    const currentUser = this.#readHostModule('CurrentUser');
    if (currentUser && typeof currentUser === 'object') {
      if (typeof currentUser.getPossiblyNonFacebookUserID === 'function') {
        const nonFacebookUserId = String(currentUser.getPossiblyNonFacebookUserID() || '').trim();
        if (nonFacebookUserId) {
          return { actorId: nonFacebookUserId };
        }
      }
    }

    const fallbackActorId = this.#readCookieValue('ds_user_id');
    return { actorId: fallbackActorId };
  }

  /**
   * Read one token field from one host module.
   *
   * @param {string} moduleName - Host module name.
   * @param {string} propertyName - Token property key.
   * @returns {string}
   */
  #readModuleToken(moduleName, propertyName) {
    const moduleData = this.#readHostModule(moduleName);
    if (!moduleData || typeof moduleData !== 'object') {
      return '';
    }

    return String(moduleData[propertyName] || '').trim();
  }

  /**
   * Read one host module through page-level module loader.
   *
   * @param {string} moduleName - Host module name.
   * @returns {unknown}
   */
  #readHostModule(moduleName) {
    const hostGlobal = this.#resolveHostGlobalObject();
    if (!hostGlobal || typeof hostGlobal.require !== 'function') {
      return null;
    }

    try {
      return hostGlobal.require(moduleName);
    } catch (_error) {
      return null;
    }
  }

  /**
   * Resolve host page global object across userscript sandboxes.
   *
   * @returns {Record<string, unknown> | null}
   */
  #resolveHostGlobalObject() {
    const globalObject = typeof globalThis !== 'undefined' ? globalThis : null;
    if (globalObject && globalObject.unsafeWindow) {
      return globalObject.unsafeWindow;
    }

    if (typeof window !== 'undefined' && window) {
      if (window.wrappedJSObject) {
        return window.wrappedJSObject;
      }

      return window;
    }

    return null;
  }

  /**
   * Read token candidate from __eqmc JSON payload.
   *
   * @param {string} fieldName - Eqmc payload field key.
   * @returns {string}
   */
  #readEqmcToken(fieldName) {
    if (typeof document === 'undefined') {
      return '';
    }

    const eqmcElement = document.getElementById('__eqmc');
    if (!eqmcElement || !eqmcElement.textContent) {
      return '';
    }

    try {
      const payload = JSON.parse(eqmcElement.textContent);
      return String(payload && payload[fieldName] ? payload[fieldName] : '').trim();
    } catch (_error) {
      return '';
    }
  }

  /**
   * Derive jazoest token from fb_dtsg token.
   *
   * @param {string} fbDtsgToken - FB DTSG token.
   * @returns {string}
   */
  #deriveJazoestToken(fbDtsgToken) {
    const token = String(fbDtsgToken || '');
    if (!token) {
      return '';
    }

    let checksum = 0;
    for (let index = 0; index < token.length; index += 1) {
      checksum += token.charCodeAt(index);
    }

    return `2${checksum}`;
  }

  /**
   * Build request headers for account-search GraphQL calls.
   *
   * @param {Record<string, string>} contextHeaders - Observed request headers.
   * @param {Record<string, string>} queryFormFields - Request form fields.
   * @param {{ friendlyName: string, rootFieldName: string }} queryConfig - Query metadata.
   * @returns {Record<string, string>}
   */
  #buildQueryHeaders(contextHeaders, queryFormFields, queryConfig) {
    const csrfToken = this.#readCookieValue('csrftoken');
    const queryHeaders = {
      'content-type': 'application/x-www-form-urlencoded',
      'x-fb-friendly-name': queryConfig.friendlyName,
      'x-root-field-name': queryConfig.rootFieldName,
      'x-fb-lsd': queryFormFields.lsd || contextHeaders['x-fb-lsd'] || '',
      'x-csrftoken': contextHeaders['x-csrftoken'] || csrfToken || '',
      'x-ig-app-id': contextHeaders['x-ig-app-id'] || '238260118697367',
      referer: contextHeaders.referer || (typeof location !== 'undefined' ? location.href : ''),
    };

    const optionalHeaderKeys = ['x-web-session-id', 'x-asbd-id', 'x-bloks-version-id'];
    for (const optionalHeaderKey of optionalHeaderKeys) {
      const optionalHeaderValue = contextHeaders[optionalHeaderKey];
      if (optionalHeaderValue) {
        queryHeaders[optionalHeaderKey] = optionalHeaderValue;
      }
    }

    return queryHeaders;
  }

  /**
   * Extract typed-account results from GraphQL response payload.
   *
   * @param {unknown} payload - GraphQL response payload.
   * @returns {Array<{ handle: string, displayName: string, isVerified: boolean, profilePictureUrl: string }>}
   */
  #extractAccountSearchSuggestions(payload) {
    const edges =
      payload &&
      typeof payload === 'object' &&
      payload.data &&
      payload.data.xdt_api__v1__users__search_connection &&
      Array.isArray(payload.data.xdt_api__v1__users__search_connection.edges)
        ? payload.data.xdt_api__v1__users__search_connection.edges
        : [];
    return edges
      .map((edge) => this.#normalizeSuggestionNode(edge && edge.node ? edge.node : null))
      .filter(Boolean);
  }

  /**
   * Extract null-state mention suggestions from GraphQL response payload.
   *
   * @param {unknown} payload - GraphQL response payload.
   * @returns {Array<{ handle: string, displayName: string, isVerified: boolean, profilePictureUrl: string }>}
   */
  #extractNullStateSuggestions(payload) {
    const suggestedUsers =
      payload &&
      typeof payload === 'object' &&
      payload.data &&
      payload.data.xdt_mention_nullstate_sugesstions &&
      Array.isArray(payload.data.xdt_mention_nullstate_sugesstions.suggested_users)
        ? payload.data.xdt_mention_nullstate_sugesstions.suggested_users
        : [];
    return suggestedUsers.map((node) => this.#normalizeSuggestionNode(node)).filter(Boolean);
  }

  /**
   * Normalize one GraphQL user node into one deterministic suggestion object.
   *
   * @param {unknown} value - Candidate user node.
   * @returns {{ handle: string, displayName: string, isVerified: boolean, profilePictureUrl: string } | null}
   */
  #normalizeSuggestionNode(value) {
    const candidate = value && typeof value === 'object' ? value : null;
    if (!candidate) {
      return null;
    }

    const handle = normalizeHandle(candidate.username);
    if (!handle) {
      return null;
    }

    const displayName = String(candidate.full_name || candidate.username || '').trim();
    const profilePictureUrl = String(candidate.profile_pic_url || '').trim();
    return {
      handle,
      displayName,
      isVerified: candidate.is_verified === true,
      profilePictureUrl,
    };
  }

  /**
   * Deduplicate suggestions by handle while preserving source order.
   *
   * @param {Array<{ handle: string, displayName: string, isVerified: boolean, profilePictureUrl: string }>} suggestions - Candidate suggestions.
   * @returns {Array<{ handle: string, displayName: string, isVerified: boolean, profilePictureUrl: string }>}
   */
  #dedupeSuggestions(suggestions) {
    const uniqueSuggestions = [];
    const seenHandles = new Set();
    for (const suggestion of suggestions) {
      if (!suggestion || !suggestion.handle || seenHandles.has(suggestion.handle)) {
        continue;
      }
      seenHandles.add(suggestion.handle);
      uniqueSuggestions.push(suggestion);
    }

    return uniqueSuggestions;
  }

  /**
   * Read one cookie value by key.
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

  /**
   * Generate Relay request sequence token compatible with host requests.
   *
   * @returns {string}
   */
  #nextRequestSequence() {
    this.requestSequence += 1;
    return this.requestSequence.toString(36);
  }
}

module.exports = {
  ThreadsAccountSearchClient,
};
