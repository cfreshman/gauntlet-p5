import { registerSpotifyTools } from '../layer1/spotifyTools.js';
import { registerLastFmTools } from '../layer1/lastFmTools.js';

function register(server) {
  registerSpotifyTools(server);
  registerLastFmTools(server);
}

export default { register }; 