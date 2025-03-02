import { registerSpotifyTools } from '../layer1/spotifyTools.js';
import { registerLastFmTools } from '../layer1/lastFmTools.js';
import { registerThinkingTools } from '../layer1/thinkingTools.js';

function register(server) {
  registerSpotifyTools(server);
  registerLastFmTools(server);
  registerThinkingTools(server);
}

export default { register }; 