const fs = require('fs');
const path = require('path');

const { loadBanner } = require('../../tools/banner');

const packagePath = path.join(__dirname, '..', '..', 'package.json');

describe('loadBanner', () => {
  test('injects package version and local icon data URIs into metadata', () => {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const banner = loadBanner();

    expect(banner).toContain(`// @name         Bobbin Threads Filter (${packageJson.version})`);
    expect(banner).toContain(`// @version      ${packageJson.version}`);
    expect(banner).toMatch(/\/\/ @icon\s+data:image\/png;base64,[A-Za-z0-9+/=]+/);
    expect(banner).toMatch(/\/\/ @icon64\s+data:image\/png;base64,[A-Za-z0-9+/=]+/);
    expect(banner).not.toContain('// @icon         ICON');
    expect(banner).not.toContain('// @icon64       ICON64');
  });
});
