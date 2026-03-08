const { NotInterestedClient } = require('../../src/signals/not-interested-client');

function createClient(fetchImplementation) {
  global.fetch = fetchImplementation;

  return new NotInterestedClient({
    networkObserver: {
      getRequestContext: () => ({
        headers: {
          'x-csrftoken': 'csrf-token',
          'x-fb-lsd': 'lsd-header',
          referer: 'https://www.threads.com/',
        },
        formFields: {
          av: '12345',
          fb_dtsg: 'fb-dtsg-token',
          jazoest: '22000',
          lsd: 'lsd-token',
        },
      }),
    },
    logger: { debug: jest.fn(), warn: jest.fn() },
  });
}

describe('NotInterestedClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('accepts GraphQL payloads without explicit status field', async () => {
    const client = createClient(
      jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            xdt_text_app_send_negative_media_ranking_signal: {
              success: true,
            },
          },
        }),
      }))
    );

    const result = await client.sendNotInterested({
      viewerPk: '12345',
      mediaPk: '90001',
      rankingInfoToken: 'token-a',
    });

    expect(result).toEqual({
      ok: true,
      statusCode: 200,
      reason: 'ok',
    });
  });

  test('treats payloads with GraphQL errors as failed requests', async () => {
    const client = createClient(
      jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          errors: [{ message: 'request blocked' }],
        }),
      }))
    );

    const result = await client.sendNotInterested({
      viewerPk: '12345',
      mediaPk: '90001',
      rankingInfoToken: 'token-a',
    });

    expect(result).toEqual({
      ok: false,
      statusCode: 200,
      reason: 'invalid-response',
    });
  });
});
