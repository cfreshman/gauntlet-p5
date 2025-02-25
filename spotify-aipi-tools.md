# Spotify AIPI Tools Documentation

## Overview

This document outlines the comprehensive set of AIPI tools for interacting with the Spotify API through a layered architecture. The tools are organized into three layers:

1. **Layer 1 (Primitives)**: Deterministic tools that directly interact with Spotify API endpoints
2. **Layer 2 (Agentic)**: Tools that combine code execution with LLM capabilities
3. **Layer 3 (Expert)**: LLM-only orchestration tools for complex queries and workflows

Each layer builds upon the capabilities of the layers below it, creating a powerful and flexible system for music discovery, playlist management, and audio analysis.

## MVP Implementation (Target: Friday)

This section outlines the minimum viable product (MVP) implementation that can be completed by Friday. The MVP focuses on core functionality across all three layers to demonstrate the layered architecture while providing immediate value.

### MVP Tools by Layer

#### Layer 1 MVP (Primitives)
- **Track Tools**:
  - `get-track`: Retrieve detailed information about a specific track
  - `get-audio-features`: Get audio features for a specific track
- **Playlist Tools**:
  - `get-playlist`: Retrieve details about a playlist
  - `get-playlist-tracks`: Retrieve tracks in a playlist
  - `create-playlist`: Create a new playlist
  - `add-tracks-to-playlist`: Add tracks to a playlist
- **Search Tools**:
  - `search`: Search for tracks, artists, albums, or playlists

#### Layer 2 MVP (Agentic)
- **Music Analysis Tools**:
  - `analyze-track-features`: Analyze audio features of a track
  - `compare-tracks`: Compare multiple tracks based on specified aspects
- **Playlist Generation Tools**:
  - `generate-playlist`: Generate a playlist based on specified criteria
  - `enhance-playlist`: Enhance an existing playlist with additional tracks
- **Music Discovery Tools**:
  - `discover-similar-music`: Discover music similar to provided tracks or artists

#### Layer 3 MVP (Expert)
- **Music Curation Tools**:
  - `curate-personalized-collection`: Create a comprehensive music collection tailored to a user's preferences
- **Music Insight Tools**:
  - `analyze-listening-context`: Analyze how context affects music listening and provide recommendations
- **Creative Music Tools**:
  - `create-character-playlist`: Create a playlist that represents a fictional or real character

### MVP Implementation Strategy
1. **Focus on core API endpoints**: Implement the most commonly used Spotify API endpoints first
2. **Prioritize user-facing features**: Emphasize tools that provide immediate value to end users
3. **Demonstrate layered architecture**: Ensure each layer properly builds upon the layers below it
4. **Implement robust error handling**: Focus on graceful error handling for a smooth user experience
5. **Document thoroughly**: Provide clear documentation for each implemented tool

The MVP will serve as a foundation for future development while demonstrating the power and flexibility of the layered architecture approach.

## Layer 1 Tools (Primitives)

Layer 1 tools provide deterministic operations that directly interact with the Spotify API. These tools handle data validation, transformation, and basic operations without using LLMs.

### Track Tools

#### `get-track`
- **Description**: Get detailed information about a specific track
- **Parameters**: 
  - `trackId` (string): Spotify track ID
- **Spotify API Used**: GET /tracks/{id}
- **Returns**: Track details including name, artists, album, duration, etc.

#### `get-several-tracks`
- **Description**: Get information about multiple tracks in a single request
- **Parameters**: 
  - `trackIds` (array of strings): List of Spotify track IDs (max 50)
- **Spotify API Used**: GET /tracks
- **Returns**: Array of track objects with details

#### `get-audio-features`
- **Description**: Get audio features for a specific track
- **Parameters**: 
  - `trackId` (string): Spotify track ID
- **Spotify API Used**: GET /audio-features/{id}
- **Returns**: Audio features including tempo, key, mode, time signature, acousticness, danceability, energy, etc.

#### `get-several-audio-features`
- **Description**: Get audio features for multiple tracks
- **Parameters**: 
  - `trackIds` (array of strings): List of Spotify track IDs (max 100)
- **Spotify API Used**: GET /audio-features
- **Returns**: Array of audio features objects

#### `get-audio-analysis`
- **Description**: Get detailed audio analysis for a track
- **Parameters**: 
  - `trackId` (string): Spotify track ID
- **Spotify API Used**: GET /audio-analysis/{id}
- **Returns**: Detailed audio analysis including sections, segments, beats, tatums, etc.

#### `get-user-saved-tracks`
- **Description**: Get tracks saved in the current user's library
- **Parameters**: 
  - `limit` (number, optional): Maximum number of tracks (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
- **Spotify API Used**: GET /me/tracks
- **Returns**: Array of saved track objects

#### `save-tracks`
- **Description**: Save tracks to the current user's library
- **Parameters**: 
  - `trackIds` (array of strings): List of Spotify track IDs
- **Spotify API Used**: PUT /me/tracks
- **Returns**: Success status

#### `remove-saved-tracks`
- **Description**: Remove tracks from the current user's library
- **Parameters**: 
  - `trackIds` (array of strings): List of Spotify track IDs
- **Spotify API Used**: DELETE /me/tracks
- **Returns**: Success status

#### `check-saved-tracks`
- **Description**: Check if tracks are saved in the current user's library
- **Parameters**: 
  - `trackIds` (array of strings): List of Spotify track IDs
- **Spotify API Used**: GET /me/tracks/contains
- **Returns**: Array of booleans indicating saved status

### Playlist Tools

#### `get-playlist`
- **Description**: Get details about a playlist
- **Parameters**: 
  - `playlistId` (string): Spotify playlist ID
  - `fields` (string, optional): Comma-separated list of fields to return
- **Spotify API Used**: GET /playlists/{playlist_id}
- **Returns**: Playlist details including name, description, owner, tracks, etc.

#### `get-playlist-tracks`
- **Description**: Get tracks in a playlist
- **Parameters**: 
  - `playlistId` (string): Spotify playlist ID
  - `limit` (number, optional): Maximum number of tracks (default: 20, max: 100)
  - `offset` (number, optional): Index offset for pagination
- **Spotify API Used**: GET /playlists/{playlist_id}/tracks
- **Returns**: Array of playlist track objects

#### `get-user-playlists`
- **Description**: Get playlists owned or followed by the current user
- **Parameters**: 
  - `limit` (number, optional): Maximum number of playlists (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
- **Spotify API Used**: GET /me/playlists
- **Returns**: Array of simplified playlist objects

#### `get-user-profile-playlists`
- **Description**: Get public playlists owned by a specific user
- **Parameters**: 
  - `userId` (string): Spotify user ID
  - `limit` (number, optional): Maximum number of playlists (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
- **Spotify API Used**: GET /users/{user_id}/playlists
- **Returns**: Array of simplified playlist objects

#### `create-playlist`
- **Description**: Create a new playlist
- **Parameters**: 
  - `name` (string): Name of the playlist
  - `description` (string, optional): Description of the playlist
  - `public` (boolean, optional): Whether the playlist should be public (default: false)
  - `collaborative` (boolean, optional): Whether the playlist should be collaborative (default: false)
- **Spotify API Used**: POST /users/{user_id}/playlists
- **Returns**: Created playlist object

#### `update-playlist`
- **Description**: Update a playlist's details
- **Parameters**: 
  - `playlistId` (string): Spotify playlist ID
  - `name` (string, optional): New name for the playlist
  - `description` (string, optional): New description for the playlist
  - `public` (boolean, optional): New public status for the playlist
  - `collaborative` (boolean, optional): New collaborative status for the playlist
- **Spotify API Used**: PUT /playlists/{playlist_id}
- **Returns**: Success status

#### `add-tracks-to-playlist`
- **Description**: Add tracks to a playlist
- **Parameters**: 
  - `playlistId` (string): Spotify playlist ID
  - `trackUris` (array of strings): List of Spotify track URIs
  - `position` (number, optional): Position to insert tracks
- **Spotify API Used**: POST /playlists/{playlist_id}/tracks
- **Returns**: Snapshot ID of the playlist after the operation

#### `remove-tracks-from-playlist`
- **Description**: Remove tracks from a playlist
- **Parameters**: 
  - `playlistId` (string): Spotify playlist ID
  - `trackUris` (array of strings): List of Spotify track URIs to remove
  - `snapshotId` (string, optional): Playlist snapshot ID for conflict resolution
- **Spotify API Used**: DELETE /playlists/{playlist_id}/tracks
- **Returns**: New snapshot ID of the playlist

#### `reorder-playlist-tracks`
- **Description**: Reorder tracks in a playlist
- **Parameters**: 
  - `playlistId` (string): Spotify playlist ID
  - `rangeStart` (number): Position of the first track to be reordered
  - `insertBefore` (number): Position where tracks should be inserted
  - `rangeLength` (number, optional): Number of tracks to be reordered (default: 1)
  - `snapshotId` (string, optional): Playlist snapshot ID for conflict resolution
- **Spotify API Used**: PUT /playlists/{playlist_id}/tracks
- **Returns**: New snapshot ID of the playlist

#### `replace-playlist-tracks`
- **Description**: Replace all tracks in a playlist
- **Parameters**: 
  - `playlistId` (string): Spotify playlist ID
  - `trackUris` (array of strings): List of Spotify track URIs
- **Spotify API Used**: PUT /playlists/{playlist_id}/tracks
- **Returns**: Success status

#### `get-featured-playlists`
- **Description**: Get a list of Spotify featured playlists
- **Parameters**: 
  - `limit` (number, optional): Maximum number of playlists (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
  - `country` (string, optional): Country code (ISO 3166-1 alpha-2)
  - `locale` (string, optional): Desired language (RFC 1766)
  - `timestamp` (string, optional): Timestamp in ISO 8601 format
- **Spotify API Used**: GET /browse/featured-playlists
- **Returns**: Array of featured playlist objects

#### `get-category-playlists`
- **Description**: Get playlists for a specific Spotify category
- **Parameters**: 
  - `categoryId` (string): Spotify category ID
  - `limit` (number, optional): Maximum number of playlists (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
  - `country` (string, optional): Country code (ISO 3166-1 alpha-2)
- **Spotify API Used**: GET /browse/categories/{category_id}/playlists
- **Returns**: Array of category playlist objects

### Artist Tools

#### `get-artist`
- **Description**: Get information about a specific artist
- **Parameters**: 
  - `artistId` (string): Spotify artist ID
- **Spotify API Used**: GET /artists/{id}
- **Returns**: Artist details including name, popularity, genres, images, etc.

#### `get-several-artists`
- **Description**: Get information about multiple artists
- **Parameters**: 
  - `artistIds` (array of strings): List of Spotify artist IDs (max 50)
- **Spotify API Used**: GET /artists
- **Returns**: Array of artist objects

#### `get-artist-albums`
- **Description**: Get albums by a specific artist
- **Parameters**: 
  - `artistId` (string): Spotify artist ID
  - `includeGroups` (string, optional): Album types to include (album, single, appears_on, compilation)
  - `limit` (number, optional): Maximum number of albums (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
  - `market` (string, optional): Market code (ISO 3166-1 alpha-2)
- **Spotify API Used**: GET /artists/{id}/albums
- **Returns**: Array of simplified album objects

#### `get-artist-top-tracks`
- **Description**: Get an artist's top tracks
- **Parameters**: 
  - `artistId` (string): Spotify artist ID
  - `market` (string): Market code (ISO 3166-1 alpha-2)
- **Spotify API Used**: GET /artists/{id}/top-tracks
- **Returns**: Array of track objects

#### `get-related-artists`
- **Description**: Get artists similar to a specific artist
- **Parameters**: 
  - `artistId` (string): Spotify artist ID
- **Spotify API Used**: GET /artists/{id}/related-artists
- **Returns**: Array of artist objects

#### `follow-artists`
- **Description**: Follow one or more artists
- **Parameters**: 
  - `artistIds` (array of strings): List of Spotify artist IDs
- **Spotify API Used**: PUT /me/following
- **Returns**: Success status

#### `unfollow-artists`
- **Description**: Unfollow one or more artists
- **Parameters**: 
  - `artistIds` (array of strings): List of Spotify artist IDs
- **Spotify API Used**: DELETE /me/following
- **Returns**: Success status

#### `check-following-artists`
- **Description**: Check if current user follows specific artists
- **Parameters**: 
  - `artistIds` (array of strings): List of Spotify artist IDs
- **Spotify API Used**: GET /me/following/contains
- **Returns**: Array of booleans indicating following status

### Album Tools

#### `get-album`
- **Description**: Get information about a specific album
- **Parameters**: 
  - `albumId` (string): Spotify album ID
  - `market` (string, optional): Market code (ISO 3166-1 alpha-2)
- **Spotify API Used**: GET /albums/{id}
- **Returns**: Album details including name, artists, tracks, release date, etc.

#### `get-several-albums`
- **Description**: Get information about multiple albums
- **Parameters**: 
  - `albumIds` (array of strings): List of Spotify album IDs (max 20)
  - `market` (string, optional): Market code (ISO 3166-1 alpha-2)
- **Spotify API Used**: GET /albums
- **Returns**: Array of album objects

#### `get-album-tracks`
- **Description**: Get tracks in an album
- **Parameters**: 
  - `albumId` (string): Spotify album ID
  - `limit` (number, optional): Maximum number of tracks (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
  - `market` (string, optional): Market code (ISO 3166-1 alpha-2)
- **Spotify API Used**: GET /albums/{id}/tracks
- **Returns**: Array of simplified track objects

#### `get-user-saved-albums`
- **Description**: Get albums saved in the current user's library
- **Parameters**: 
  - `limit` (number, optional): Maximum number of albums (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
  - `market` (string, optional): Market code (ISO 3166-1 alpha-2)
- **Spotify API Used**: GET /me/albums
- **Returns**: Array of saved album objects

#### `save-albums`
- **Description**: Save albums to the current user's library
- **Parameters**: 
  - `albumIds` (array of strings): List of Spotify album IDs
- **Spotify API Used**: PUT /me/albums
- **Returns**: Success status

#### `remove-saved-albums`
- **Description**: Remove albums from the current user's library
- **Parameters**: 
  - `albumIds` (array of strings): List of Spotify album IDs
- **Spotify API Used**: DELETE /me/albums
- **Returns**: Success status

#### `check-saved-albums`
- **Description**: Check if albums are saved in the current user's library
- **Parameters**: 
  - `albumIds` (array of strings): List of Spotify album IDs
- **Spotify API Used**: GET /me/albums/contains
- **Returns**: Array of booleans indicating saved status

#### `get-new-releases`
- **Description**: Get a list of new album releases
- **Parameters**: 
  - `limit` (number, optional): Maximum number of albums (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
  - `country` (string, optional): Country code (ISO 3166-1 alpha-2)
- **Spotify API Used**: GET /browse/new-releases
- **Returns**: Array of album objects

### Search Tools

#### `search-spotify`
- **Description**: Search for items on Spotify
- **Parameters**: 
  - `query` (string): Search query
  - `types` (array of strings): Item types to search for (album, artist, playlist, track, show, episode, audiobook)
  - `limit` (number, optional): Maximum number of results per type (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
  - `market` (string, optional): Market code (ISO 3166-1 alpha-2)
  - `includeExternal` (string, optional): Include external audio content in search
- **Spotify API Used**: GET /search
- **Returns**: Object containing arrays of matching items by type

### Recommendations Tools

#### `get-recommendations`
- **Description**: Get track recommendations based on seeds
- **Parameters**: 
  - `seedArtists` (array of strings, optional): Spotify artist IDs (max 5 seeds total)
  - `seedGenres` (array of strings, optional): Genre names (max 5 seeds total)
  - `seedTracks` (array of strings, optional): Spotify track IDs (max 5 seeds total)
  - `limit` (number, optional): Number of tracks to return (default: 20, max: 100)
  - `market` (string, optional): Market code (ISO 3166-1 alpha-2)
  - `minX`, `maxX`, `targetX` (number, optional): Various audio feature constraints
- **Spotify API Used**: GET /recommendations
- **Returns**: Object containing recommended tracks

#### `get-recommendation-genres`
- **Description**: Get available genre seeds for recommendations
- **Parameters**: None
- **Spotify API Used**: GET /recommendations/available-genre-seeds
- **Returns**: Array of available genre names

### User Profile Tools

#### `get-current-user-profile`
- **Description**: Get detailed profile of the current user
- **Parameters**: None
- **Spotify API Used**: GET /me
- **Returns**: User profile object

#### `get-user-profile`
- **Description**: Get public profile of a specific user
- **Parameters**: 
  - `userId` (string): Spotify user ID
- **Spotify API Used**: GET /users/{user_id}
- **Returns**: User profile object

#### `get-user-top-items`
- **Description**: Get the current user's top artists or tracks
- **Parameters**: 
  - `type` (string): Type of entity to return (artists or tracks)
  - `timeRange` (string, optional): Time range (long_term, medium_term, short_term)
  - `limit` (number, optional): Maximum number of items (default: 20, max: 50)
  - `offset` (number, optional): Index offset for pagination
- **Spotify API Used**: GET /me/top/{type}
- **Returns**: Array of artist or track objects

### Player Tools

#### `get-playback-state`
- **Description**: Get information about the user's current playback
- **Parameters**: 
  - `market` (string, optional): Market code (ISO 3166-1 alpha-2)
- **Spotify API Used**: GET /me/player
- **Returns**: Current playback information

#### `get-available-devices`
- **Description**: Get the user's available devices
- **Parameters**: None
- **Spotify API Used**: GET /me/player/devices
- **Returns**: Array of device objects

#### `get-currently-playing-track`
- **Description**: Get the user's currently playing track
- **Parameters**: 
  - `market` (string, optional): Market code (ISO 3166-1 alpha-2)
- **Spotify API Used**: GET /me/player/currently-playing
- **Returns**: Currently playing object

#### `transfer-playback`
- **Description**: Transfer playback to a different device
- **Parameters**: 
  - `deviceId` (string): ID of the device to transfer playback to
  - `play` (boolean, optional): Whether to ensure playback happens on new device
- **Spotify API Used**: PUT /me/player
- **Returns**: Success status

#### `start-resume-playback`
- **Description**: Start or resume playback
- **Parameters**: 
  - `deviceId` (string, optional): Device ID to target
  - `contextUri` (string, optional): Spotify URI of context to play
  - `uris` (array of strings, optional): Spotify track URIs to play
  - `offset` (object, optional): Position to start playback from
  - `positionMs` (number, optional): Position in milliseconds to seek to
- **Spotify API Used**: PUT /me/player/play
- **Returns**: Success status

#### `pause-playback`
- **Description**: Pause playback
- **Parameters**: 
  - `deviceId` (string, optional): Device ID to target
- **Spotify API Used**: PUT /me/player/pause
- **Returns**: Success status

#### `skip-to-next`
- **Description**: Skip to the next track
- **Parameters**: 
  - `deviceId` (string, optional): Device ID to target
- **Spotify API Used**: POST /me/player/next
- **Returns**: Success status

#### `skip-to-previous`
- **Description**: Skip to the previous track
- **Parameters**: 
  - `deviceId` (string, optional): Device ID to target
- **Spotify API Used**: POST /me/player/previous
- **Returns**: Success status

#### `seek-to-position`
- **Description**: Seek to a position in the currently playing track
- **Parameters**: 
  - `positionMs` (number): Position in milliseconds
  - `deviceId` (string, optional): Device ID to target
- **Spotify API Used**: PUT /me/player/seek
- **Returns**: Success status

#### `set-repeat-mode`
- **Description**: Set the repeat mode
- **Parameters**: 
  - `state` (string): Repeat mode (track, context, off)
  - `deviceId` (string, optional): Device ID to target
- **Spotify API Used**: PUT /me/player/repeat
- **Returns**: Success status

#### `set-playback-volume`
- **Description**: Set the volume for playback
- **Parameters**: 
  - `volumePercent` (number): Volume percentage (0-100)
  - `deviceId` (string, optional): Device ID to target
- **Spotify API Used**: PUT /me/player/volume
- **Returns**: Success status

#### `toggle-playback-shuffle`
- **Description**: Toggle shuffle mode
- **Parameters**: 
  - `state` (boolean): Shuffle state (true or false)
  - `deviceId` (string, optional): Device ID to target
- **Spotify API Used**: PUT /me/player/shuffle
- **Returns**: Success status

#### `get-recently-played-tracks`
- **Description**: Get tracks played recently
- **Parameters**: 
  - `limit` (number, optional): Maximum number of tracks (default: 20, max: 50)
  - `after` (number, optional): Return items after this cursor position
  - `before` (number, optional): Return items before this cursor position
- **Spotify API Used**: GET /me/player/recently-played
- **Returns**: Array of play history objects

#### `get-queue`
- **Description**: Get the user's queue
- **Parameters**: None
- **Spotify API Used**: GET /me/player/queue
- **Returns**: Queue object

#### `add-to-queue`
- **Description**: Add an item to the user's playback queue
- **Parameters**: 
  - `uri` (string): Spotify URI of the item to add
  - `deviceId` (string, optional): Device ID to target
- **Spotify API Used**: POST /me/player/queue
- **Returns**: Success status

## Layer 2 Tools (Agentic)

Layer 2 tools combine traditional code execution with LLM capabilities to provide enhanced functionality. These tools build upon Layer 1 primitives and add intelligence through LLM integration.

### Music Analysis Tools

#### `analyze-track-features`
- **Description**: Analyze audio features of a track and provide human-readable insights
- **Parameters**: 
  - `trackId` (string): Spotify track ID
- **Implementation**: Uses Layer 1's `get-audio-features` and `get-track` tools, then enhances the data with LLM analysis
- **Returns**: Detailed analysis of the track's musical characteristics with explanations of what they mean

#### `compare-tracks`
- **Description**: Compare multiple tracks and identify similarities and differences
- **Parameters**: 
  - `trackIds` (array of strings): List of Spotify track IDs to compare
  - `aspectsToCompare` (array of strings, optional): Specific aspects to compare (e.g., "tempo", "energy", "mood")
- **Implementation**: Uses Layer 1's `get-several-tracks` and `get-several-audio-features` tools, then uses LLM to generate comparison
- **Returns**: Detailed comparison highlighting similarities and differences between tracks

#### `identify-key-sections`
- **Description**: Identify and describe key sections of a track (intro, verse, chorus, bridge, etc.)
- **Parameters**: 
  - `trackId` (string): Spotify track ID
- **Implementation**: Uses Layer 1's `get-audio-analysis` tool, then uses LLM to interpret sections
- **Returns**: List of track sections with timestamps and descriptions

### Playlist Generation Tools

#### `generate-playlist`
- **Description**: Generate a playlist based on specified criteria
- **Parameters**: 
  - `name` (string): Name for the playlist
  - `description` (string, optional): Description for the playlist
  - `criteria` (object): Criteria for track selection (seeds, mood, tempo, etc.)
  - `trackCount` (number, optional): Number of tracks to include (default: 20)
  - `public` (boolean, optional): Whether the playlist should be public (default: false)
- **Implementation**: Uses Layer 1's recommendation and playlist tools with LLM to refine selections
- **Returns**: Created playlist object with details

#### `enhance-playlist`
- **Description**: Enhance an existing playlist with additional tracks that fit the theme
- **Parameters**: 
  - `playlistId` (string): Spotify playlist ID
  - `trackCount` (number, optional): Number of tracks to add (default: 5)
  - `preserveOrder` (boolean, optional): Whether to preserve the original order (default: true)
- **Implementation**: Analyzes existing playlist using Layer 1 tools, then uses LLM to identify theme and find matching tracks
- **Returns**: Updated playlist with added tracks

#### `create-playlist-from-text`
- **Description**: Create a playlist based on a text description or theme
- **Parameters**: 
  - `description` (string): Text description of the desired playlist
  - `name` (string, optional): Name for the playlist (if not provided, will be generated)
  - `trackCount` (number, optional): Number of tracks to include (default: 20)
- **Implementation**: Uses LLM to interpret description and identify appropriate search terms and seeds
- **Returns**: Created playlist object with details

#### `reorder-playlist-for-flow`
- **Description**: Reorder tracks in a playlist to create better musical flow
- **Parameters**: 
  - `playlistId` (string): Spotify playlist ID
  - `optimizeFor` (string, optional): Flow optimization strategy (e.g., "energy", "key", "danceability")
- **Implementation**: Analyzes tracks using Layer 1 tools, then uses LLM to determine optimal order
- **Returns**: Reordered playlist with explanation of the new order

### Music Discovery Tools

#### `discover-similar-music`
- **Description**: Discover music similar to provided tracks, artists, or genres with explanations
- **Parameters**: 
  - `seedType` (string): Type of seed ("tracks", "artists", or "genres")
  - `seeds` (array of strings): Spotify IDs or genre names
  - `count` (number, optional): Number of recommendations to return (default: 10)
  - `includeExplanations` (boolean, optional): Whether to include explanations (default: true)
- **Implementation**: Uses Layer 1's recommendation tools with LLM to provide detailed explanations
- **Returns**: List of recommended tracks with explanations of why they were selected

#### `explore-genre`
- **Description**: Explore a music genre with representative tracks and artists
- **Parameters**: 
  - `genre` (string): Genre name to explore
  - `depth` (string, optional): Exploration depth ("overview", "detailed", "comprehensive")
- **Implementation**: Uses Layer 1's search and recommendation tools with LLM to curate results
- **Returns**: Genre overview with representative tracks, artists, and subgenres

#### `find-music-by-mood`
- **Description**: Find music matching a specific mood or emotional state
- **Parameters**: 
  - `mood` (string): Description of the mood (e.g., "relaxing", "energetic", "melancholic")
  - `count` (number, optional): Number of tracks to return (default: 10)
  - `preferredGenres` (array of strings, optional): Preferred genres to focus on
- **Implementation**: Uses LLM to translate mood into audio features, then uses Layer 1 tools to find matches
- **Returns**: List of tracks matching the mood with explanations

#### `discover-trending-music`
- **Description**: Discover trending music with insights on why it's popular
- **Parameters**: 
  - `timeframe` (string, optional): Timeframe to consider ("current", "recent", "emerging")
  - `region` (string, optional): Region to focus on (ISO country code)
  - `genre` (string, optional): Genre to focus on
- **Implementation**: Uses Layer 1's new releases and featured playlists tools with LLM analysis
- **Returns**: List of trending tracks with insights on their popularity

### Artist Analysis Tools

#### `analyze-artist`
- **Description**: Provide comprehensive analysis of an artist's music and style
- **Parameters**: 
  - `artistId` (string): Spotify artist ID
- **Implementation**: Uses multiple Layer 1 artist tools and LLM to synthesize information
- **Returns**: Detailed artist analysis including style, influences, career highlights, and representative tracks

#### `compare-artists`
- **Description**: Compare multiple artists and identify similarities and differences
- **Parameters**: 
  - `artistIds` (array of strings): List of Spotify artist IDs to compare
  - `aspectsToCompare` (array of strings, optional): Specific aspects to compare
- **Implementation**: Uses Layer 1's artist tools with LLM to generate comparison
- **Returns**: Detailed comparison highlighting similarities and differences between artists

#### `find-artist-influences`
- **Description**: Identify potential influences on an artist's music
- **Parameters**: 
  - `artistId` (string): Spotify artist ID
- **Implementation**: Uses Layer 1's artist tools with LLM analysis to identify influences
- **Returns**: List of potential influences with explanations

### User Profile Analysis Tools

#### `analyze-music-taste`
- **Description**: Analyze a user's music taste based on their library and listening history
- **Parameters**: 
  - `timeRange` (string, optional): Time range to analyze ("short_term", "medium_term", "long_term")
  - `includeGenreBreakdown` (boolean, optional): Whether to include genre breakdown (default: true)
  - `includeArtistBreakdown` (boolean, optional): Whether to include artist breakdown (default: true)
  - `includeAudioFeatureAnalysis` (boolean, optional): Whether to include audio feature analysis (default: true)
- **Implementation**: Uses Layer 1's user profile tools with LLM to generate insights
- **Returns**: Comprehensive analysis of the user's music taste with visualizations and insights

#### `generate-taste-profile`
- **Description**: Generate a concise profile of a user's music taste
- **Parameters**: 
  - `format` (string, optional): Format of the profile ("short", "detailed")
- **Implementation**: Uses Layer 1's user profile tools with LLM to generate profile
- **Returns**: Concise description of the user's music taste

#### `identify-listening-patterns`
- **Description**: Identify patterns in a user's listening behavior
- **Parameters**: 
  - `timeRange` (string, optional): Time range to analyze ("short_term", "medium_term", "long_term")
- **Implementation**: Uses Layer 1's recently played tracks and user top items tools with LLM analysis
- **Returns**: Identified patterns in listening behavior (time of day, mood progression, genre cycles, etc.)

### Music Context Tools

#### `get-song-background`
- **Description**: Get background information about a song's creation, meaning, and reception
- **Parameters**: 
  - `trackId` (string): Spotify track ID
- **Implementation**: Uses Layer 1's track tools and enhances with LLM-researched information
- **Returns**: Background information about the song

#### `get-lyrics-analysis`
- **Description**: Analyze lyrics of a song for themes, meaning, and literary devices
- **Parameters**: 
  - `trackId` (string): Spotify track ID
  - `analysisDepth` (string, optional): Depth of analysis ("basic", "detailed", "academic")
- **Implementation**: Retrieves lyrics using external services and analyzes with LLM
- **Returns**: Lyrics analysis with identified themes, meaning, and literary devices

#### `get-historical-context`
- **Description**: Provide historical context for when a track or album was released
- **Parameters**: 
  - `itemId` (string): Spotify track or album ID
  - `itemType` (string): Type of item ("track" or "album")
- **Implementation**: Uses Layer 1's track or album tools and enhances with LLM-researched historical context
- **Returns**: Historical context information

### Data Transformation Tools

#### `generate-playlist-description`
- **Description**: Generate an engaging description for a playlist based on its contents
- **Parameters**: 
  - `playlistId` (string): Spotify playlist ID
  - `style` (string, optional): Style of description ("casual", "professional", "poetic")
- **Implementation**: Analyzes playlist using Layer 1 tools, then uses LLM to generate description
- **Returns**: Generated playlist description

#### `summarize-audio-features`
- **Description**: Summarize audio features of tracks in human-readable format
- **Parameters**: 
  - `trackIds` (array of strings): List of Spotify track IDs
  - `format` (string, optional): Format of summary ("brief", "detailed")
- **Implementation**: Uses Layer 1's audio features tools with LLM to generate summary
- **Returns**: Human-readable summary of audio features

#### `create-shareable-music-report`
- **Description**: Create a shareable report about a user's music taste or a playlist
- **Parameters**: 
  - `reportType` (string): Type of report ("user_taste", "playlist_analysis")
  - `id` (string): User ID or playlist ID depending on report type
  - `format` (string, optional): Format of report ("text", "html", "markdown")
- **Implementation**: Uses appropriate Layer 1 tools and LLM to generate report
- **Returns**: Formatted report ready for sharing

## Layer 3 Tools (Expert)

Layer 3 tools provide high-level, expert-like functionality through LLM orchestration. These tools combine multiple Layer 1 and Layer 2 capabilities to solve complex music-related tasks and provide sophisticated analysis.

### Music Curation Tools

#### `curate-personalized-collection`
- **Description**: Create a comprehensive music collection tailored to a user's preferences
- **Parameters**: 
  - `theme` (string): Theme or purpose of the collection
  - `format` (string): Format of the collection ("playlists", "albums", "artists", "mixed")
  - `size` (string, optional): Size of the collection ("small", "medium", "large")
  - `userPreferences` (object, optional): Specific user preferences to consider
- **Implementation**: Orchestrates multiple Layer 2 tools to analyze user taste and create a cohesive collection
- **Returns**: Comprehensive music collection with explanation of curation decisions

#### `design-music-journey`
- **Description**: Create a sequence of tracks that takes the listener on an emotional or thematic journey
- **Parameters**: 
  - `journeyType` (string): Type of journey ("emotional", "genre-exploration", "artist-evolution", "time-travel")
  - `startPoint` (string): Description of the starting point
  - `endPoint` (string): Description of the ending point
  - `duration` (number, optional): Approximate duration in minutes
- **Implementation**: Uses multiple Layer 2 tools to select and sequence tracks for the journey
- **Returns**: Sequenced playlist with narrative explanation of the journey

#### `create-event-soundtrack`
- **Description**: Create a soundtrack for a specific event or activity
- **Parameters**: 
  - `eventType` (string): Type of event (e.g., "wedding", "workout", "dinner party", "road trip")
  - `duration` (number): Duration of the event in minutes
  - `specificRequirements` (object, optional): Specific requirements for the soundtrack
  - `audienceDescription` (string, optional): Description of the audience
- **Implementation**: Orchestrates multiple Layer 2 tools to create a cohesive soundtrack
- **Returns**: Event soundtrack with sections and explanation

### Music Education Tools

#### `explain-music-concept`
- **Description**: Provide in-depth explanation of a music concept with examples from Spotify
- **Parameters**: 
  - `concept` (string): Music concept to explain (e.g., "syncopation", "modal interchange", "sampling")
  - `expertiseLevel` (string, optional): Target expertise level ("beginner", "intermediate", "advanced")
  - `includeExamples` (boolean, optional): Whether to include Spotify examples (default: true)
- **Implementation**: Uses LLM to generate explanation and Layer 2 tools to find relevant examples
- **Returns**: Comprehensive explanation with Spotify examples

#### `create-learning-playlist`
- **Description**: Create a playlist designed to teach a specific music concept or genre
- **Parameters**: 
  - `topic` (string): Topic to teach (e.g., "jazz harmony", "electronic music evolution", "vocal techniques")
  - `learningLevel` (string, optional): Learning level ("introductory", "intermediate", "advanced")
  - `playlistLength` (number, optional): Number of tracks to include (default: 15)
- **Implementation**: Uses LLM to design curriculum and Layer 2 tools to find appropriate tracks
- **Returns**: Learning playlist with educational notes for each track

#### `analyze-musical-evolution`
- **Description**: Analyze the evolution of an artist, genre, or musical element over time
- **Parameters**: 
  - `subject` (string): Subject to analyze (artist name, genre, or musical element)
  - `subjectType` (string): Type of subject ("artist", "genre", "element")
  - `timeframe` (string, optional): Timeframe to consider (e.g., "1970s-present", "entire career")
  - `aspectsToAnalyze` (array of strings, optional): Specific aspects to analyze
- **Implementation**: Uses multiple Layer 2 tools to gather data and LLM to synthesize analysis
- **Returns**: Comprehensive analysis with timeline, key developments, and representative tracks

### Music Insight Tools

#### `analyze-listening-context`
- **Description**: Analyze how context affects music listening and provide recommendations
- **Parameters**: 
  - `contextType` (string): Type of context ("location", "activity", "mood", "social", "time")
  - `contextDetails` (object): Specific details about the context
- **Implementation**: Uses LLM to analyze context and Layer 2 tools to generate recommendations
- **Returns**: Analysis of how context affects listening experience with tailored recommendations

#### `identify-musical-trends`
- **Description**: Identify and analyze emerging or historical musical trends
- **Parameters**: 
  - `trendScope` (string): Scope of trend analysis ("current", "emerging", "historical", "predicted")
  - `genreFocus` (string, optional): Specific genre to focus on
  - `region` (string, optional): Specific region to focus on
- **Implementation**: Orchestrates multiple Layer 2 tools to gather data and LLM to identify patterns
- **Returns**: Comprehensive trend analysis with examples and insights

#### `analyze-cultural-impact`
- **Description**: Analyze the cultural impact and significance of music
- **Parameters**: 
  - `subject` (string): Subject to analyze (artist, album, track, genre, or movement)
  - `subjectType` (string): Type of subject ("artist", "album", "track", "genre", "movement")
  - `culturalContext` (string, optional): Specific cultural context to consider
- **Implementation**: Uses LLM to research cultural context and Layer 2 tools to find musical examples
- **Returns**: Analysis of cultural impact with supporting evidence and examples

### Music Therapy Tools

#### `design-mood-therapy-session`
- **Description**: Design a music listening session to help with specific mood or emotional needs
- **Parameters**: 
  - `therapeuticGoal` (string): Goal of the session (e.g., "reduce anxiety", "boost energy", "process grief")
  - `duration` (number): Duration of the session in minutes
  - `personalPreferences` (object, optional): User's personal preferences
- **Implementation**: Uses LLM to design therapeutic approach and Layer 2 tools to select appropriate music
- **Returns**: Structured music therapy session with explanation and track sequence

#### `create-mindfulness-soundtrack`
- **Description**: Create a soundtrack for mindfulness or meditation practice
- **Parameters**: 
  - `practiceType` (string): Type of practice (e.g., "meditation", "yoga", "breathwork")
  - `duration` (number): Duration of the practice in minutes
  - `intensity` (string, optional): Intensity level ("gentle", "moderate", "intense")
- **Implementation**: Uses Layer 2 tools to find appropriate tracks and LLM to sequence them
- **Returns**: Mindfulness soundtrack with guidance on how to use it

#### `generate-sleep-program`
- **Description**: Generate a program of music to aid sleep
- **Parameters**: 
  - `sleepIssue` (string, optional): Specific sleep issue to address (e.g., "falling asleep", "staying asleep")
  - `duration` (number): Duration of the program in minutes
  - `includeGuidance` (boolean, optional): Whether to include usage guidance (default: true)
- **Implementation**: Uses Layer 2 tools to find appropriate tracks and LLM to sequence them
- **Returns**: Sleep program with guidance on how to use it

### Creative Music Tools

#### `generate-music-story`
- **Description**: Generate a narrative story based on a playlist or album
- **Parameters**: 
  - `sourceType` (string): Type of source ("playlist", "album")
  - `sourceId` (string): Spotify ID of the source
  - `storyStyle` (string, optional): Style of the story (e.g., "adventure", "romance", "mystery")
- **Implementation**: Uses Layer 2 tools to analyze the music and LLM to generate a story
- **Returns**: Narrative story inspired by the music

#### `create-character-playlist`
- **Description**: Create a playlist that represents a fictional or real character
- **Parameters**: 
  - `character` (string): Name or description of the character
  - `mediaSource` (string, optional): Source media (e.g., "Game of Thrones", "historical figure")
  - `playlistLength` (number, optional): Number of tracks to include (default: 15)
- **Implementation**: Uses LLM to analyze character and Layer 2 tools to select appropriate tracks
- **Returns**: Character playlist with explanation of track selections

#### `soundtrack-visual-art`
- **Description**: Create a musical soundtrack for a piece of visual art
- **Parameters**: 
  - `artDescription` (string): Description of the visual art
  - `artStyle` (string, optional): Style of the art
  - `soundtrackDuration` (number, optional): Duration of the soundtrack in minutes
- **Implementation**: Uses LLM to interpret visual art and Layer 2 tools to select appropriate music
- **Returns**: Musical soundtrack with explanation of how it relates to the visual art

### Collaborative Music Tools

#### `analyze-group-taste`
- **Description**: Analyze music taste of a group and identify common ground
- **Parameters**: 
  - `userIds` (array of strings): List of Spotify user IDs
  - `analysisDepth` (string, optional): Depth of analysis ("basic", "detailed")
- **Implementation**: Uses Layer 2 tools to analyze individual tastes and LLM to find patterns
- **Returns**: Group taste analysis with common interests and recommendations

#### `create-collaborative-playlist`
- **Description**: Create a playlist that appeals to a diverse group of listeners
- **Parameters**: 
  - `userIds` (array of strings): List of Spotify user IDs
  - `playlistName` (string, optional): Name for the playlist
  - `playlistLength` (number, optional): Number of tracks to include (default: 20)
  - `balancingStrategy` (string, optional): Strategy for balancing diverse tastes
- **Implementation**: Uses Layer 2 tools to analyze individual tastes and select tracks that bridge gaps
- **Returns**: Collaborative playlist with explanation of selection strategy

#### `design-music-sharing-experience`
- **Description**: Design a structured music sharing experience for a group
- **Parameters**: 
  - `groupSize` (number): Number of participants
  - `experienceType` (string): Type of experience (e.g., "discovery", "nostalgia", "debate")
  - `duration` (number): Duration of the experience in minutes
- **Implementation**: Uses LLM to design experience structure and Layer 2 tools to find example tracks
- **Returns**: Structured music sharing experience with activities and track suggestions

### Music Production Tools

#### `analyze-production-techniques`
- **Description**: Analyze production techniques used in a track or album
- **Parameters**: 
  - `itemId` (string): Spotify track or album ID
  - `itemType` (string): Type of item ("track" or "album")
  - `aspectsToAnalyze` (array of strings, optional): Specific aspects to analyze
- **Implementation**: Uses Layer 2 tools to analyze audio features and LLM to identify techniques
- **Returns**: Detailed analysis of production techniques with explanations

#### `suggest-reference-tracks`
- **Description**: Suggest reference tracks for music production based on a description
- **Parameters**: 
  - `productionGoal` (string): Description of the production goal
  - `elements` (array of strings, optional): Specific elements to find references for
  - `count` (number, optional): Number of reference tracks to suggest (default: 5)
- **Implementation**: Uses LLM to interpret production goal and Layer 2 tools to find references
- **Returns**: Curated list of reference tracks with explanations of relevant elements

#### `create-sample-palette`
- **Description**: Create a palette of tracks that could be sampled for a production
- **Parameters**: 
  - `genre` (string): Target genre for the production
  - `mood` (string, optional): Target mood for the production
  - `era` (string, optional): Preferred era for samples
  - `elementTypes` (array of strings, optional): Types of elements to sample (e.g., "drums", "bass", "vocals")
- **Implementation**: Uses Layer 2 tools to find appropriate tracks and LLM to explain sampling potential
- **Returns**: Palette of tracks with suggestions for sampling specific elements

## Integration and Workflow

The layered architecture of Spotify AIPI tools enables powerful workflows by combining tools across layers:

1. **Layer 1** tools provide direct access to Spotify API data
2. **Layer 2** tools add intelligence by combining code execution with LLM capabilities
3. **Layer 3** tools orchestrate complex workflows by combining multiple Layer 1 and Layer 2 tools

This design allows for both simple, direct operations and sophisticated, intelligent music interactions within a unified framework.

## Authentication and Rate Limiting

All tools respect Spotify API authentication requirements and rate limits. Layer 1 tools handle these concerns directly, while Layer 2 and Layer 3 tools inherit these protections through their use of Layer 1 primitives.

## Error Handling

Each layer implements appropriate error handling:

1. **Layer 1**: Provides detailed error information from the Spotify API
2. **Layer 2**: Adds intelligent fallback options and suggestions when operations fail
3. **Layer 3**: Implements sophisticated error recovery strategies and alternative approaches

## Conclusion

The Spotify AIPI Tools provide a comprehensive framework for interacting with the Spotify API at multiple levels of abstraction. From simple data retrieval to complex music curation and analysis, these tools enable a wide range of music discovery, management, and analysis capabilities. 