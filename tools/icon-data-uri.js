const path = require('path');

const sharp = require('sharp');

const { SIDEBAR_TRIGGER_ICON_SIZE_PX } = require('../src/ui/sidebar-trigger-config');

const DEFAULT_ICON_SOURCE_PATH = path.join(__dirname, '..', 'src', 'res', 'bobbin.png');

/**
 * Build one resized icon data URI from the high-resolution Bobbin source asset.
 *
 * @param {{
 *   sourcePath?: string,
 *   targetSizePx?: number
 * }} [options] - Data-URI generation options.
 * @returns {Promise<string>}
 */
async function buildScaledIconDataUri(options = {}) {
  const sourcePath = path.resolve(options.sourcePath || DEFAULT_ICON_SOURCE_PATH);
  const targetSizePx = Number.isFinite(options.targetSizePx)
    ? Math.floor(options.targetSizePx)
    : SIDEBAR_TRIGGER_ICON_SIZE_PX;

  if (targetSizePx <= 0) {
    throw new Error(`Expected target icon size to be positive, received ${targetSizePx}.`);
  }

  try {
    const outputBuffer = await sharp(sourcePath)
      .resize({
        width: targetSizePx,
        height: targetSizePx,
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer();

    return `data:image/png;base64,${outputBuffer.toString('base64')}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate icon data URI from "${sourcePath}": ${message}`);
  }
}

module.exports = {
  buildScaledIconDataUri,
};
