import '../utils/punycode-hook.js';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables first
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { startServer } from './server.js';

async function main() {
  try {
    logger.info('Starting music-aipi MCP server...');
    await startServer();
    logger.info('Server started successfully');
    logger.info('Press Ctrl+C to exit');
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
}

main();