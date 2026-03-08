const path = require('path');

const esbuild = require('esbuild');

const { loadBanner } = require('./banner');
const { buildScaledIconDataUri } = require('./icon-data-uri');

const entryPoint = path.join(__dirname, '..', 'src', 'entry', 'userscript.js');
const outFile = path.join(__dirname, '..', 'bobbin-threads-filter.user.js');
const aboutIconSourcePath = path.join(__dirname, '..', 'src', 'res', 'about.png');

/**
 * Build single-file userscript artifact from source entrypoint.
 *
 * @returns {Promise<void>}
 */
async function build() {
  const bobbinIconDataUri = await buildScaledIconDataUri();
  const aboutIconDataUri = await buildScaledIconDataUri({
    sourcePath: aboutIconSourcePath,
    targetSizePx: 22,
  });

  await esbuild.build({
    entryPoints: [entryPoint],
    outfile: outFile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2018'],
    banner: {
      js: loadBanner(),
    },
    define: {
      __BOBBIN_ICON_DATA_URI__: JSON.stringify(bobbinIconDataUri),
      __BOBBIN_ABOUT_ICON_DATA_URI__: JSON.stringify(aboutIconDataUri),
    },
    logLevel: 'info',
  });
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
