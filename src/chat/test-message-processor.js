/**
 * Test script for the message processor
 * 
 * This script tests the message processor with various inputs to verify
 * that it correctly handles tool selection and parameter validation.
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { processUserMessage } = require('./message-processor');

// Test queries
const TEST_QUERIES = [
  "hello",
  "what can you do?",
  "test layer1",
  "test layer2",
  "find similar artists to Radiohead",
  "what's similar to Bombay Bicycle Club",
  "tell me about the song Creep by Radiohead"
];

/**
 * Run the tests
 */
async function runTests() {
  console.log('=== Testing Message Processor ===\n');
  
  for (const query of TEST_QUERIES) {
    console.log(`\n--- Testing query: "${query}" ---`);
    
    try {
      const response = await processUserMessage(query);
      console.log('Response:', response);
      console.log('Test passed ✅');
    } catch (error) {
      console.error('Test failed ❌:', error);
    }
    
    // Add a small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n=== All tests completed ===');
}

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
}); 