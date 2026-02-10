/**
 * Elahe Panel - Custom Error Classes and Enhanced Error Handler
 * Provides structured error handling throughout the application
 * Version: 0.0.5
 */

const { createLogger } = require('./logger');
const log = createLogger('ErrorHandler');

/**
 * Base application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Distinguishes operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
    };
  }
}

/**
 * Validation error (400)
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, details);
  }
}

/**
 * Authentication error (401)
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, details);
  }
}

/**
 * Authorization error (403)
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied', details = null) {
    super(message, 403, details);
  }
}

/**
 * Not found error (404)
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource', details = null) {
    super(`${resource} not found`, 404, details);
  }
}

/**
 * Conflict error (409)
 */
class ConflictError extends AppError {
  constructor(message = 'Resource already exists', details = null) {
    super(message, 409, details);
  }
}

/**
 * Rate limit error (429)
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details = null) {
    super(message, 429, details);
  }
}

/**
 * Database error (500)
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details = null) {
    super(message, 500, details);
    this.isOperational = false; // Database errors are typically not operational
  }
}

/**
 * External service error (502)
 */
class ExternalServiceError extends AppError {
  constructor(service = 'External service', message = 'unavailable', details = null) {
    super(`${service} ${message}`, 502, details);
  }
}

/**
 * Service unavailable error (503)
 */
class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', details = null) {
    super(message, 503, details);
  }
}

/**
 * Enhanced error handler middleware
 * Handles all errors thrown in the application
 */
const errorHandler = (err, req, res, next) => {
  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Default to 500 if statusCode not set
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;

  // Log error based on severity
  const errorContext = {
    error: err.message,
    statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    user: req.user?.username || 'anonymous',
    ...(err.details && { details: err.details })
  };

  // Log operational errors as warnings, programming errors as errors
  if (isOperational) {
    log.warn('Operational error', errorContext);
  } else {
    log.error('Programming error', { ...errorContext, stack: err.stack });
  }

  // Build response
  const response = {
    success: false,
    error: err.message || 'Internal server error',
    statusCode,
    ...(err.details && { details: err.details })
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  // Send error response
  res.status(statusCode).json(response);
};

/**
 * Async route wrapper to catch errors in async route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  // Skip if it's an API or subscription route (let main handler deal with it)
  if (req.path.startsWith('/api/') || req.path.startsWith('/sub/')) {
    next(new NotFoundError('Endpoint'));
  } else {
    next(); // Let SPA fallback handle it
  }
};

/**
 * Error factory functions for common scenarios
 */
const errorFactory = {
  /**
   * Create a validation error from multiple field errors
   */
  validationError: (fields) => {
    return new ValidationError('Validation failed', fields);
  },

  /**
   * Create an authentication error
   */
  authError: (message = 'Invalid credentials') => {
    return new AuthenticationError(message);
  },

  /**
   * Create an authorization error
   */
  forbiddenError: (message = 'You do not have permission to perform this action') => {
    return new AuthorizationError(message);
  },

  /**
   * Create a not found error
   */
  notFound: (resource) => {
    return new NotFoundError(resource);
  },

  /**
   * Create a conflict error
   */
  conflict: (message = 'Resource already exists') => {
    return new ConflictError(message);
  },

  /**
   * Create a database error
   */
  databaseError: (operation, error) => {
    return new DatabaseError(`Database ${operation} failed`, { originalError: error.message });
  },
};

/**
 * Helper to safely handle database operations
 */
const withErrorHandling = async (operation, errorMessage = 'Operation failed') => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    // Check for specific database errors
    if (error.message?.includes('UNIQUE constraint failed')) {
      throw new ConflictError('Resource already exists', { field: error.message });
    }
    
    if (error.message?.includes('FOREIGN KEY constraint failed')) {
      throw new ValidationError('Invalid reference', { error: error.message });
    }
    
    // Generic error
    throw new DatabaseError(errorMessage, { originalError: error.message });
  }
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  ServiceUnavailableError,
  
  // Middleware
  errorHandler,
  asyncHandler,
  notFoundHandler,
  
  // Utilities
  errorFactory,
  withErrorHandling,
};
