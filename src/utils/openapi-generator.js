import { z } from 'zod';

function zodToOpenApi(schema) {
  if (!schema) return {};

  // Get description if available
  const description = schema.description;

  // Handle primitives
  if (schema instanceof z.ZodString) {
    return {
      type: 'string',
      ...(description && { description })
    };
  }
  if (schema instanceof z.ZodNumber) {
    const baseSchema = {
      type: 'number',
      ...(description && { description })
    };
    
    // Add min/max if defined
    if (schema._def.checks) {
      schema._def.checks.forEach(check => {
        if (check.kind === 'min') baseSchema.minimum = check.value;
        if (check.kind === 'max') baseSchema.maximum = check.value;
      });
    }
    
    return baseSchema;
  }
  if (schema instanceof z.ZodBoolean) {
    return {
      type: 'boolean',
      ...(description && { description })
    };
  }

  // Handle arrays
  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToOpenApi(schema.element),
      ...(description && { description })
    };
  }

  // Handle objects
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties = {};
    const required = [];

    Object.entries(shape).forEach(([key, value]) => {
      properties[key] = zodToOpenApi(value);
      if (!value.isOptional()) {
        required.push(key);
      }
    });

    return {
      type: 'object',
      properties,
      ...(required.length > 0 && { required }),
      ...(description && { description })
    };
  }

  // Handle unions (e.g. string | array)
  if (schema instanceof z.ZodUnion) {
    return {
      oneOf: schema._def.options.map(zodToOpenApi),
      ...(description && { description })
    };
  }

  // Handle optional
  if (schema instanceof z.ZodOptional) {
    return {
      ...zodToOpenApi(schema._def.innerType),
      ...(description && { description })
    };
  }

  // Handle enums
  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: schema._def.values,
      ...(description && { description })
    };
  }

  return {};
}

function generateOpenApiPath(name, description, parameters) {
  const paramSchema = z.object(parameters);
  const openApiSchema = zodToOpenApi(paramSchema);

  return {
    post: {
      tags: ['Tools'],
      summary: name,
      description: description,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: openApiSchema
          }
        }
      },
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  content: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string' },
                        text: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        '400': {
          description: 'Error response',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'boolean' },
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  };
}

export { zodToOpenApi, generateOpenApiPath }; 