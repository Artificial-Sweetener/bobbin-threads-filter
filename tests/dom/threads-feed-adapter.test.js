const { ThreadsFeedAdapter } = require('../../src/dom/threads-feed-adapter');

function renderPost({
  handle,
  displayName,
  permalinkId,
  text,
  verifiedBadgeHtml = '',
  extraPermalinkHtml = '',
  trendingTopic = '',
}) {
  const trendingTopicMarkup = trendingTopic
    ? `<a href="/search?q=${encodeURIComponent(
        trendingTopic
      )}&serp_type=timely_topics&trend_fbid=123">Trending: ${trendingTopic}</a>`
    : '';
  return `
<div data-post>
  <div class="header-row">
    ${trendingTopicMarkup}
    <a href="/@${handle}">${displayName}</a>
    ${verifiedBadgeHtml}
    <a href="/@${handle}/post/${permalinkId}">1h</a>
    ${extraPermalinkHtml}
  </div>
  <div>${text}</div>
  <button aria-label="Like"></button>
  <button aria-label="Reply"></button>
  <button aria-label="Repost"></button>
  <button aria-label="Share"></button>
</div>
`;
}

function renderSuggestedFollowModule({ containerId = 'suggested-row' } = {}) {
  return `
<div id="${containerId}">
  <div>Suggested for you</div>
  <div>
    <a href="/@suggested_one">suggested_one</a>
    <button>Follow</button>
    <button>Close</button>
  </div>
  <div>
    <a href="/@suggested_two">suggested_two</a>
    <button>Follow</button>
    <button>Close</button>
  </div>
</div>
`;
}

describe('ThreadsFeedAdapter', () => {
  test('collects post models and flags verified authors from labeled badges', () => {
    document.body.innerHTML = `
<main>
  ${renderPost({
    handle: 'verified_handle',
    displayName: 'Verified User',
    permalinkId: 'ABC123',
    text: 'A verified post',
    verifiedBadgeHtml:
      '<svg aria-label="Verified" role="img"><title>Verified</title><path d="M19.998 3.094" /></svg>',
  })}
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toHaveLength(1);
    expect(models[0].authorHandle).toBe('verified_handle');
    expect(models[0].postCode).toBe('ABC123');
    expect(models[0].postCodes).toEqual(['ABC123']);
    expect(models[0].displayName).toBe('Verified User');
    expect(models[0].text).toContain('A verified post');
    expect(models[0].postHandles).toEqual(['verified_handle']);
    expect(models[0].verifiedPostHandles).toEqual(['verified_handle']);
    expect(models[0].isVerified).toBe(true);
    expect(models[0].hasBlueCheck).toBe(true);
  });

  test('deduplicates containers with multiple permalink anchors', () => {
    document.body.innerHTML = `
<main>
  ${renderPost({
    handle: 'multi_link',
    displayName: 'Multi Link',
    permalinkId: 'POST01',
    text: 'Post with media link',
    extraPermalinkHtml: '<a href="/@multi_link/post/POST01/media">media</a>',
  })}
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toHaveLength(1);
    expect(models[0].authorHandle).toBe('multi_link');
    expect(models[0].postCodes).toEqual(['POST01']);
  });

  test('detects verified badge by known SVG signature when label is absent', () => {
    document.body.innerHTML = `
<main>
  ${renderPost({
    handle: 'signature_only',
    displayName: 'Signature Badge',
    permalinkId: 'POST02',
    text: 'Signature-based verified icon',
    verifiedBadgeHtml:
      '<svg role="img" viewBox="-4 0 27 19"><path d="M7.84375 17.5625 8.88281 18.6094" /></svg>',
  })}
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toHaveLength(1);
    expect(models[0].isVerified).toBe(true);
  });

  test('returns empty list when no post permalinks exist', () => {
    document.body.innerHTML = `
<main>
  <div>
    <a href="/@plain_user">plain_user</a>
    <div>No post permalink available.</div>
  </div>
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toEqual([]);
  });

  test('collects suggested-follow modules labeled "Suggested for you"', () => {
    document.body.innerHTML = `
<main>
  ${renderSuggestedFollowModule({ containerId: 'suggested-follow-row' })}
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toHaveLength(1);
    expect(models[0].isSuggestedFollow).toBe(true);
    expect(models[0].element).not.toBeNull();
    expect(models[0].element.getAttribute('id')).toBe('suggested-follow-row');
  });

  test('extracts trending topics from timely-topic highlight links', () => {
    document.body.innerHTML = `
<main>
  ${renderPost({
    handle: 'topic_author',
    displayName: 'Topic Author',
    permalinkId: 'TREND01',
    text: 'Topic-linked post',
    trendingTopic: 'Daily Deals',
  })}
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toHaveLength(1);
    expect(models[0].isTrending).toBe(true);
    expect(models[0].trendingTopics).toEqual(['daily deals']);
  });

  test('ignores heading text that lacks follow-module controls', () => {
    document.body.innerHTML = `
<main>
  <div id="invalid-suggested-module">
    <div>Suggested for you</div>
    <a href="/@someone">someone</a>
  </div>
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toEqual([]);
  });

  test('selects outermost single-post wrapper to hide full feed row', () => {
    document.body.innerHTML = `
<main>
  <div data-feed-row="true" id="outer-row">
    <div id="mid-row">
      <div id="inner-row">
        ${renderPost({
          handle: 'outer_scope',
          displayName: 'Outer Scope',
          permalinkId: 'ROW01',
          text: 'Outer row capture',
          verifiedBadgeHtml:
            '<svg aria-label="Verified" role="img"><title>Verified</title><path d="M19.998 3.094" /></svg>',
        })}
      </div>
    </div>
  </div>
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toHaveLength(1);
    expect(models[0].element).not.toBeNull();
    expect(models[0].element.getAttribute('id')).toBe('outer-row');
  });

  test('ignores verified badge that appears only in a separate quote branch', () => {
    document.body.innerHTML = `
<main>
  <div data-post>
    <div class="author-shell-level-1">
      <div class="author-shell-level-2">
        <div class="author-shell-level-3">
          <div class="author-shell-level-4">
            <a href="/@plain_user"></a>
            <a href="/@plain_user">plain_user</a>
            <a href="/@plain_user/post/PLAIN01">1h</a>
          </div>
        </div>
      </div>
    </div>
    <div class="content-shell">
      <div class="quoted-post">
        <a href="/@quoted_verified">quoted_verified</a>
        <svg aria-label="Verified" role="img">
          <title>Verified</title>
          <path d="M19.998 3.094" />
        </svg>
      </div>
      <div>Plain author text body</div>
    </div>
    <div role="button">Like</div>
    <div role="button">Reply</div>
    <div role="button">Repost</div>
    <div role="button">Share</div>
  </div>
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toHaveLength(1);
    expect(models[0].authorHandle).toBe('plain_user');
    expect(models[0].postHandles).toEqual(['plain_user']);
    expect(models[0].verifiedPostHandles).toEqual([]);
    expect(models[0].isVerified).toBe(false);
  });

  test('captures verified repost handles without switching row-level hide target', () => {
    document.body.innerHTML = `
<main>
  <div data-feed-row="true" id="repost-row">
    <div class="reposter-header">
      <a href="/@reposter_handle">reposter_handle</a>
      <a href="/@reposter_handle/post/REP01">1h</a>
    </div>
    <div class="reposted-content-shell">
      <div class="reposted-header-shell">
        <a href="/@verified_source">verified_source</a>
        <svg aria-label="Verified" role="img">
          <title>Verified</title>
          <path d="M19.998 3.094" />
        </svg>
        <a href="/@verified_source/post/SRC01">2h</a>
      </div>
      <div>Reposted verified source content</div>
    </div>
    <button aria-label="Like"></button>
    <button aria-label="Reply"></button>
    <button aria-label="Repost"></button>
    <button aria-label="Share"></button>
  </div>
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toHaveLength(1);
    expect(models[0].element).not.toBeNull();
    expect(models[0].element.getAttribute('id')).toBe('repost-row');
    expect(models[0].authorHandle).toBe('reposter_handle');
    expect(models[0].postCodes).toEqual(['REP01', 'SRC01']);
    expect(models[0].postHandles).toEqual(['reposter_handle', 'verified_source']);
    expect(models[0].verifiedPostHandles).toEqual(['verified_source']);
    expect(models[0].isVerified).toBe(false);
  });

  test('avoids timeline shell with For you/Following links and keeps post-level container', () => {
    document.body.innerHTML = `
<main>
  <div id="timeline-shell">
    <nav>
      <a href="/for_you">For you</a>
      <a href="/following">Following</a>
    </nav>
    <div id="feed-body">
      <div id="post-row">
        ${renderPost({
          handle: 'timeline_guard',
          displayName: 'Timeline Guard',
          permalinkId: 'GUARD01',
          text: 'Guard against feed-shell selection',
          verifiedBadgeHtml:
            '<svg aria-label="Verified" role="img"><title>Verified</title><path d="M19.998 3.094" /></svg>',
        })}
      </div>
    </div>
  </div>
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toHaveLength(1);
    expect(models[0].element).not.toBeNull();
    expect(models[0].element.getAttribute('id')).toBe('post-row');
  });

  test('falls back to nearest valid containers when broad wrapper collapses multiple posts', () => {
    document.body.innerHTML = `
<main>
  <div id="broad-wrapper">
    ${renderPost({
      handle: 'first_author',
      displayName: 'First Author',
      permalinkId: 'FIRST01',
      text: 'First feed row',
    })}
    ${renderPost({
      handle: 'second_author',
      displayName: 'Second Author',
      permalinkId: 'SECOND01',
      text: 'Second feed row',
    })}
  </div>
</main>
`;

    const adapter = new ThreadsFeedAdapter();
    const models = adapter.collectContentModels(document);

    expect(models).toHaveLength(2);
    expect(models.map((model) => model.postCode)).toEqual(['FIRST01', 'SECOND01']);
    expect(models.every((model) => model.element.getAttribute('id') !== 'broad-wrapper')).toBe(
      true
    );
  });
});
