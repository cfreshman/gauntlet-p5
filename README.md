# Music-AIPI: Spotify & Last.fm AI-Powered Tools

A comprehensive toolkit that combines the Spotify Web API and Last.fm API with AI capabilities to create intelligent music tools.

## Overview

This toolkit is a layered architecture that provides a range of tools for interacting with music APIs, from simple data retrieval to complex AI-powered music curation and analysis. The toolkit is organized into three layers:

- **Layer 1 (Primitives)**: Direct wrappers around the Spotify Web API and Last.fm API endpoints
- **Layer 2 (Agentic)**: Intelligent tools that combine API calls with analysis and processing
- **Layer 3 (Expert)**: High-level tools that orchestrate complex workflows using LLMs and multiple Layer 1 and Layer 2 tools

## Features

- Search for tracks, artists, albums, and playlists
- Discover similar music using Last.fm's recommendation engine
- Analyze audio features of tracks with detailed insights
- Generate playlists based on various criteria
- Enhance existing playlists with additional tracks
- Create personalized music collections based on user preferences and context
- Analyze listening patterns and music taste
- Interactive chat interface for natural language music discovery
- Web client for a modern, user-friendly experience
- And much more!

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/music-aipi.git
   cd music-aipi
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the `src` directory with the following variables:
   ```
   PORT=3000
   NODE_ENV=development
   OPENAI_API_KEY=your_openai_api_key
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   SPOTIFY_REDIRECT_URI=http://localhost:3000/callback
   LASTFM_API_KEY=your_lastfm_api_key
   LOG_LEVEL=info
   ```

## Usage

### Starting the Server

```
npm start
```

### Running the CLI Tool

```
npm run music-discovery
```

### Running the Chat Interface

```
npm run music-chat
```

### Running the Web Client

```
# Start the development server
npm run web:dev

# Build the web client for production
npm run web:build

# Start the web server (after building)
npm run web:server
```

### Running Tests

```
# Test Spotify API client and search functionality
node src/tests/spotify-test.js

# Test Last.fm discovery tools
node src/tests/lastfm-discovery-test.js

# Test music analysis tools
node src/tests/music-analysis-test.js

# Test playlist generation tools
node src/tests/playlist-generation-test.js

# Test music curation tools
node src/tests/music-curation-test.js
```

## Web Client

The web client provides a modern, user-friendly interface for interacting with the Music-AIPI system. It features:

- Real-time chat interface with the AI assistant
- Markdown rendering for rich responses
- Clickable Spotify links for discovered tracks
- Responsive design for desktop and mobile
- Modern, Spotify-inspired dark theme

To access the web client, start the web server and navigate to `http://localhost:3001` in your browser.

## API Integration

This toolkit integrates with two major music APIs:

### Spotify Web API

The Spotify Web API provides access to Spotify's vast music catalog, including track information, audio features, and playlist management. Our toolkit uses the Spotify API for:

- Searching for tracks, artists, albums, and playlists
- Retrieving detailed track information and audio features
- Creating and managing playlists
- Playback control (for premium users)

### Last.fm API

The Last.fm API provides music discovery and recommendation features based on collective listening data. Our toolkit uses the Last.fm API for:

- Discovering similar tracks and artists
- Finding top tracks by tag/genre
- Retrieving artist information and top tracks
- Accessing user listening history and recommendations

## Architecture

The project follows a layered architecture:

1. **Layer 0**: Core utilities and infrastructure
2. **Layer 1**: Direct API wrappers
3. **Layer 2**: Intelligent tools
4. **Layer 3**: Expert-level tools

Each layer builds on the capabilities of the layers below it, creating a powerful and flexible system.

## Documentation

For detailed documentation of all available tools, see the [API Tools Documentation](./api-tools.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Spotify Web API](https://developer.spotify.com/documentation/web-api/)
- [Last.fm API](https://www.last.fm/api)
- [OpenAI API](https://openai.com/blog/openai-api)
