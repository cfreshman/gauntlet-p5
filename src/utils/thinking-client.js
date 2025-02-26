import WebSocket from 'ws';
import logger from './logger.js';

export class ThinkingSendClient {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.connected = false;
  }

  async connect(sessionId) {
    this.sessionId = sessionId;
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`ws://localhost:3014?sessionId=${sessionId}`);
        
        this.ws.on('open', () => {
          logger.info(`ThinkingSendClient connected for session ${sessionId}`);
          this.connected = true;
          resolve();
        });

        this.ws.on('close', () => {
          logger.info(`ThinkingSendClient connection closed for session ${sessionId}`);
          this.connected = false;
        });

        this.ws.on('error', (error) => {
          logger.error(`ThinkingSendClient WebSocket error:`, error);
          this.connected = false;
          reject(error);
        });
      } catch (error) {
        logger.error(`Error creating ThinkingSendClient WebSocket:`, error);
        reject(error);
      }
    });
  }

  send(message) {
    if (!this.isConnected()) {
      logger.warn(`Cannot send message - not connected for session ${this.sessionId}`);
      return;
    }
    
    logger.info(`ThinkingSendClient sending message for session ${this.sessionId}:`, message);
    this.ws.send(JSON.stringify(message));
  }

  isConnected() {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }
}

export class ThinkingReceiveClient {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.messageHandler = null;
    this.connected = false;
  }

  async connect(sessionId) {
    this.sessionId = sessionId;
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`ws://localhost:3014?sessionId=${sessionId}`);
        
        this.ws.on('open', () => {
          logger.info(`ThinkingReceiveClient connected for session ${sessionId}`);
          // Register as a receiver by sending a registration message
          this.ws.send(JSON.stringify({ type: 'register_receiver' }));
          this.connected = true;
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            logger.info(`ThinkingReceiveClient received message for session ${sessionId}:`, message);
            if (this.messageHandler) {
              logger.info(`Calling message handler for session ${sessionId}`);
              this.messageHandler(message);
              logger.info(`Message handler called successfully for session ${sessionId}`);
            } else {
              logger.warn(`No message handler set for session ${sessionId}`);
            }
          } catch (error) {
            logger.error(`Error processing message in ThinkingReceiveClient:`, error);
          }
        });

        this.ws.on('close', () => {
          logger.info(`ThinkingReceiveClient connection closed for session ${sessionId}`);
          this.connected = false;
        });

        this.ws.on('error', (error) => {
          logger.error(`ThinkingReceiveClient WebSocket error:`, error);
          this.connected = false;
          reject(error);
        });
      } catch (error) {
        logger.error(`Error creating ThinkingReceiveClient WebSocket:`, error);
        reject(error);
      }
    });
  }

  onMessage(handler) {
    logger.info(`Setting message handler for session ${this.sessionId}`);
    this.messageHandler = handler;
  }

  isConnected() {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.messageHandler = null;
    }
  }
} 