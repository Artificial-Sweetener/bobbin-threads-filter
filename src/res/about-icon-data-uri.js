/**
 * @file Provide embedded About hat icon data for settings header rendering.
 */

/* global __BOBBIN_ABOUT_ICON_DATA_URI__ */

const FALLBACK_ABOUT_ICON_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAffwJ9QAAAABJRU5ErkJggg==';

const ABOUT_ICON_DATA_URI =
  typeof __BOBBIN_ABOUT_ICON_DATA_URI__ !== 'undefined' &&
  typeof __BOBBIN_ABOUT_ICON_DATA_URI__ === 'string' &&
  __BOBBIN_ABOUT_ICON_DATA_URI__.startsWith('data:image/png;base64,')
    ? __BOBBIN_ABOUT_ICON_DATA_URI__
    : FALLBACK_ABOUT_ICON_DATA_URI;

module.exports = {
  ABOUT_ICON_DATA_URI,
};
