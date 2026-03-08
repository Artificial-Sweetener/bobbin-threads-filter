const { Logger } = require('../../src/observability/logger');

function createMemoryWriter() {
  const entries = [];
  return {
    entries,
    log: (...args) => entries.push(['log', ...args]),
    info: (...args) => entries.push(['info', ...args]),
    warn: (...args) => entries.push(['warn', ...args]),
    error: (...args) => entries.push(['error', ...args]),
  };
}

describe('Logger', () => {
  test('emits messages at or above configured level', () => {
    const writer = createMemoryWriter();
    const logger = new Logger({
      namespace: 'test',
      level: 'warn',
      writer,
    });

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    const severities = writer.entries.map((entry) => entry[0]);
    expect(severities).toEqual(['warn', 'error']);
  });

  test('updates runtime threshold when level changes', () => {
    const writer = createMemoryWriter();
    const logger = new Logger({
      namespace: 'test',
      level: 'error',
      writer,
    });

    logger.warn('warn-before');
    logger.setLevel('debug');
    logger.debug('debug-after');

    expect(writer.entries.length).toBe(1);
    expect(writer.entries[0][0]).toBe('log');
  });
});
