const {
  collectVerifiedBadgeElements,
  containsVerifiedBadge,
} = require('../../src/dom/verified-badge-dom');

describe('verified-badge-dom', () => {
  test('collects explicit verified badge nodes', () => {
    document.body.innerHTML = `
<div id="row">
  <svg id="badge" aria-label="Verified" role="img">
    <title>Verified</title>
    <path d="M19.998 3.094" />
  </svg>
</div>
`;

    const rowElement = document.getElementById('row');
    const badgeElement = document.getElementById('badge');
    const badgeNodes = collectVerifiedBadgeElements(rowElement);

    expect(badgeNodes).toHaveLength(1);
    expect(badgeNodes[0]).toBe(badgeElement);
    expect(containsVerifiedBadge(rowElement)).toBe(true);
  });

  test('collects signature-only verified badge svg nodes', () => {
    document.body.innerHTML = `
<div id="row">
  <svg id="signature-badge" role="img" viewBox="-4 0 27 19">
    <path d="M7.84375 17.5625 8.88281 18.6094" />
  </svg>
</div>
`;

    const rowElement = document.getElementById('row');
    const badgeElement = document.getElementById('signature-badge');
    const badgeNodes = collectVerifiedBadgeElements(rowElement);

    expect(badgeNodes).toHaveLength(1);
    expect(badgeNodes[0]).toBe(badgeElement);
  });

  test('deduplicates badge nodes detected by overlapping selectors', () => {
    document.body.innerHTML = `
<div id="row">
  <svg id="badge" aria-label="Verified" role="img" viewBox="0 0 40 40">
    <title>Verified</title>
    <path d="M19.998 3.094 20 4" />
  </svg>
</div>
`;

    const rowElement = document.getElementById('row');
    const badgeNodes = collectVerifiedBadgeElements(rowElement);

    expect(badgeNodes).toHaveLength(1);
  });

  test('returns empty collection when no verified badge exists', () => {
    document.body.innerHTML = `
<div id="row">
  <svg role="img" aria-label="Popular"></svg>
</div>
`;

    const rowElement = document.getElementById('row');

    expect(collectVerifiedBadgeElements(rowElement)).toEqual([]);
    expect(containsVerifiedBadge(rowElement)).toBe(false);
  });
});
