import { WebSocketServer, WebSocket } from 'ws';
import logger from './logger.js';

class ThinkingServer {
  constructor(port = 3014) {
    this.port = port;
    this.receivers = new Map(); // sessionId -> WebSocket
    this.wss = null;
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port });
    logger.info(`Thinking server listening on port ${this.port}`);

    this.wss.on('connection', (ws, req) => {
      const sessionId = new URL(req.url, 'ws://localhost').searchParams.get('sessionId');
      if (!sessionId) {
        logger.warn('Connection attempt without sessionId');
        ws.close();
        return;
      }

      logger.info(`New thinking connection for session ${sessionId}`);

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          logger.info(`Received message from session ${sessionId}:`, message);
          
          if (message.type === 'register_receiver') {
            // Register this connection as a receiver
            logger.info(`Registering receiver for session ${sessionId}`);
            this.receivers.set(sessionId, ws);
          } else {
            // Route thinking message to the receiver for this session
            this.routeMessage(sessionId, message);
          }
        } catch (error) {
          logger.error(`Error processing message for session ${sessionId}:`, error);
        }
      });

      ws.on('close', () => {
        logger.info(`WebSocket connection closed for session ${sessionId}`);
        // Only remove from receivers if this was a receiver connection
        if (this.receivers.get(sessionId) === ws) {
          logger.info(`Removing receiver for session ${sessionId}`);
          this.receivers.delete(sessionId);
        }
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for session ${sessionId}:`, error);
        // Only remove from receivers if this was a receiver connection
        if (this.receivers.get(sessionId) === ws) {
          logger.info(`Removing receiver for session ${sessionId} due to error`);
          this.receivers.delete(sessionId);
        }
      });
    });
  }

  routeMessage(sessionId, message) {
    const receiver = this.receivers.get(sessionId);
    if (!receiver || receiver.readyState !== WebSocket.OPEN) {
      logger.warn(`No receiver found for session ${sessionId}`);
      return;
    }

    logger.info(`Routing message to receiver for session ${sessionId}`);
    receiver.send(JSON.stringify(message));
  }

  hasReceiver(sessionId) {
    const ws = this.receivers.get(sessionId);
    return ws && ws.readyState === WebSocket.OPEN;
  }
}

const thinkingServer = new ThinkingServer();
export default thinkingServer; 