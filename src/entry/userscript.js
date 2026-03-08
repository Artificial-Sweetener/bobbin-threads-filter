const { FilterRuntime } = require('../core/filter-runtime');
const { Logger } = require('../observability/logger');

/**
 * Start userscript runtime while keeping host page resilient on failures.
 *
 * @returns {Promise<void>}
 */
async function startUserscript() {
  const logger = new Logger({ namespace: 'userscript', level: 'warn' });
  const runtime = new FilterRuntime({ logger });
  await runtime.start();
}

startUserscript().catch(() => {
  // Preserve host page execution even when startup fails.
});
