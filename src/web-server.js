const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { processUserMessage } = require('./chat/message-processor');

// create express app
const app = express();
app.use(cors());
app.use(express.json());

// serve static files from web-client/dist if they exist
app.use(express.static(path.join(__dirname, '../web-client/dist')));

// create http server and socket.io instance
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// socket.io connection handling
io.on('connection', (socket) => {
  console.log('client connected:', socket.id);
  
  socket.on('message', async (message) => {
    console.log('received message:', message);
    
    try {
      // process the message using the existing chat processor
      const response = await processUserMessage(message);
      socket.emit('message', response);
    } catch (error) {
      console.error('error processing message:', error);
      socket.emit('message', 'sorry, there was an error processing your request.');
    }
  });
  
  socket.on('disconnect', () => {
    console.log('client disconnected:', socket.id);
  });
});

// fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../web-client/dist/index.html'));
});

// start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`web server running on port ${PORT}`);
});

module.exports = { app, server, io }; 