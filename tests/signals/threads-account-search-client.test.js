const { ThreadsAccountSearchClient } = require('../../src/signals/threads-account-search-client');

function createObserverContext(overrides = {}) {
  return {
    headers: {
      'x-fb-lsd': 'lsd-token',
      'x-csrftoken': 'csrf-token',
      'x-ig-app-id': '238260118697367',
      referer: 'https://www.threads.com/',
      ...overrides.headers,
    },
    formFields: {
      av: '17841463491286462',
      fb_dtsg: 'fb-dtsg-token',
      jazoest: '26290',
      lsd: 'lsd-token',
      __spin_r: '1034413161',
      __spin_b: 'trunk',
      __spin_t: '1772593246',
      ...overrides.formFields,
    },
  };
}

describe('ThreadsAccountSearchClient', () => {
  afterEach(() => {
    delete global.fetch;
    if (global.window && Object.prototype.hasOwnProperty.call(global.window, 'require')) {
      delete global.window.require;
    }
    jest.restoreAllMocks();
  });

  test('queries typed account-search endpoint and normalizes results', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          xdt_api__v1__users__search_connection: {
            edges: [
              {
                node: {
                  username: 'Ameniwa_',
                  full_name: 'Ameniwa',
                  is_verified: false,
                  profile_pic_url: 'https://cdn.example/avatar-1.jpg',
                },
              },
              {
                node: {
                  username: '@ameniwa_',
                  full_name: 'Ameniwa Duplicate',
                  is_verified: true,
                  profile_pic_url: 'https://cdn.example/avatar-2.jpg',
                },
              },
            ],
          },
        },
      }),
    });
    global.fetch = fetchMock;

    const client = new ThreadsAccountSearchClient({
      networkObserver: {
        getRequestContext: () => createObserverContext(),
      },
    });

    const suggestions = await client.searchMentionCandidates('@A');

    expect(suggestions).toEqual([
      {
        handle: 'ameniwa_',
        displayName: 'Ameniwa',
        isVerified: false,
        profilePictureUrl: 'https://cdn.example/avatar-1.jpg',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, requestInit] = fetchMock.mock.calls[0];
    expect(endpoint).toContain('/graphql/query');
    const body = new URLSearchParams(String(requestInit.body || ''));
    expect(body.get('fb_api_req_friendly_name')).toBe(
      'useBarcelonaAccountSearchGraphQLDataSourceQuery'
    );
    expect(body.get('doc_id')).toBe('34971288492470563');
    expect(JSON.parse(body.get('variables'))).toMatchObject({
      query: 'a',
      first: 10,
    });
  });

  test('queries mention null-state endpoint when query token is empty', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          xdt_mention_nullstate_sugesstions: {
            suggested_users: [
              {
                username: 'redterrorcollective',
                full_name: 'Iza Mapache',
                is_verified: false,
                profile_pic_url: 'https://cdn.example/redterror.jpg',
              },
            ],
          },
        },
      }),
    });
    global.fetch = fetchMock;

    const client = new ThreadsAccountSearchClient({
      networkObserver: {
        getRequestContext: () => createObserverContext(),
      },
    });

    const suggestions = await client.searchMentionCandidates('@');

    expect(suggestions).toEqual([
      {
        handle: 'redterrorcollective',
        displayName: 'Iza Mapache',
        isVerified: false,
        profilePictureUrl: 'https://cdn.example/redterror.jpg',
      },
    ]);
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(String(requestInit.body || ''));
    expect(body.get('fb_api_req_friendly_name')).toBe(
      'useBarcelonaMentionsNullStateDataSourceQuery'
    );
    expect(body.get('doc_id')).toBe('33929666426648878');
    expect(JSON.parse(body.get('variables'))).toMatchObject({
      count: 15,
    });
  });

  test('hydrates missing request context fields from host modules', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          xdt_api__v1__users__search_connection: {
            edges: [],
          },
        },
      }),
    });
    global.fetch = fetchMock;
    global.window.require = jest.fn((moduleName) => {
      if (moduleName === 'CurrentUser') {
        return {
          getPossiblyNonFacebookUserID: () => '17841463491286462',
        };
      }
      if (moduleName === 'DTSGInitialData') {
        return {
          token: 'abc',
        };
      }
      if (moduleName === 'LSD') {
        return {
          token: 'lsd-from-module',
        };
      }
      return null;
    });

    const client = new ThreadsAccountSearchClient({
      networkObserver: {
        getRequestContext: () =>
          createObserverContext({
            formFields: {
              av: '',
              fb_dtsg: '',
              jazoest: '',
              lsd: '',
            },
          }),
      },
    });

    await client.searchMentionCandidates('@a');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(String(requestInit.body || ''));
    expect(body.get('av')).toBe('17841463491286462');
    expect(body.get('fb_dtsg')).toBe('abc');
    expect(body.get('lsd')).toBe('lsd-from-module');
    expect(body.get('jazoest')).toBe('2294');
  });

  test('still attempts query when request context fields are missing', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          xdt_api__v1__users__search_connection: {
            edges: [
              {
                node: {
                  username: 'openai',
                  full_name: 'OpenAI',
                  is_verified: true,
                  profile_pic_url: '',
                },
              },
            ],
          },
        },
      }),
    });
    global.fetch = fetchMock;

    const logger = {
      warn: jest.fn(),
      debug: jest.fn(),
    };
    const client = new ThreadsAccountSearchClient({
      networkObserver: {
        getRequestContext: () =>
          createObserverContext({
            formFields: {
              fb_dtsg: '',
              jazoest: '',
              lsd: '',
              av: '',
            },
          }),
      },
      logger,
    });

    const suggestions = await client.searchMentionCandidates('@am');

    expect(suggestions).toEqual([
      {
        handle: 'openai',
        displayName: 'OpenAI',
        isVerified: true,
        profilePictureUrl: '',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
