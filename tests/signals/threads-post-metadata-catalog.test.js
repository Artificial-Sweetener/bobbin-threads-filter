const { ThreadsPostMetadataCatalog } = require('../../src/signals/threads-post-metadata-catalog');

describe('ThreadsPostMetadataCatalog', () => {
  test('ingests post metadata from nested GraphQL payloads', () => {
    const catalog = new ThreadsPostMetadataCatalog();
    const ingestedCount = catalog.ingestGraphqlPayload({
      data: {
        feedData: {
          edges: [
            {
              node: {
                text_post_app_thread: {
                  thread_items: [
                    {
                      post: {
                        pk: '123',
                        code: 'POST123',
                        logging_info_token: 'token-123',
                        user: {
                          pk: 'author-99',
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    });

    expect(ingestedCount).toBe(1);
    expect(catalog.getByPostCode('POST123')).toEqual({
      postCode: 'POST123',
      mediaPk: '123',
      rankingInfoToken: 'token-123',
      authorPk: 'author-99',
      hasAiLabel: false,
      genAIDetectionMethod: '',
    });
  });

  test('evicts oldest metadata entries when capacity is exceeded', () => {
    const catalog = new ThreadsPostMetadataCatalog({ maxEntries: 2 });
    catalog.ingestGraphqlPayload({
      posts: [
        { pk: '111', code: 'POST111', logging_info_token: 'token-111' },
        { pk: '222', code: 'POST222', logging_info_token: 'token-222' },
      ],
    });
    catalog.ingestGraphqlPayload({
      post: { pk: '333', code: 'POST333', logging_info_token: 'token-333' },
    });

    expect(catalog.getByPostCode('POST333')).toEqual({
      postCode: 'POST333',
      mediaPk: '333',
      rankingInfoToken: 'token-333',
      authorPk: '',
      hasAiLabel: false,
      genAIDetectionMethod: '',
    });

    const retainedLegacyEntries = [
      catalog.getByPostCode('POST111'),
      catalog.getByPostCode('POST222'),
    ].filter(Boolean);
    expect(retainedLegacyEntries).toHaveLength(1);
  });

  test('expires metadata records after ttl elapses', () => {
    let nowMs = 1_000;
    const catalog = new ThreadsPostMetadataCatalog({
      entryTtlMs: 10,
      nowProvider: () => nowMs,
    });

    catalog.ingestGraphqlPayload({
      post: {
        pk: '444',
        code: 'POST444',
        logging_info_token: 'token-444',
      },
    });

    expect(catalog.getByPostCode('POST444')).toEqual({
      postCode: 'POST444',
      mediaPk: '444',
      rankingInfoToken: 'token-444',
      authorPk: '',
      hasAiLabel: false,
      genAIDetectionMethod: '',
    });

    nowMs = 1_011;
    expect(catalog.getByPostCode('POST444')).toBeNull();
  });

  test('captures AI transparency metadata from post records', () => {
    const catalog = new ThreadsPostMetadataCatalog();

    catalog.ingestGraphqlPayload({
      data: {
        post: {
          pk: '999',
          code: 'POST999',
          logging_info_token: 'token-999',
          gen_ai_detection_method: {
            detection_method: 'SELF_DISCLOSURE_FLOW',
          },
        },
      },
    });

    expect(catalog.getByPostCode('POST999')).toEqual({
      postCode: 'POST999',
      mediaPk: '999',
      rankingInfoToken: 'token-999',
      authorPk: '',
      hasAiLabel: true,
      genAIDetectionMethod: 'SELF_DISCLOSURE_FLOW',
    });
  });

  test('ingests AI disclosure metadata even when ranking token is missing', () => {
    const catalog = new ThreadsPostMetadataCatalog();

    const ingestedCount = catalog.ingestGraphqlPayload({
      data: {
        post: {
          pk: '1001',
          code: 'POST1001',
          logging_info_token: null,
          gen_ai_detection_method: {
            detection_method: 'SELF_DISCLOSURE_FLOW',
          },
        },
      },
    });

    expect(ingestedCount).toBe(1);
    expect(catalog.getByPostCode('POST1001')).toEqual({
      postCode: 'POST1001',
      mediaPk: '1001',
      rankingInfoToken: '',
      authorPk: '',
      hasAiLabel: true,
      genAIDetectionMethod: 'SELF_DISCLOSURE_FLOW',
    });
  });

  test('treats detection method NONE as absence of an AI disclosure label', () => {
    const catalog = new ThreadsPostMetadataCatalog();

    const ingestedCount = catalog.ingestGraphqlPayload({
      data: {
        post: {
          pk: '1002',
          code: 'POST1002',
          logging_info_token: 'token-1002',
          gen_ai_detection_method: {
            detection_method: 'NONE',
          },
        },
      },
    });

    expect(ingestedCount).toBe(1);
    expect(catalog.getByPostCode('POST1002')).toEqual({
      postCode: 'POST1002',
      mediaPk: '1002',
      rankingInfoToken: 'token-1002',
      authorPk: '',
      hasAiLabel: false,
      genAIDetectionMethod: '',
    });
  });
});
