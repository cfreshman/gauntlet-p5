/**
 * Music Discovery Chat
 * 
 * An interactive chat interface for discovering music using natural language.
 * Leverages Spotify and Last.fm APIs along with OpenAI for natural language understanding.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const readline = require('readline');
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

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Chat history for context
const chatHistory = [];

/**
 * Start the chat interface
 */
function startChat() {
  console.log('\n🎵 Welcome to Music Discovery Chat! 🎵');
  console.log('Ask me anything about music, and I\'ll help you discover new tracks, artists, and more.');
  console.log('For example:');
  console.log('- "Find songs similar to Viva La Vida by Coldplay"');
  console.log('- "What are some good indie rock tracks?"');
  console.log('- "Tell me about the artist Radiohead"');
  console.log('- "What are the audio features of Bohemian Rhapsody?"');
  console.log('- "Recommend artists similar to The Beatles"');
  console.log('- "Exit" to quit the chat');
  
  // Add system message to chat history
  chatHistory.push({
    role: 'system',
    content: `You are a helpful music discovery assistant that uses Spotify and Last.fm APIs to provide information and recommendations.
    You can search for tracks, find similar songs, discover artists, analyze audio features, and more.
    Always respond in a conversational, friendly manner. If you can't find information, apologize and suggest alternatives.
    Current date: ${new Date().toLocaleDateString()}`
  });
  
  askQuestion();
}

/**
 * Ask the user for input
 */
function askQuestion() {
  rl.question('\n🎧 You: ', async (userInput) => {
    if (userInput.toLowerCase() === 'exit') {
      console.log('\n🎵 Thank you for using Music Discovery Chat! Goodbye! 🎵');
      rl.close();
      return;
    }
    
    // Add user message to chat history
    chatHistory.push({
      role: 'user',
      content: userInput
    });
    
    try {
      // Process the user's request
      await processUserRequest(userInput);
    } catch (error) {
      console.log(`\n🤖 Assistant: I'm sorry, I encountered an error: ${error.message}`);
      logger.error('Error processing user request:', error);
    }
    
    // Continue the conversation
    askQuestion();
  });
}

/**
 * Process the user's request using OpenAI to determine intent
 * @param {string} userInput - The user's input
 */
async function processUserRequest(userInput) {
  console.log('\n🤖 Assistant: Thinking...');
  
  try {
    // Use OpenAI to determine the user's intent
    const intent = await determineUserIntent(userInput);
    
    // Execute the appropriate action based on the intent
    switch (intent.action) {
      case 'search_tracks':
        await handleSearchTracks(intent.parameters);
        break;
      case 'discover_similar_tracks':
        await handleDiscoverSimilarTracks(intent.parameters);
        break;
      case 'discover_similar_artists':
        await handleDiscoverSimilarArtists(intent.parameters);
        break;
      case 'discover_by_tag':
        await handleDiscoverByTag(intent.parameters);
        break;
      case 'get_track_audio_features':
        await handleGetTrackAudioFeatures(intent.parameters);
        break;
      case 'get_artist_info':
        await handleGetArtistInfo(intent.parameters);
        break;
      case 'general_question':
        await handleGeneralQuestion(userInput);
        break;
      default:
        await handleGeneralQuestion(userInput);
    }
  } catch (error) {
    // Handle errors gracefully
    const errorResponse = `I'm sorry, I encountered an error while processing your request: ${error.message}. Could you try rephrasing or asking something else?`;
    console.log(`\n🤖 Assistant: ${errorResponse}`);
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: errorResponse
    });
  }
}

/**
 * Determine the user's intent using OpenAI
 * @param {string} userInput - The user's input
 * @returns {Object} - The determined intent and parameters
 */
async function determineUserIntent(userInput) {
  const prompt = `
    Analyze the following user request related to music discovery and determine the most appropriate action to take.
    Return a JSON object with the action and parameters.
    
    Possible actions:
    1. search_tracks - Search for tracks on Spotify
    2. discover_similar_tracks - Find tracks similar to a specified track using Last.fm
    3. discover_similar_artists - Find artists similar to a specified artist using Last.fm
    4. discover_by_tag - Find top tracks for a specified tag/genre using Last.fm
    5. get_track_audio_features - Get audio features for a track on Spotify
    6. get_artist_info - Get information about an artist
    7. general_question - Answer a general question about music
    
    User request: "${userInput}"
    
    Response format:
    {
      "action": "action_name",
      "parameters": {
        // Parameters specific to the action
        // For search_tracks: query, limit (optional)
        // For discover_similar_tracks: trackName, artistName, limit (optional)
        // For discover_similar_artists: artistName, limit (optional), includeTopTracks (optional)
        // For discover_by_tag: tag, limit (optional)
        // For get_track_audio_features: trackName, artistName
        // For get_artist_info: artistName
        // For general_question: no parameters needed
      },
      "explanation": "Brief explanation of why this action was chosen"
    }
  `;
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a helpful assistant that analyzes user requests related to music discovery.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' }
  });
  
  const result = JSON.parse(response.choices[0].message.content);
  logger.debug('Determined intent:', result);
  
  return result;
}

/**
 * Handle search tracks request
 * @param {Object} parameters - The parameters for the search
 */
async function handleSearchTracks(parameters) {
  const { query, limit = 5 } = parameters;
  
  try {
    console.log(`\n🤖 Assistant: Searching for "${query}" on Spotify...`);
    
    const results = await spotifyClient.search(query, ['track'], limit);
    
    if (!results.tracks || results.tracks.items.length === 0) {
      const response = `I couldn't find any tracks matching "${query}" on Spotify. Could you try a different search term?`;
      console.log(`\n🤖 Assistant: ${response}`);
      
      // Add assistant response to chat history
      chatHistory.push({
        role: 'assistant',
        content: response
      });
      
      return;
    }
    
    // Format the results
    let responseText = `I found ${results.tracks.items.length} tracks matching "${query}":\n\n`;
    
    results.tracks.items.forEach((track, index) => {
      const artists = track.artists.map(a => a.name).join(', ');
      responseText += `${index + 1}. "${track.name}" by ${artists}\n`;
      responseText += `   Album: ${track.album.name}\n`;
      responseText += `   Spotify ID: ${track.id}\n`;
      responseText += `   Spotify URL: ${track.external_urls.spotify}\n\n`;
    });
    
    responseText += `Would you like to know more about any of these tracks or find similar songs?`;
    
    console.log(`\n🤖 Assistant: ${responseText}`);
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: responseText
    });
  } catch (error) {
    throw new Error(`Error searching for tracks: ${error.message}`);
  }
}

/**
 * Handle discover similar tracks request
 * @param {Object} parameters - The parameters for the discovery
 */
async function handleDiscoverSimilarTracks(parameters) {
  const { trackName, artistName, limit = 5 } = parameters;
  
  try {
    console.log(`\n🤖 Assistant: Finding tracks similar to "${trackName}" by ${artistName} using Last.fm...`);
    
    const discoverSimilarTracks = mockServer.tools['discover-similar-tracks'].handler;
    const result = await discoverSimilarTracks({
      trackName,
      artistName,
      limit,
      findOnSpotify: true
    });
    
    // Format the results
    let responseText = `Here are ${result.similarTracks.length} tracks similar to "${trackName}" by ${artistName}:\n\n`;
    
    result.similarTracks.forEach((track, index) => {
      responseText += `${index + 1}. "${track.name}" by ${track.artist}\n`;
      responseText += `   Match: ${track.match.toFixed(1)}%\n`;
      
      if (track.spotify) {
        responseText += `   Spotify: ${track.spotify.externalUrl}\n`;
      }
      
      responseText += '\n';
    });
    
    // Add insights
    if (result.insights.topArtists && result.insights.topArtists.length > 0) {
      responseText += 'Top artists in these recommendations:\n';
      result.insights.topArtists.slice(0, 3).forEach((artist, index) => {
        responseText += `- ${artist.name} (${artist.count} tracks)\n`;
      });
      responseText += '\n';
    }
    
    responseText += `Would you like to explore any of these artists further or get more recommendations?`;
    
    console.log(`\n🤖 Assistant: ${responseText}`);
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: responseText
    });
  } catch (error) {
    throw new Error(`Error discovering similar tracks: ${error.message}`);
  }
}

/**
 * Handle discover similar artists request
 * @param {Object} parameters - The parameters for the discovery
 */
async function handleDiscoverSimilarArtists(parameters) {
  const { artistName, limit = 5, includeTopTracks = true } = parameters;
  
  try {
    console.log(`\n🤖 Assistant: Finding artists similar to ${artistName} using Last.fm...`);
    
    const discoverSimilarArtists = mockServer.tools['discover-similar-artists'].handler;
    const result = await discoverSimilarArtists({
      artistName,
      limit,
      includeTopTracks
    });
    
    // Format the results
    let responseText = `Here are ${result.similarArtists.length} artists similar to ${artistName}:\n\n`;
    
    result.similarArtists.forEach((artist, index) => {
      responseText += `${index + 1}. ${artist.name} (${artist.match.toFixed(1)}% match)\n`;
      
      if (artist.topTracks && artist.topTracks.length > 0) {
        responseText += `   Top tracks:\n`;
        artist.topTracks.slice(0, 3).forEach((track, trackIndex) => {
          responseText += `   - ${track.name}\n`;
        });
      }
      
      responseText += '\n';
    });
    
    responseText += `Would you like to know more about any of these artists or explore their music further?`;
    
    console.log(`\n🤖 Assistant: ${responseText}`);
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: responseText
    });
  } catch (error) {
    throw new Error(`Error discovering similar artists: ${error.message}`);
  }
}

/**
 * Handle discover by tag request
 * @param {Object} parameters - The parameters for the discovery
 */
async function handleDiscoverByTag(parameters) {
  const { tag, limit = 5 } = parameters;
  
  try {
    console.log(`\n🤖 Assistant: Finding top tracks for the "${tag}" genre/tag using Last.fm...`);
    
    const discoverByTag = mockServer.tools['discover-by-tag'].handler;
    const result = await discoverByTag({
      tag,
      limit,
      findOnSpotify: true
    });
    
    // Format the results
    let responseText = `Here are ${result.tracks.length} top tracks for the "${tag}" genre/tag:\n\n`;
    
    result.tracks.forEach((track, index) => {
      responseText += `${index + 1}. "${track.name}" by ${track.artist}\n`;
      
      if (track.spotify) {
        responseText += `   Spotify: ${track.spotify.externalUrl}\n`;
      }
      
      responseText += '\n';
    });
    
    // Add insights
    if (result.insights.topArtists && result.insights.topArtists.length > 0) {
      responseText += 'Top artists in this genre:\n';
      result.insights.topArtists.slice(0, 3).forEach((artist, index) => {
        responseText += `- ${artist.name} (${artist.count} tracks)\n`;
      });
      responseText += '\n';
    }
    
    responseText += `Would you like to explore any of these artists further or discover more genres?`;
    
    console.log(`\n🤖 Assistant: ${responseText}`);
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: responseText
    });
  } catch (error) {
    throw new Error(`Error discovering tracks by tag: ${error.message}`);
  }
}

/**
 * Handle get track audio features request
 * @param {Object} parameters - The parameters for the request
 */
async function handleGetTrackAudioFeatures(parameters) {
  const { trackName, artistName } = parameters;
  
  try {
    console.log(`\n🤖 Assistant: Getting audio features for "${trackName}" by ${artistName}...`);
    
    // First, search for the track to get its ID
    const searchResults = await spotifyClient.search(`track:${trackName} artist:${artistName}`, ['track'], 1);
    
    if (!searchResults.tracks || searchResults.tracks.items.length === 0) {
      const response = `I couldn't find the track "${trackName}" by ${artistName} on Spotify. Could you check the spelling or try a different track?`;
      console.log(`\n🤖 Assistant: ${response}`);
      
      // Add assistant response to chat history
      chatHistory.push({
        role: 'assistant',
        content: response
      });
      
      return;
    }
    
    const track = searchResults.tracks.items[0];
    const trackId = track.id;
    
    // Get the audio features
    const audioFeatures = await spotifyClient.getAudioFeatures(trackId);
    
    // Format the results
    let responseText = `Here are the audio features for "${track.name}" by ${track.artists.map(a => a.name).join(', ')}:\n\n`;
    
    responseText += `🎹 Key: ${getKeyName(audioFeatures.key)} ${audioFeatures.mode === 1 ? 'Major' : 'Minor'}\n`;
    responseText += `⏱️ Tempo: ${audioFeatures.tempo.toFixed(1)} BPM\n`;
    responseText += `🔊 Loudness: ${audioFeatures.loudness.toFixed(1)} dB\n`;
    responseText += `💃 Danceability: ${(audioFeatures.danceability * 100).toFixed(1)}%\n`;
    responseText += `⚡ Energy: ${(audioFeatures.energy * 100).toFixed(1)}%\n`;
    responseText += `🎻 Acousticness: ${(audioFeatures.acousticness * 100).toFixed(1)}%\n`;
    responseText += `🎸 Instrumentalness: ${(audioFeatures.instrumentalness * 100).toFixed(1)}%\n`;
    responseText += `🎤 Speechiness: ${(audioFeatures.speechiness * 100).toFixed(1)}%\n`;
    responseText += `😊 Valence (positivity): ${(audioFeatures.valence * 100).toFixed(1)}%\n`;
    responseText += `🏟️ Liveness: ${(audioFeatures.liveness * 100).toFixed(1)}%\n`;
    responseText += `🎵 Time Signature: ${audioFeatures.time_signature}/4\n\n`;
    
    // Add interpretation
    responseText += interpretAudioFeatures(audioFeatures);
    
    responseText += `\nWould you like to find similar tracks or explore more by ${track.artists[0].name}?`;
    
    console.log(`\n🤖 Assistant: ${responseText}`);
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: responseText
    });
  } catch (error) {
    throw new Error(`Error getting track audio features: ${error.message}`);
  }
}

/**
 * Handle get artist info request
 * @param {Object} parameters - The parameters for the request
 */
async function handleGetArtistInfo(parameters) {
  const { artistName } = parameters;
  
  try {
    console.log(`\n🤖 Assistant: Getting information about ${artistName}...`);
    
    // Get artist info from Last.fm
    const artistInfo = await lastfmClient.getArtistInfo(artistName);
    
    if (!artistInfo.artist) {
      const response = `I couldn't find information about ${artistName} on Last.fm. Could you check the spelling or try a different artist?`;
      console.log(`\n🤖 Assistant: ${response}`);
      
      // Add assistant response to chat history
      chatHistory.push({
        role: 'assistant',
        content: response
      });
      
      return;
    }
    
    // Format the results
    let responseText = `Here's what I found about ${artistInfo.artist.name}:\n\n`;
    
    // Add bio (truncated to avoid very long responses)
    if (artistInfo.artist.bio && artistInfo.artist.bio.content) {
      const bio = artistInfo.artist.bio.content
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .split('. ')
        .slice(0, 5)
        .join('. ') + '.';
      
      responseText += `${bio}\n\n`;
    }
    
    // Add tags/genres
    if (artistInfo.artist.tags && artistInfo.artist.tags.tag) {
      responseText += 'Genres/Tags: ';
      responseText += artistInfo.artist.tags.tag.map(tag => tag.name).join(', ');
      responseText += '\n\n';
    }
    
    // Add similar artists
    if (artistInfo.artist.similar && artistInfo.artist.similar.artist) {
      responseText += 'Similar Artists: ';
      responseText += artistInfo.artist.similar.artist.map(artist => artist.name).join(', ');
      responseText += '\n\n';
    }
    
    // Add stats
    if (artistInfo.artist.stats) {
      responseText += `Listeners: ${parseInt(artistInfo.artist.stats.listeners).toLocaleString()}\n`;
      responseText += `Playcount: ${parseInt(artistInfo.artist.stats.playcount).toLocaleString()}\n\n`;
    }
    
    responseText += `Would you like to discover similar artists or explore top tracks by ${artistInfo.artist.name}?`;
    
    console.log(`\n🤖 Assistant: ${responseText}`);
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: responseText
    });
  } catch (error) {
    throw new Error(`Error getting artist info: ${error.message}`);
  }
}

/**
 * Handle general question about music
 * @param {string} question - The user's question
 */
async function handleGeneralQuestion(question) {
  try {
    // Create messages array from chat history
    const messages = [...chatHistory];
    
    // Add the current question if it's not already in the history
    if (messages[messages.length - 1].role !== 'user' || messages[messages.length - 1].content !== question) {
      messages.push({
        role: 'user',
        content: question
      });
    }
    
    // Get response from OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 500
    });
    
    const responseText = response.choices[0].message.content;
    console.log(`\n🤖 Assistant: ${responseText}`);
    
    // Add assistant response to chat history
    chatHistory.push({
      role: 'assistant',
      content: responseText
    });
  } catch (error) {
    throw new Error(`Error answering question: ${error.message}`);
  }
}

/**
 * Get key name from key number
 * @param {number} key - Key number (0-11)
 * @returns {string} - Key name
 */
function getKeyName(key) {
  const keyNames = ["C", "C♯/D♭", "D", "D♯/E♭", "E", "F", "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B"];
  return key >= 0 && key < keyNames.length ? keyNames[key] : "Unknown";
}

/**
 * Interpret audio features to provide human-readable insights
 * @param {Object} features - The audio features
 * @returns {string} - Interpretation text
 */
function interpretAudioFeatures(features) {
  let interpretation = 'In summary, this track ';
  
  // Interpret energy and valence (mood)
  if (features.energy > 0.8 && features.valence > 0.8) {
    interpretation += 'is very energetic and positive, perfect for uplifting moments. ';
  } else if (features.energy > 0.8 && features.valence < 0.3) {
    interpretation += 'has high energy but a darker mood, good for intense or aggressive scenarios. ';
  } else if (features.energy < 0.3 && features.valence > 0.8) {
    interpretation += 'is calm and positive, ideal for relaxed, happy moments. ';
  } else if (features.energy < 0.3 && features.valence < 0.3) {
    interpretation += 'is calm and melancholic, suitable for introspective or sad moments. ';
  } else if (features.energy > 0.6) {
    interpretation += 'is energetic and dynamic. ';
  } else if (features.energy < 0.4) {
    interpretation += 'is calm and subdued. ';
  }
  
  // Interpret danceability
  if (features.danceability > 0.8) {
    interpretation += 'It has a very danceable rhythm. ';
  } else if (features.danceability < 0.3) {
    interpretation += 'It has a complex or irregular rhythm that\'s not particularly danceable. ';
  }
  
  // Interpret acousticness vs. electronic
  if (features.acousticness > 0.8) {
    interpretation += 'The sound is primarily acoustic with minimal electronic elements. ';
  } else if (features.acousticness < 0.2) {
    interpretation += 'The sound is predominantly electronic rather than acoustic. ';
  }
  
  // Interpret tempo
  if (features.tempo > 160) {
    interpretation += 'The tempo is very fast. ';
  } else if (features.tempo < 70) {
    interpretation += 'The tempo is quite slow. ';
  }
  
  return interpretation;
}

// Start the chat
startChat();

// Handle exit
rl.on('close', () => {
  process.exit(0);
}); 