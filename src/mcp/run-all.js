/**
 * MCP Run All Script
 * 
 * This script runs all three MCP layers simultaneously on different ports.
 */

import '../utils/punycode-hook.js';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables first
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import layers after environment is loaded
import layer1 from './layer1.js';
import layer2 from './layer2.js';
import layer3 from './layer3.js';

async function startAllServers() {
  try {
    // Start Layer 1
    logger.info('Starting Layer 1 server...');
    await layer1.start();
    logger.info('Layer 1 server started successfully');

    // Wait a bit for Layer 1 to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start Layer 2
    logger.info('Starting Layer 2 server...');
    await layer2.start();
    logger.info('Layer 2 server started successfully');

    // Wait a bit for Layer 2 to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start Layer 3
    logger.info('Starting Layer 3 server...');
    await layer3.start();
    logger.info('Layer 3 server started successfully');

    logger.info('All MCP servers started successfully');

    // Handle process termination
    process.on('SIGINT', () => {
      logger.info('Terminating all MCP servers');
      process.exit(0);
    });

    logger.info('Press Ctrl+C to exit');
  } catch (error) {
    logger.error('Error starting MCP servers:', error);
    process.exit(1);
  }
}

startAllServers(); 