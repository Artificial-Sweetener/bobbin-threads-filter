const { decideFirstReleaseTypeFromTags } = require('../../tools/semantic-release/analyze-commits');

describe('decideFirstReleaseTypeFromTags', () => {
  test('forces a first release when no semver tags exist', () => {
    expect(decideFirstReleaseTypeFromTags([])).toBe('major');
    expect(decideFirstReleaseTypeFromTags(['not-a-version', 'release-candidate'])).toBe('major');
    expect(decideFirstReleaseTypeFromTags(['vNext'])).toBe('major');
  });

  test('does not force a release when at least one semver tag exists', () => {
    expect(decideFirstReleaseTypeFromTags(['v1.0.0'])).toBeNull();
    expect(decideFirstReleaseTypeFromTags(['v0.0.1', 'misc'])).toBeNull();
    expect(decideFirstReleaseTypeFromTags(['v1.2.3-beta.1'])).toBeNull();
    expect(decideFirstReleaseTypeFromTags(['v1.2.3+build.5'])).toBeNull();
  });
});
