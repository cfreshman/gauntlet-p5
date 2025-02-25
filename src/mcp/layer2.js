import AipiLayerServer from './AipiLayerServer.js';
import { registerMusicAnalysisTools } from '../layer2/musicAnalysisTools.js';
import { registerPlaylistGenerationTools } from '../layer2/playlistGenerationTools.js';
import { registerMusicDiscoveryTools } from '../layer2/musicDiscoveryTools.js';
import { registerLastfmDiscoveryTools } from '../layer2/lastfmDiscoveryTools.js';

const layer2 = new AipiLayerServer({
  name: 'aipi-layer2-server',
  port: 3002,
  wsPort: 3012,
  useOpenAI: true,
  tools: {
    analysis: registerMusicAnalysisTools,
    playlists: registerPlaylistGenerationTools,
    discovery: registerMusicDiscoveryTools,
    lastfm: registerLastfmDiscoveryTools
  },
  layerClients: {
    layer1: {
      port: 3001,
      wsPort: 3011
    }
  }
});

export default layer2; 