/**
 * Validation utilities using Joi
 */
const Joi = require('joi');
const { ValidationError } = require('./errors');

/**
 * Validate request data against a Joi schema
 * @param {Object} schema - Joi schema to validate against
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const details = error.details.map(detail => ({
        message: detail.message,
        path: detail.path
      }));
      
      return next(new ValidationError('Validation error', details));
    }
    
    // Replace request data with validated data
    req[property] = value;
    return next();
  };
};

/**
 * Common validation schemas
 */
const schemas = {
  // User schemas
  user: {
    create: Joi.object({
      username: Joi.string().alphanum().min(3).max(30).required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required(),
      name: Joi.string().max(100)
    }),
    update: Joi.object({
      username: Joi.string().alphanum().min(3).max(30),
      email: Joi.string().email(),
      name: Joi.string().max(100)
    })
  },
  
  // Authentication schemas
  auth: {
    login: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required()
    })
  },
  
  // ID parameter schema
  id: Joi.object({
    id: Joi.string().required()
  }),
  
  // Pagination schema
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().default('createdAt'),
    order: Joi.string().valid('asc', 'desc').default('desc')
  })
};

module.exports = {
  validateRequest,
  schemas
};
