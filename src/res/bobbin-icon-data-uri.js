/**
 * @file Provide embedded Bobbin icon data for sidebar trigger rendering.
 */

/* global __BOBBIN_ICON_DATA_URI__ */

const FALLBACK_BOBBIN_ICON_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAffwJ9QAAAABJRU5ErkJggg==';

const BOBBIN_ICON_DATA_URI =
  typeof __BOBBIN_ICON_DATA_URI__ !== 'undefined' &&
  typeof __BOBBIN_ICON_DATA_URI__ === 'string' &&
  __BOBBIN_ICON_DATA_URI__.startsWith('data:image/png;base64,')
    ? __BOBBIN_ICON_DATA_URI__
    : FALLBACK_BOBBIN_ICON_DATA_URI;

module.exports = {
  BOBBIN_ICON_DATA_URI,
};
