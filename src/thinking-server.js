import thinkingServer from './utils/thinking-server.js';
import logger from './utils/logger.js';

// Start thinking server
thinkingServer.start();

logger.info('Thinking server started');

// Keep process alive
process.on('SIGINT', () => {
  logger.info('Shutting down thinking server');
  process.exit(0);
}); 