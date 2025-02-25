/**
 * Logger utility for consistent logging across the application
 */
const winston = require('winston');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => {
      const { timestamp, level, message, ...args } = info;
      const extraArgs = Object.keys(args).length ? JSON.stringify(args, null, 2) : '';
      return `${timestamp} ${level}: ${message} ${extraArgs}`;
    }
  ),
);

// Define transports
const transports = [
  new winston.transports.Console(),
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
  }),
  new winston.transports.File({ filename: 'logs/all.log' }),
];

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || level(),
  levels,
  format,
  transports,
});

module.exports = logger;
