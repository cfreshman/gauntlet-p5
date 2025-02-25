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
        if (this.onmessage) {
          this.onmessage(message);
        }
      } catch (error) {
        logger.error('Error parsing WebSocket message:', error);
        if (this.onerror) {
          this.onerror(error);
        }
      }
    });

    this.ws.on('close', () => {
      if (this.onclose) {
        this.onclose();
      }
    });

    this.ws.on('error', (error) => {
      if (this.onerror) {
        this.onerror(error);
      }
    });
  }

  async send(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  async close() {
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
        if (this.onmessage) {
          this.onmessage(message);
        }
      } catch (error) {
        logger.error('Error parsing WebSocket message:', error);
        if (this.onerror) {
          this.onerror(error);
        }
      }
    });

    this.ws.on('close', () => {
      if (this.onclose) {
        this.onclose();
      }
    });

    this.ws.on('error', (error) => {
      if (this.onerror) {
        this.onerror(error);
      }
    });
  }

  async send(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  async close() {
    this.ws.close();
  }
} 