/**
 * Custom error classes for consistent error handling
 */

/**
 * Base API Error class
 */
class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request Error
 */
class BadRequestError extends ApiError {
  constructor(message = 'Bad Request', details = null) {
    super(message, 400, details);
  }
}

/**
 * 401 Unauthorized Error
 */
class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, 401, details);
  }
}

/**
 * 403 Forbidden Error
 */
class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden', details = null) {
    super(message, 403, details);
  }
}

/**
 * 404 Not Found Error
 */
class NotFoundError extends ApiError {
  constructor(message = 'Resource Not Found', details = null) {
    super(message, 404, details);
  }
}

/**
 * 409 Conflict Error
 */
class ConflictError extends ApiError {
  constructor(message = 'Resource Conflict', details = null) {
    super(message, 409, details);
  }
}

/**
 * 422 Validation Error
 */
class ValidationError extends ApiError {
  constructor(message = 'Validation Error', details = null) {
    super(message, 422, details);
  }
}

/**
 * 500 Internal Server Error
 */
class InternalServerError extends ApiError {
  constructor(message = 'Internal Server Error', details = null) {
    super(message, 500, details);
  }
}

/**
 * 503 Service Unavailable Error
 */
class ServiceUnavailableError extends ApiError {
  constructor(message = 'Service Unavailable', details = null) {
    super(message, 503, details);
  }
}

/**
 * MCP Boundary Error - Used when a layer tries to access another layer improperly
 */
class MCPBoundaryError extends ApiError {
  constructor(message = 'MCP Boundary Violation', details = null) {
    super(message, 403, details);
  }
}

module.exports = {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  InternalServerError,
  ServiceUnavailableError,
  MCPBoundaryError
};
