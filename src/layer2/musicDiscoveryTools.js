/**
 * Music Discovery Tools (Layer 2)
 * 
 * This module is deprecated. Please use the Last.fm discovery tools in lastfmDiscoveryTools.js
 * for music discovery functionality.
 */

import logger from '../utils/logger.js';

/**
 * Register music discovery tools with the server
 * @param {object} server - The server instance to register tools with
 */
function registerMusicDiscoveryTools(server) {
  logger.info('Music Discovery Tools module is deprecated. Using Last.fm discovery tools instead.');
}

export { registerMusicDiscoveryTools }; 