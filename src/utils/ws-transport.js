/**
 * WebSocket Transport for MCP
 * 
 * This module provides WebSocket transport implementations for both client and server.
 */

import WebSocket from 'ws';
import logger from './logger.js';

/**
 * WebSocket Server Transport
 */
export class WebSocketServerTransport {
  constructor(ws) {
    this.ws = ws;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }

  async start() {
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        logger.debug('[WebSocketServerTransport] Received message:', message);
        if (this.onmessage) {
          this.onmessage(message);
        }
      } catch (error) {
        logger.error('[WebSocketServerTransport] Error parsing WebSocket message:', error);
        if (this.onerror) {
          this.onerror(error);
        }
      }
    });

    this.ws.on('close', () => {
      logger.debug('[WebSocketServerTransport] Connection closed');
      if (this.onclose) {
        this.onclose();
      }
    });

    this.ws.on('error', (error) => {
      logger.error('[WebSocketServerTransport] WebSocket error:', error);
      if (this.onerror) {
        this.onerror(error);
      }
    });
  }

  async send(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      logger.debug('[WebSocketServerTransport] Sending message:', message);
      this.ws.send(JSON.stringify(message));
    } else {
      logger.warn('[WebSocketServerTransport] Cannot send message - connection not open');
    }
  }

  async close() {
    logger.debug('[WebSocketServerTransport] Closing connection');
    this.ws.close();
  }
}

/**
 * WebSocket Client Transport
 */
export class WebSocketClientTransport {
  constructor(ws) {
    this.ws = ws;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }

  async start() {
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        logger.debug('[WebSocketClientTransport] Received message:', message);
        if (this.onmessage) {
          this.onmessage(message);
        }
      } catch (error) {
        logger.error('[WebSocketClientTransport] Error parsing WebSocket message:', error);
        if (this.onerror) {
          this.onerror(error);
        }
      }
    });

    this.ws.on('close', () => {
      logger.debug('[WebSocketClientTransport] Connection closed');
      if (this.onclose) {
        this.onclose();
      }
    });

    this.ws.on('error', (error) => {
      logger.error('[WebSocketClientTransport] WebSocket error:', error);
      if (this.onerror) {
        this.onerror(error);
      }
    });
  }

  async send(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      logger.debug('[WebSocketClientTransport] Sending message:', message);
      this.ws.send(JSON.stringify(message));
    } else {
      logger.warn('[WebSocketClientTransport] Cannot send message - connection not open');
    }
  }

  async close() {
    logger.debug('[WebSocketClientTransport] Closing connection');
    this.ws.close();
  }
} 