import { registerMusicAgent } from '../layer3/musicAgent.js';

function register(server, { client }) {
  registerMusicAgent(server, { client });
}

export default { register }; 