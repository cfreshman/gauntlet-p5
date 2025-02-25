/**
 * Logger utility for consistent logging across the application
 */
const logger = {
  debug: (...args) => console.debug('[debug]', ...args),
  info: (...args) => console.info('[info]', ...args),
  warn: (...args) => console.warn('[warn]', ...args),
  error: (...args) => console.error('[error]', ...args)
};

export default logger;
