module.exports = {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/exec',
      {
        analyzeCommitsCmd: 'node tools/semantic-release/analyze-commits.js',
        prepareCmd: 'npm run build',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          {
            path: 'bobbin-threads-filter.user.js',
            label: 'Bobbin Threads Filter userscript',
          },
        ],
      },
    ],
  ],
};
