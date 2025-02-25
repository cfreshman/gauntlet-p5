# Files to Process

## Core Server
- [x] src/web-server.js (main entry point)

## Chat System
- [x] src/chat/message-processor.js

## MCP System
- [x] src/mcp/run-all.js (main MCP runner)
- [x] src/mcp/index.js
- [x] src/mcp/demo.js
- [x] src/mcp/layer1Client.js
- [x] src/mcp/layer2Client.js
- [x] src/mcp/layer3Client.js
- [x] src/mcp/layer1Server.js
- [x] src/mcp/layer2Server.js
- [x] src/mcp/layer3Server.js
- [ ] src/mcp/README.md

## Utils
- [x] src/utils/lastfmClient.js
- [x] src/utils/spotifyClient.js
- [x] src/utils/tool-formatter.js
- [x] src/utils/mcp-client.js
- [x] src/utils/logger.js

## Layer Tools (Need to verify if used)
- [x] src/layer1/lastFmTools.js
- [x] src/layer1/spotifyTools.js
- [x] src/layer2/lastfmDiscoveryTools.js
- [x] src/layer2/musicAnalysisTools.js
- [x] src/layer2/musicDiscoveryTools.js
- [x] src/layer2/playlistGenerationTools.js
- [x] src/layer3/musicAipiAgent.js
- [x] src/layer3/musicCurationTools.js

## CLI (Likely to be removed)
- [ ] src/cli/music-discovery-cli.js

## Tests (Likely to be removed)
- [ ] src/tests/client-test.js
- [ ] src/tests/lastfm-discovery-test.js
- [ ] src/tests/music-analysis-test.js
- [ ] src/tests/music-curation-test.js
- [ ] src/tests/music-discovery-test.js
- [ ] src/tests/playlist-generation-test.js
- [ ] src/tests/simple-discovery-test.js
- [ ] src/tests/simple-search-test.js
- [ ] src/tests/spotify-test.js
- [ ] src/tests/integration/*
- [ ] src/tests/unit/*

## Empty Directories (To be removed)
- [ ] src/layer0/

## Notes
- [x] means file has been converted to ESM and verified working
- Files marked with [x] are core files that are definitely needed
- Need to verify which layer tools are actually used by the MCP system
- CLI and test files likely to be removed unless specifically needed
- Empty directories should be removed 