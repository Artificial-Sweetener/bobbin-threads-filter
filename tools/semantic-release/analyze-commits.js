const { execSync } = require('child_process');

const SEMVER_TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Detect semver tags so the first GitHub push reliably publishes v1.0.0.
 *
 * semantic-release uses commit messages to decide whether a release should be
 * published. For a brand-new repo, it is easy to end up with a non-releasing
 * first push (e.g., "initial commit") even when the intention is to cut v1.0.0.
 * This analyzer forces a release only when the repo has no existing semver tags.
 *
 * @param {string[]} tags - Candidate git tag strings.
 * @returns {'major' | null}
 */
function decideFirstReleaseTypeFromTags(tags) {
  const semverTags = tags.filter((tag) => SEMVER_TAG_PATTERN.test(tag.trim()));
  return semverTags.length === 0 ? 'major' : null;
}

/**
 * Read tag names from git without throwing on non-git environments.
 *
 * @returns {string[] | null}
 */
function readGitTags() {
  try {
    const output = execSync('git tag -l', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    return null;
  }
}

/**
 * Emit semantic-release analyzeCommits output when executed as a script.
 */
function main() {
  const tags = readGitTags();
  if (!tags) {
    return;
  }

  const forcedReleaseType = decideFirstReleaseTypeFromTags(tags);
  if (forcedReleaseType) {
    process.stdout.write(`${forcedReleaseType}\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  SEMVER_TAG_PATTERN,
  decideFirstReleaseTypeFromTags,
  readGitTags,
};
