/**
 * @file Send silent not-interested GraphQL mutations to Threads.
 */

const HIDE_POST_MUTATION_DOC_ID = '24885800151042190';
const HIDE_POST_FRIENDLY_NAME = 'useBarcelonaHidePostMutationHidePostMutation';
const HIDE_POST_ROOT_FIELD_NAME = 'xdt_text_app_send_negative_media_ranking_signal';

const REQUIRED_CONTEXT_FIELDS = ['av', 'fb_dtsg', 'jazoest', 'lsd'];

/**
 * Dispatch hide-post mutation calls using the latest observed request context.
 */
class NotInterestedClient {
  /**
   * Initialize mutation dependencies and request sequence state.
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
   * Send one mutation request for a target post.
   *
   * @param {{
   *   viewerPk: string,
   *   mediaPk: string,
   *   rankingInfoToken: string,
   *   containerModule?: string
   * }} options - Mutation input.
   * @returns {Promise<{ ok: boolean, statusCode: number, reason: string }>}
   */
  async sendNotInterested(options) {
    const {
      viewerPk,
      mediaPk,
      rankingInfoToken,
      containerModule = 'ig_text_feed_timeline',
    } = options;

    if (!viewerPk || !mediaPk || !rankingInfoToken) {
      return { ok: false, statusCode: 0, reason: 'missing-required-input' };
    }

    const context = this.networkObserver.getRequestContext();
    const formFields = this.#buildMutationFormFields(context.formFields, {
      viewerPk,
      mediaPk,
      rankingInfoToken,
      containerModule,
    });
    const missingContextField = REQUIRED_CONTEXT_FIELDS.find((fieldName) => !formFields[fieldName]);
    if (missingContextField) {
      return { ok: false, statusCode: 0, reason: `missing-context:${missingContextField}` };
    }

    const endpoint = this.#resolveEndpointUrl();
    const mutationHeaders = this.#buildMutationHeaders(context.headers, formFields);
    const body = new URLSearchParams(formFields).toString();

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: mutationHeaders,
        body,
        credentials: 'include',
      });
    } catch (_error) {
      return { ok: false, statusCode: 0, reason: 'network-error' };
    }

    let responsePayload = null;
    try {
      responsePayload = await response.json();
    } catch (_error) {
      // Accept non-JSON payloads as failed requests.
    }

    const isOkStatus = response.ok;
    const hasGraphqlErrors =
      responsePayload &&
      typeof responsePayload === 'object' &&
      (Boolean(responsePayload.error) ||
        (Array.isArray(responsePayload.errors) && responsePayload.errors.length > 0));
    const isOkPayload =
      responsePayload &&
      typeof responsePayload === 'object' &&
      (responsePayload.status === 'ok' || !hasGraphqlErrors);
    if (isOkStatus && isOkPayload) {
      this.logger.debug('Sent not-interested mutation successfully.', { mediaPk });
      return { ok: true, statusCode: response.status, reason: 'ok' };
    }

    return {
      ok: false,
      statusCode: response.status || 0,
      reason: isOkStatus ? 'invalid-response' : 'request-failed',
    };
  }

  /**
   * Resolve mutation endpoint URL for the current host context.
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
   * Build mutation form fields from observed GraphQL request context.
   *
   * @param {Record<string, string>} contextFormFields - Observed form field baseline.
   * @param {{
   *   viewerPk: string,
   *   mediaPk: string,
   *   rankingInfoToken: string,
   *   containerModule: string
   * }} input - Mutation input.
   * @returns {Record<string, string>}
   */
  #buildMutationFormFields(contextFormFields, input) {
    const mutationFormFields = {
      ...contextFormFields,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: HIDE_POST_FRIENDLY_NAME,
      doc_id: HIDE_POST_MUTATION_DOC_ID,
      server_timestamps: 'true',
      __req: this.#nextRequestSequence(),
      variables: JSON.stringify({
        a_pk: input.viewerPk,
        m_pk: input.mediaPk,
        container_module: input.containerModule,
        ranking_info_token: input.rankingInfoToken,
        barcelona_source_quote_post_id: null,
        barcelona_source_reply_post_id: null,
      }),
    };

    if (!mutationFormFields.__user) {
      mutationFormFields.__user = '0';
    }
    if (!mutationFormFields.__a) {
      mutationFormFields.__a = '1';
    }
    if (!mutationFormFields.dpr) {
      mutationFormFields.dpr =
        typeof devicePixelRatio === 'number' && devicePixelRatio > 0
          ? String(devicePixelRatio)
          : '1';
    }

    return mutationFormFields;
  }

  /**
   * Build request headers for hide-post mutation dispatch.
   *
   * @param {Record<string, string>} contextHeaders - Observed request headers.
   * @param {Record<string, string>} mutationFormFields - Mutation form fields.
   * @returns {Record<string, string>}
   */
  #buildMutationHeaders(contextHeaders, mutationFormFields) {
    const csrfToken = this.#readCookieValue('csrftoken');
    const mutationHeaders = {
      'content-type': 'application/x-www-form-urlencoded',
      'x-fb-friendly-name': HIDE_POST_FRIENDLY_NAME,
      'x-root-field-name': HIDE_POST_ROOT_FIELD_NAME,
      'x-fb-lsd': mutationFormFields.lsd || contextHeaders['x-fb-lsd'] || '',
      'x-csrftoken': contextHeaders['x-csrftoken'] || csrfToken || '',
      'x-ig-app-id': contextHeaders['x-ig-app-id'] || '238260118697367',
      referer: contextHeaders.referer || (typeof location !== 'undefined' ? location.href : ''),
    };

    const optionalHeaderKeys = ['x-web-session-id', 'x-asbd-id', 'x-bloks-version-id'];
    for (const optionalHeaderKey of optionalHeaderKeys) {
      const optionalHeaderValue = contextHeaders[optionalHeaderKey];
      if (optionalHeaderValue) {
        mutationHeaders[optionalHeaderKey] = optionalHeaderValue;
      }
    }

    return mutationHeaders;
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

  /**
   * Generate Relay request sequence token compatible with observed traffic.
   *
   * @returns {string}
   */
  #nextRequestSequence() {
    this.requestSequence += 1;
    return this.requestSequence.toString(36);
  }
}

module.exports = {
  NotInterestedClient,
};
