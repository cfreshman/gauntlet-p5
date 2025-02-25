import AipiLayerServer from './AipiLayerServer.js';
import { registerSpotifyTools } from '../layer1/spotifyTools.js';
import { registerLastFmTools } from '../layer1/lastFmTools.js';

const layer1 = new AipiLayerServer({
  name: 'aipi-layer1-server',
  port: 3001,
  wsPort: 3011,
  tools: {
    spotify: registerSpotifyTools,
    lastfm: registerLastFmTools
  }
});

export default layer1; 