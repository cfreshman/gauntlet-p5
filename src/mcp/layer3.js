import AipiLayerServer from './AipiLayerServer.js';
import { registerMusicCurationTools } from '../layer3/musicCurationTools.js';
import { registerMusicAipiAgent } from '../layer3/musicAipiAgent.js';

const layer3 = new AipiLayerServer({
  name: 'aipi-layer3-server',
  port: 3003,
  wsPort: 3013,
  useOpenAI: true,
  tools: {
    curation: registerMusicCurationTools,
    agent: registerMusicAipiAgent
  },
  layerClients: {
    layer2: {
      port: 3002,
      wsPort: 3012
    },
    layer1: {
      port: 3001,
      wsPort: 3011
    }
  }
});

export default layer3; 