const path = require('path');

const sharp = require('sharp');

const { buildScaledIconDataUri } = require('../../tools/icon-data-uri');

describe('buildScaledIconDataUri', () => {
  test('returns one resized PNG data URI when resize succeeds', async () => {
    const result = await buildScaledIconDataUri({
      sourcePath: path.join('src', 'res', 'bobbin.png'),
      targetSizePx: 30,
    });

    expect(result.startsWith('data:image/png;base64,')).toBe(true);

    const base64Payload = result.replace('data:image/png;base64,', '');
    const outputMetadata = await sharp(Buffer.from(base64Payload, 'base64')).metadata();

    expect(outputMetadata.width).toBe(30);
    expect(outputMetadata.height).toBe(30);
  });

  test('throws when target icon size is not positive', async () => {
    await expect(
      buildScaledIconDataUri({
        targetSizePx: 0,
      })
    ).rejects.toThrow('Expected target icon size to be positive');
  });

  test('throws with diagnostic detail when source image cannot be loaded', async () => {
    await expect(
      buildScaledIconDataUri({
        sourcePath: path.join('src', 'res', 'missing-icon.png'),
      })
    ).rejects.toThrow('Failed to generate icon data URI');
  });
});
