const {
  FILTER_HIDDEN_ATTRIBUTE,
  FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE,
  FILTER_POST_ID_ATTRIBUTE,
  FILTER_REASON_ATTRIBUTE,
  VERIFIED_BADGE_HIDDEN_ATTRIBUTE,
  StyleManager,
} = require('../../src/dom/style-manager');

describe('StyleManager', () => {
  test('applies hide markers to regular post containers', () => {
    document.body.innerHTML = `
<div id="post-row">
  <a href="/@example/post/ABC">1h</a>
</div>
`;
    const manager = new StyleManager();
    const postRow = document.getElementById('post-row');

    manager.hideElement(postRow, ['verified:badge'], {
      postCode: 'ABC',
    });

    expect(postRow.getAttribute(FILTER_HIDDEN_ATTRIBUTE)).toBe('true');
    expect(postRow.getAttribute(FILTER_REASON_ATTRIBUTE)).toBe('verified:badge');
    expect(postRow.getAttribute(FILTER_POST_ID_ATTRIBUTE)).toBe('ABC');
  });

  test('refuses to hide timeline shell containers with feed chrome links', () => {
    document.body.innerHTML = `
<div id="timeline-shell" ${FILTER_HIDDEN_ATTRIBUTE}="true" ${FILTER_REASON_ATTRIBUTE}="stale">
  <nav>
    <a href="/for_you">For you</a>
    <a href="/following">Following</a>
  </nav>
  <div>timeline content</div>
</div>
`;
    const manager = new StyleManager();
    const timelineShell = document.getElementById('timeline-shell');

    manager.hideElement(timelineShell, ['verified:badge']);

    expect(timelineShell.hasAttribute(FILTER_HIDDEN_ATTRIBUTE)).toBe(false);
    expect(timelineShell.hasAttribute(FILTER_REASON_ATTRIBUTE)).toBe(false);
  });

  test('refuses to hide feed-body child under timeline chrome shell', () => {
    document.body.innerHTML = `
<div id="timeline-shell">
  <nav>
    <a href="/for_you">For you</a>
    <a href="/following">Following</a>
  </nav>
  <div id="feed-body">
    <a href="/@author/post/POST01">1h</a>
    <button aria-label="Like"></button>
    <button aria-label="Reply"></button>
    <button aria-label="Repost"></button>
    <button aria-label="Share"></button>
  </div>
</div>
`;
    const manager = new StyleManager();
    const feedBody = document.getElementById('feed-body');

    manager.hideElement(feedBody, ['verified:badge']);

    expect(feedBody.hasAttribute(FILTER_HIDDEN_ATTRIBUTE)).toBe(false);
    expect(feedBody.hasAttribute(FILTER_REASON_ATTRIBUTE)).toBe(false);
  });

  test('refuses to hide viewport-scale containers', () => {
    document.body.innerHTML = `
<div id="huge-container">
  <a href="/@author/post/POST99">1h</a>
</div>
`;
    const manager = new StyleManager();
    const hugeContainer = document.getElementById('huge-container');

    Object.defineProperty(hugeContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        top: 0,
        left: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      }),
    });

    manager.hideElement(hugeContainer, ['verified:badge']);

    expect(hugeContainer.hasAttribute(FILTER_HIDDEN_ATTRIBUTE)).toBe(false);
    expect(hugeContainer.hasAttribute(FILTER_REASON_ATTRIBUTE)).toBe(false);
  });

  test('clears stale hide markers across a document root', () => {
    document.body.innerHTML = `
<div id="post-one" ${FILTER_HIDDEN_ATTRIBUTE}="true" ${FILTER_REASON_ATTRIBUTE}="verified:badge">
  <div id="post-one-child" ${FILTER_HIDDEN_ATTRIBUTE}="true" ${FILTER_REASON_ATTRIBUTE}="phrase:spam" ${FILTER_POST_ID_ATTRIBUTE}="POST01"></div>
</div>
<div id="post-two" ${FILTER_HIDDEN_ATTRIBUTE}="true" ${FILTER_REASON_ATTRIBUTE}="username:example" ${FILTER_POST_ID_ATTRIBUTE}="POST02"></div>
`;
    const manager = new StyleManager();
    const postOne = document.getElementById('post-one');
    const postOneChild = document.getElementById('post-one-child');
    const postTwo = document.getElementById('post-two');

    manager.clearAllHiddenMarkers(document);

    expect(postOne.hasAttribute(FILTER_HIDDEN_ATTRIBUTE)).toBe(false);
    expect(postOne.hasAttribute(FILTER_REASON_ATTRIBUTE)).toBe(false);
    expect(postOneChild.hasAttribute(FILTER_HIDDEN_ATTRIBUTE)).toBe(false);
    expect(postOneChild.hasAttribute(FILTER_REASON_ATTRIBUTE)).toBe(false);
    expect(postOneChild.hasAttribute(FILTER_POST_ID_ATTRIBUTE)).toBe(false);
    expect(postTwo.hasAttribute(FILTER_HIDDEN_ATTRIBUTE)).toBe(false);
    expect(postTwo.hasAttribute(FILTER_REASON_ATTRIBUTE)).toBe(false);
    expect(postTwo.hasAttribute(FILTER_POST_ID_ATTRIBUTE)).toBe(false);
  });

  test('toggles verified badge visibility markers in one scope', () => {
    document.body.innerHTML = `
<div id="post-row">
  <a href="/@verified_user">Verified User</a>
  <svg id="verified-badge" aria-label="Verified" role="img">
    <title>Verified</title>
    <path d="M19.998 3.094" />
  </svg>
  <a href="/@verified_user/post/ABC">1h</a>
</div>
`;
    const manager = new StyleManager();
    const postRow = document.getElementById('post-row');
    const badgeElement = document.getElementById('verified-badge');

    manager.setVerifiedBadgesHidden(postRow, true);
    expect(badgeElement.getAttribute(VERIFIED_BADGE_HIDDEN_ATTRIBUTE)).toBe('true');

    manager.setVerifiedBadgesHidden(postRow, false);
    expect(badgeElement.hasAttribute(VERIFIED_BADGE_HIDDEN_ATTRIBUTE)).toBe(false);
  });

  test('clears all verified badge visibility markers under one root', () => {
    document.body.innerHTML = `
<div id="post-one">
  <svg id="badge-one" ${VERIFIED_BADGE_HIDDEN_ATTRIBUTE}="true" aria-label="Verified" role="img"></svg>
</div>
<div id="post-two">
  <svg id="badge-two" ${VERIFIED_BADGE_HIDDEN_ATTRIBUTE}="true" aria-label="Verified" role="img"></svg>
</div>
`;
    const manager = new StyleManager();
    const badgeOne = document.getElementById('badge-one');
    const badgeTwo = document.getElementById('badge-two');

    manager.clearAllVerifiedBadgeMarkers(document);

    expect(badgeOne.hasAttribute(VERIFIED_BADGE_HIDDEN_ATTRIBUTE)).toBe(false);
    expect(badgeTwo.hasAttribute(VERIFIED_BADGE_HIDDEN_ATTRIBUTE)).toBe(false);
  });

  test('suppresses the first visible timeline divider after hidden top rows', () => {
    document.body.innerHTML = `
<section aria-label="Column body">
  <div id="composer">What's new?</div>
  <hr />
  <div id="feed-shell">
    <div id="top-hidden-shell">
      <div data-pressable-container="true" style="border-top: 1px solid rgba(0, 0, 0, 0.15)">
        <a href="/@hidden_author/post/HIDDEN01">1h</a>
        <button aria-label="Like"></button>
        <button aria-label="Reply"></button>
        <button aria-label="Repost"></button>
        <button aria-label="Share"></button>
      </div>
    </div>
    <div id="first-visible-shell">
      <div id="first-visible" data-pressable-container="true" style="border-top: 1px solid rgba(0, 0, 0, 0.15)">
        <a href="/@visible_author/post/VISIBLE01">2h</a>
        <button aria-label="Like"></button>
        <button aria-label="Reply"></button>
        <button aria-label="Repost"></button>
        <button aria-label="Share"></button>
      </div>
    </div>
    <div id="second-visible-shell">
      <div id="second-visible" data-pressable-container="true" style="border-top: 1px solid rgba(0, 0, 0, 0.15)">
        <a href="/@visible_author/post/VISIBLE02">3h</a>
        <button aria-label="Like"></button>
        <button aria-label="Reply"></button>
        <button aria-label="Repost"></button>
        <button aria-label="Share"></button>
      </div>
    </div>
  </div>
</section>
`;
    const manager = new StyleManager();
    const topHiddenShell = document.getElementById('top-hidden-shell');
    const firstVisibleShell = document.getElementById('first-visible-shell');
    const secondVisibleShell = document.getElementById('second-visible-shell');
    const firstVisible = document.getElementById('first-visible');
    const secondVisible = document.getElementById('second-visible');

    manager.hideElement(topHiddenShell, ['verified:blue-check'], {
      postCode: 'HIDDEN01',
    });
    manager.syncFirstVisibleTimelineDividers([firstVisibleShell, secondVisibleShell], document);

    expect(firstVisible.getAttribute(FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE)).toBe('true');
    expect(secondVisible.hasAttribute(FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE)).toBe(false);
  });

  test('clears stale first-visible divider markers before recomputing', () => {
    document.body.innerHTML = `
<section aria-label="Column body">
  <div id="feed-shell">
    <div id="first-visible-shell">
      <div id="first-visible" data-pressable-container="true" ${FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE}="true">
        <a href="/@visible_author/post/VISIBLE01">2h</a>
        <button aria-label="Like"></button>
        <button aria-label="Reply"></button>
        <button aria-label="Repost"></button>
        <button aria-label="Share"></button>
      </div>
    </div>
    <div id="second-visible-shell">
      <div id="second-visible" data-pressable-container="true">
        <a href="/@visible_author/post/VISIBLE02">3h</a>
        <button aria-label="Like"></button>
        <button aria-label="Reply"></button>
        <button aria-label="Repost"></button>
        <button aria-label="Share"></button>
      </div>
    </div>
  </div>
</section>
`;
    const manager = new StyleManager();
    const firstVisibleShell = document.getElementById('first-visible-shell');
    const secondVisibleShell = document.getElementById('second-visible-shell');
    const firstVisible = document.getElementById('first-visible');
    const secondVisible = document.getElementById('second-visible');

    manager.syncFirstVisibleTimelineDividers([firstVisibleShell, secondVisibleShell], document);

    expect(firstVisible.hasAttribute(FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE)).toBe(false);
    expect(secondVisible.hasAttribute(FIRST_VISIBLE_TIMELINE_ITEM_ATTRIBUTE)).toBe(false);
  });
});
