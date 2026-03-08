const releaseConfig = require('../../.releaserc.cjs');

/**
 * Find a configured semantic-release plugin by package name.
 *
 * @param {string} pluginName - Match the plugin package name exactly.
 * @returns {string | [string, object] | undefined}
 */
function findPlugin(pluginName) {
  return releaseConfig.plugins.find((plugin) =>
    Array.isArray(plugin) ? plugin[0] === pluginName : plugin === pluginName
  );
}

describe('semantic-release config', () => {
  test('publish a GitHub release with the built userscript asset and no bot release commit', () => {
    const githubPlugin = findPlugin('@semantic-release/github');

    expect(githubPlugin).toBeDefined();
    expect(githubPlugin[1]).toMatchObject({
      assets: [
        {
          path: 'bobbin-threads-filter.user.js',
          label: 'Bobbin Threads Filter userscript',
        },
      ],
    });
    expect(findPlugin('@semantic-release/changelog')).toBeUndefined();
    expect(findPlugin('@semantic-release/git')).toBeUndefined();
  });
});
