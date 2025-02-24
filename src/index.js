/**
 * Main entry point for the (AI)PI server system
 */
require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');
const winston = require('winston');
const expressWinston = require('express-winston');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const fs = require('fs');

// Import layer routers
const layer0Router = require('./layer0/router');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors());
app.use(express.json());

// Configure logging
app.use(expressWinston.logger({
  transports: [
    new winston.transports.Console()
  ],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  ),
  meta: false,
  msg: "HTTP {{req.method}} {{req.url}}",
  expressFormat: true,
  colorize: true
}));

// Load OpenAPI specification if it exists
let openApiSpec;
try {
  const openApiPath = path.join(__dirname, 'layer0/openapi.json');
  if (fs.existsSync(openApiPath)) {
    openApiSpec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
  }
} catch (error) {
  console.error('Error loading OpenAPI specification:', error);
}

// Mount API documentation if available
if (openApiSpec) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
}

// Mount layer routers
app.use('/api/v1', layer0Router);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message,
      status: err.status || 500
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`(AI)PI Server running on port ${PORT}`);
  console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
});

module.exports = app; // Export for testing
