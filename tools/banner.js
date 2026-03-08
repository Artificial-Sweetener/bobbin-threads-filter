const fs = require('fs');
const path = require('path');

const metadataPath = path.join(__dirname, '..', 'src', 'entry', 'metadata.user.js');
const packagePath = path.join(__dirname, '..', 'package.json');
const iconPath = path.join(__dirname, '..', 'src', 'res', 'bobbin-white.png');

/**
 * Load one userscript icon and encode it as data URI metadata.
 *
 * @returns {string}
 */
function loadIconDataUri() {
  const iconBuffer = fs.readFileSync(iconPath);
  return `data:image/png;base64,${iconBuffer.toString('base64')}`;
}

/**
 * Load userscript metadata and synchronize versioned name and icons with local sources.
 *
 * @returns {string}
 */
function loadBanner() {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const iconDataUri = loadIconDataUri();
  const metadata = fs.readFileSync(metadataPath, 'utf8');
  const nameMatch = metadata.match(/^\/\/ @name\s+(.+)$/m);
  const baseName = nameMatch
    ? nameMatch[1].replace(/\s+\([^)]*\)\s*$/, '').trim()
    : 'Bobbin Threads Filter';
  const versionedMetadata = metadata
    .replace(/\/\/ @name\s+.*/, `// @name         ${baseName} (${packageJson.version})`)
    .replace(/\/\/ @version\s+.*/, `// @version      ${packageJson.version}`)
    .replace(/\/\/ @icon\s+.*/, `// @icon         ${iconDataUri}`)
    .replace(/\/\/ @icon64\s+.*/, `// @icon64       ${iconDataUri}`);

  return `${versionedMetadata.trim()}\n`;
}

module.exports = {
  loadBanner,
};
