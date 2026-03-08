/**
 * @file Detect verified badge elements inside Threads DOM subtrees.
 */

const VERIFIED_WORD_PATTERN = /\bverified\b/i;
const VERIFIED_LABEL_SELECTOR =
  'svg[aria-label], img[aria-label], img[alt], [role="img"][aria-label], [title]';
const VERIFIED_EXPLICIT_SELECTOR = [
  'svg[aria-label="Verified"]',
  'img[alt="Verified"]',
  'img[aria-label="Verified"]',
  '[title="Verified"]',
].join(', ');
const VERIFIED_SIGNATURE_PATH_SELECTOR = [
  'svg[viewBox="0 0 40 40"] path[d^="M19.998 3.094"]',
  'svg[viewBox="-4 0 27 19"] path[d^="M7.84375 17.5625"]',
].join(', ');

/**
 * Resolve one detected node to the badge element that should be hidden.
 *
 * @param {Element} candidateNode - Candidate badge node.
 * @returns {Element|null}
 */
function resolveBadgeElement(candidateNode) {
  if (!candidateNode || typeof candidateNode.closest !== 'function') {
    return null;
  }

  const tagName = String(candidateNode.tagName || '').toUpperCase();
  if (tagName === 'TITLE' || tagName === 'PATH') {
    return candidateNode.closest('svg');
  }

  if (tagName === 'SVG' || tagName === 'IMG') {
    return candidateNode;
  }

  if (String(candidateNode.getAttribute('role') || '').toLowerCase() === 'img') {
    return candidateNode;
  }

  return candidateNode.closest('svg, img, [role="img"]');
}

/**
 * Collect verified badge elements from one DOM subtree.
 *
 * @param {Element|Document} rootElement - Search root.
 * @returns {Element[]}
 */
function collectVerifiedBadgeElements(rootElement) {
  if (!rootElement || typeof rootElement.querySelectorAll !== 'function') {
    return [];
  }

  const badgeElements = new Set();
  const addBadgeElement = (candidateNode) => {
    const badgeElement = resolveBadgeElement(candidateNode);
    if (badgeElement) {
      badgeElements.add(badgeElement);
    }
  };

  for (const explicitNode of rootElement.querySelectorAll(VERIFIED_EXPLICIT_SELECTOR)) {
    addBadgeElement(explicitNode);
  }

  for (const labeledNode of rootElement.querySelectorAll(VERIFIED_LABEL_SELECTOR)) {
    const normalizedLabel = `${labeledNode.getAttribute('aria-label') || ''} ${
      labeledNode.getAttribute('title') || ''
    } ${labeledNode.getAttribute('alt') || ''}`
      .trim()
      .toLowerCase();
    if (!VERIFIED_WORD_PATTERN.test(normalizedLabel)) {
      continue;
    }

    addBadgeElement(labeledNode);
  }

  for (const signatureNode of rootElement.querySelectorAll(VERIFIED_SIGNATURE_PATH_SELECTOR)) {
    addBadgeElement(signatureNode);
  }

  return Array.from(badgeElements);
}

/**
 * Detect whether one subtree contains at least one verified badge.
 *
 * @param {Element|Document} rootElement - Search root.
 * @returns {boolean}
 */
function containsVerifiedBadge(rootElement) {
  return collectVerifiedBadgeElements(rootElement).length > 0;
}

module.exports = {
  collectVerifiedBadgeElements,
  containsVerifiedBadge,
};
