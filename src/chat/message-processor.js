/**
 * Message Processor for Music AIPI
 * 
 * Processes user messages and returns responses for the web client.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { OpenAI } = require('openai');
const spotifyClient = require('../utils/spotifyClient');
const lastfmClient = require('../utils/lastfmClient');
const { registerLastfmDiscoveryTools } = require('../layer2/lastfmDiscoveryTools');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Create a mock server for the Last.fm discovery tools
const mockServer = {
  tools: {},
  registerTool: function(tool) {
    this.tools[tool.name] = tool;
  }
};

// Register the Last.fm discovery tools
registerLastfmDiscoveryTools(mockServer);

// Chat history for context (stored per user in a real implementation)
const chatHistory = [];

/**
 * Process a user message and return a response
 * @param {string} userInput - The user's message
 * @returns {Promise<string>} - The assistant's response
 */
async function processUserMessage(userInput) {
  logger.info(`Processing user message: ${userInput}`);
  
  // Add user message to chat history
  chatHistory.push({
    role: 'user',
    content: userInput
  });
  
  try {
    // Use OpenAI to determine the user's intent
    const intent = await determineUserIntent(userInput);
    let response = '';
    
    // Execute the appropriate action based on the intent
    switch (intent.action) {
      case 'search_tracks':
        response = await handleSearchTracks(intent.parameters);
        break;
      case 'discover_similar_tracks':
        response = await handleDiscoverSimilarTracks(intent.parameters);
        break;
      case 'discover_similar_artists':
        response = await handleDiscoverSimilarArtists(intent.parameters);
        break;
      case 'discover_by_tag':
        response = await handleDiscoverByTag(intent.parameters);
        break;
      case 'get_track_audio_features':
        response = await handleGetTrackAudioFeatures(intent.parameters);
        break;
      case 'get_artist_info':
        response = await handleGetArtistInfo(intent.parameters);
        break;
      case 'general_question':
        response = await handleGeneralQuestion(userInput);
        break;
      default:
        response = await handleGeneralQuestion(userInput);
    }
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: response
    });
    
    return response;
  } catch (error) {
    // Handle errors gracefully
    const errorResponse = `i'm sorry, i encountered an error while processing your request: ${error.message}. could you try rephrasing or asking something else?`;
    logger.error(`Error processing message: ${error.message}`);
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: errorResponse
    });
    
    return errorResponse;
  }
}

/**
 * Determine the user's intent using OpenAI
 * @param {string} userInput - The user's input
 * @returns {Object} - The determined intent and parameters
 */
async function determineUserIntent(userInput) {
  const prompt = `
You are a music discovery assistant. Analyze the following user request and determine the appropriate action to take.
User request: "${userInput}"

Respond with a JSON object containing the action and parameters. Choose from these actions:
1. search_tracks - Search for tracks by name
2. discover_similar_tracks - Find tracks similar to a specified track
3. discover_similar_artists - Find artists similar to a specified artist
4. discover_by_tag - Find tracks or artists by genre/tag
5. get_track_audio_features - Get audio features for a track
6. get_artist_info - Get information about an artist
7. general_question - Answer a general music-related question

Example response for "Find songs like Bohemian Rhapsody":
{
  "action": "discover_similar_tracks",
  "parameters": {
    "trackName": "Bohemian Rhapsody",
    "artistName": "Queen"
  }
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 150
  });

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    logger.error(`Error parsing intent: ${error.message}`);
    return { action: "general_question" };
  }
}

/**
 * Handle search tracks intent
 * @param {Object} parameters - The parameters for the search
 * @returns {Promise<string>} - The formatted response
 */
async function handleSearchTracks(parameters) {
  const { trackName, artistName } = parameters;
  const query = artistName ? `${trackName} artist:${artistName}` : trackName;
  
  const searchResults = await spotifyClient.searchTracks(query, 5);
  
  if (searchResults.length === 0) {
    return `i couldn't find any tracks matching "${query}". could you try a different search?`;
  }
  
  let response = `here are some tracks matching your search:\n\n`;
  
  searchResults.forEach((track, index) => {
    response += `${index + 1}. **${track.name}** by ${track.artists.map(a => a.name).join(', ')}\n`;
    response += `   [Listen on Spotify](${track.external_urls.spotify})\n\n`;
  });
  
  return response;
}

/**
 * Handle discover similar tracks intent
 * @param {Object} parameters - The parameters for the discovery
 * @returns {Promise<string>} - The formatted response
 */
async function handleDiscoverSimilarTracks(parameters) {
  const { trackName, artistName } = parameters;
  
  // First, search for the track to get its ID
  const query = artistName ? `${trackName} artist:${artistName}` : trackName;
  const searchResults = await spotifyClient.searchTracks(query, 1);
  
  if (searchResults.length === 0) {
    return `i couldn't find the track "${trackName}" ${artistName ? `by ${artistName}` : ''}. could you check the spelling and try again?`;
  }
  
  const trackId = searchResults[0].id;
  const similarTracks = await spotifyClient.getRecommendations({ seed_tracks: [trackId] }, 5);
  
  if (similarTracks.length === 0) {
    return `i couldn't find any similar tracks to "${trackName}". could you try a different track?`;
  }
  
  let response = `here are some tracks similar to "${trackName}" ${artistName ? `by ${artistName}` : ''}:\n\n`;
  
  similarTracks.forEach((track, index) => {
    response += `${index + 1}. **${track.name}** by ${track.artists.map(a => a.name).join(', ')}\n`;
    response += `   [Listen on Spotify](${track.external_urls.spotify})\n\n`;
  });
  
  return response;
}

/**
 * Handle discover similar artists intent
 * @param {Object} parameters - The parameters for the discovery
 * @returns {Promise<string>} - The formatted response
 */
async function handleDiscoverSimilarArtists(parameters) {
  const { artistName } = parameters;
  
  // First, search for the artist to get its ID
  const searchResults = await spotifyClient.searchArtists(artistName, 1);
  
  if (searchResults.length === 0) {
    return `i couldn't find the artist "${artistName}". could you check the spelling and try again?`;
  }
  
  const artistId = searchResults[0].id;
  const similarArtists = await spotifyClient.getRelatedArtists(artistId);
  
  if (similarArtists.length === 0) {
    return `i couldn't find any similar artists to "${artistName}". could you try a different artist?`;
  }
  
  let response = `here are some artists similar to ${artistName}:\n\n`;
  
  similarArtists.slice(0, 5).forEach((artist, index) => {
    response += `${index + 1}. **${artist.name}**\n`;
    response += `   [Check on Spotify](${artist.external_urls.spotify})\n\n`;
  });
  
  return response;
}

/**
 * Handle discover by tag intent
 * @param {Object} parameters - The parameters for the discovery
 * @returns {Promise<string>} - The formatted response
 */
async function handleDiscoverByTag(parameters) {
  const { tag } = parameters;
  
  try {
    const topTracks = await mockServer.tools['get-top-tracks-by-tag'].execute({ tag, limit: 5 });
    
    if (!topTracks || topTracks.length === 0) {
      return `i couldn't find any tracks for the tag "${tag}". could you try a different genre or tag?`;
    }
    
    let response = `here are some top tracks in the "${tag}" genre:\n\n`;
    
    topTracks.forEach((track, index) => {
      response += `${index + 1}. **${track.name}** by ${track.artist}\n`;
      if (track.url) {
        response += `   [More info](${track.url})\n\n`;
      }
    });
    
    return response;
  } catch (error) {
    return `i had trouble finding tracks for the "${tag}" genre. could you try a different genre?`;
  }
}

/**
 * Handle get track audio features intent
 * @param {Object} parameters - The parameters for the request
 * @returns {Promise<string>} - The formatted response
 */
async function handleGetTrackAudioFeatures(parameters) {
  const { trackName, artistName } = parameters;
  
  // First, search for the track to get its ID
  const query = artistName ? `${trackName} artist:${artistName}` : trackName;
  const searchResults = await spotifyClient.searchTracks(query, 1);
  
  if (searchResults.length === 0) {
    return `i couldn't find the track "${trackName}" ${artistName ? `by ${artistName}` : ''}. could you check the spelling and try again?`;
  }
  
  const track = searchResults[0];
  const features = await spotifyClient.getAudioFeatures(track.id);
  
  if (!features) {
    return `i couldn't get audio features for "${trackName}". could you try a different track?`;
  }
  
  const interpretation = interpretAudioFeatures(features);
  
  let response = `here's an analysis of "${track.name}" by ${track.artists.map(a => a.name).join(', ')}:\n\n`;
  
  response += `**tempo**: ${Math.round(features.tempo)} BPM\n`;
  response += `**key**: ${getKeyName(features.key)} ${features.mode === 1 ? 'Major' : 'Minor'}\n`;
  response += `**time signature**: ${features.time_signature}/4\n\n`;
  
  response += `**energy**: ${Math.round(features.energy * 100)}% - ${interpretation.energy}\n`;
  response += `**danceability**: ${Math.round(features.danceability * 100)}% - ${interpretation.danceability}\n`;
  response += `**valence (positivity)**: ${Math.round(features.valence * 100)}% - ${interpretation.valence}\n`;
  response += `**acousticness**: ${Math.round(features.acousticness * 100)}% - ${interpretation.acousticness}\n`;
  response += `**instrumentalness**: ${Math.round(features.instrumentalness * 100)}% - ${interpretation.instrumentalness}\n`;
  response += `**liveness**: ${Math.round(features.liveness * 100)}% - ${interpretation.liveness}\n`;
  response += `**speechiness**: ${Math.round(features.speechiness * 100)}% - ${interpretation.speechiness}\n`;
  
  return response;
}

/**
 * Handle get artist info intent
 * @param {Object} parameters - The parameters for the request
 * @returns {Promise<string>} - The formatted response
 */
async function handleGetArtistInfo(parameters) {
  const { artistName } = parameters;
  
  // Search for the artist on Spotify
  const searchResults = await spotifyClient.searchArtists(artistName, 1);
  
  if (searchResults.length === 0) {
    return `i couldn't find information about "${artistName}". could you check the spelling and try again?`;
  }
  
  const artist = searchResults[0];
  
  // Get additional info from Last.fm if available
  let lastfmInfo = null;
  try {
    lastfmInfo = await mockServer.tools['get-artist-info'].execute({ artist: artistName });
  } catch (error) {
    // Continue without Last.fm info
  }
  
  let response = `**${artist.name}**\n\n`;
  
  if (artist.genres && artist.genres.length > 0) {
    response += `**genres**: ${artist.genres.join(', ')}\n`;
  }
  
  response += `**popularity**: ${artist.popularity}/100\n\n`;
  
  if (lastfmInfo && lastfmInfo.bio && lastfmInfo.bio.summary) {
    // Clean up the Last.fm bio (remove HTML tags and links)
    let bio = lastfmInfo.bio.summary
      .replace(/<[^>]*>/g, '')
      .replace(/Read more on Last\.fm.*$/, '');
    
    response += `${bio}\n\n`;
  }
  
  response += `[Check on Spotify](${artist.external_urls.spotify})\n\n`;
  
  // Get top tracks
  try {
    const topTracks = await spotifyClient.getArtistTopTracks(artist.id);
    
    if (topTracks && topTracks.length > 0) {
      response += `**top tracks**:\n`;
      topTracks.slice(0, 5).forEach((track, index) => {
        response += `${index + 1}. [${track.name}](${track.external_urls.spotify})\n`;
      });
    }
  } catch (error) {
    // Continue without top tracks
  }
  
  return response;
}

/**
 * Handle general music-related questions
 * @param {string} question - The user's question
 * @returns {Promise<string>} - The formatted response
 */
async function handleGeneralQuestion(question) {
  const prompt = `
You are a knowledgeable music assistant. Answer the following music-related question in a helpful, conversational way.
Keep your answer concise and focused on music. If the question is not about music, politely explain that you focus on music topics.

Question: "${question}"

Your response:
`;

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      ...chatHistory.slice(-5), // Include recent chat history for context
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 300
  });

  return response.choices[0].message.content;
}

/**
 * Get the name of a musical key from its numeric representation
 * @param {number} key - The numeric key value (0-11)
 * @returns {string} - The name of the key
 */
function getKeyName(key) {
  const keyNames = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
  return key >= 0 && key < 12 ? keyNames[key] : 'Unknown';
}

/**
 * Interpret audio features in human-readable terms
 * @param {Object} features - The audio features object
 * @returns {Object} - Human-readable interpretations
 */
function interpretAudioFeatures(features) {
  return {
    energy: features.energy < 0.33 ? 'low energy, calm' : features.energy < 0.66 ? 'moderate energy' : 'high energy, intense',
    danceability: features.danceability < 0.33 ? 'not very danceable' : features.danceability < 0.66 ? 'moderately danceable' : 'very danceable',
    valence: features.valence < 0.33 ? 'negative/sad mood' : features.valence < 0.66 ? 'neutral mood' : 'positive/happy mood',
    acousticness: features.acousticness < 0.33 ? 'mostly electronic' : features.acousticness < 0.66 ? 'mix of acoustic and electronic' : 'mostly acoustic',
    instrumentalness: features.instrumentalness < 0.5 ? 'vocal-focused' : 'instrumental',
    liveness: features.liveness < 0.5 ? 'studio recording' : 'live performance elements',
    speechiness: features.speechiness < 0.33 ? 'music, not speech' : features.speechiness < 0.66 ? 'music and speech' : 'speech-heavy'
  };
}

module.exports = {
  processUserMessage
}; 