/**
 * Elahe Panel - Swagger/OpenAPI Documentation Configuration
 * Provides automatic API documentation generation
 * Version: 0.0.5
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const config = require('../config/default');

/**
 * Swagger definition
 */
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Elahe Panel API',
    version: '0.0.5',
    description: 'Advanced Multi-Protocol Tunnel Management System API Documentation',
    contact: {
      name: 'EHSANKiNG',
      url: 'https://github.com/EHSANKiNG/elahe-panel',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: `http://localhost:${config.server.port}`,
      description: 'Development server (HTTP)',
    },
    {
      url: `https://localhost:${config.server.port}`,
      description: 'Development server (HTTPS)',
    },
    {
      url: '/api',
      description: 'Production server (relative path)',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from login endpoint',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'token',
        description: 'JWT token stored in httpOnly cookie',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'string',
            example: 'Error message',
          },
          statusCode: {
            type: 'integer',
            example: 400,
          },
          details: {
            type: 'object',
            description: 'Additional error details',
          },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'string',
            example: 'Validation failed',
          },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: {
                  type: 'string',
                  example: 'username',
                },
                message: {
                  type: 'string',
                  example: 'Username is required',
                },
              },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            example: 1,
          },
          username: {
            type: 'string',
            example: 'user123',
          },
          status: {
            type: 'string',
            enum: ['active', 'disabled', 'expired', 'limited'],
            example: 'active',
          },
          dataLimit: {
            type: 'integer',
            description: 'Data limit in bytes (0 = unlimited)',
            example: 10737418240,
          },
          dataUsed: {
            type: 'integer',
            description: 'Data used in bytes',
            example: 5368709120,
          },
          expireAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            example: '2024-12-31T23:59:59Z',
          },
          maxConnections: {
            type: 'integer',
            example: 2,
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      Server: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            example: 1,
          },
          name: {
            type: 'string',
            example: 'Iran Server 1',
          },
          host: {
            type: 'string',
            example: '192.168.1.100',
          },
          port: {
            type: 'integer',
            example: 22,
          },
          type: {
            type: 'string',
            enum: ['iran', 'foreign'],
            example: 'iran',
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'error'],
            example: 'active',
          },
        },
      },
      Tunnel: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            example: 1,
          },
          name: {
            type: 'string',
            example: 'Main Tunnel',
          },
          iranServerId: {
            type: 'integer',
            example: 1,
          },
          foreignServerId: {
            type: 'integer',
            example: 2,
          },
          tunnelType: {
            type: 'string',
            enum: ['ssh', 'frp', 'gost', 'chisel', 'trusttunnel'],
            example: 'ssh',
          },
          localPort: {
            type: 'integer',
            example: 443,
          },
          remotePort: {
            type: 'integer',
            example: 8443,
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'error'],
            example: 'active',
          },
          health: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['healthy', 'unhealthy', 'unknown'],
              },
              latency: {
                type: 'number',
                description: 'Latency in milliseconds',
              },
              lastCheck: {
                type: 'string',
                format: 'date-time',
              },
            },
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password', 'captchaId', 'captchaAnswer'],
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 50,
            example: 'admin',
          },
          password: {
            type: 'string',
            minLength: 6,
            example: 'password123',
          },
          captchaId: {
            type: 'string',
            example: 'abc123',
          },
          captchaAnswer: {
            type: 'string',
            example: '42',
          },
          otp: {
            type: 'string',
            minLength: 6,
            maxLength: 6,
            description: 'Two-factor authentication code (if enabled)',
            example: '123456',
          },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          token: {
            type: 'string',
            description: 'JWT authentication token',
          },
          admin: {
            type: 'object',
            properties: {
              id: {
                type: 'integer',
              },
              username: {
                type: 'string',
              },
              role: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    responses: {
      UnauthorizedError: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: 'Authentication required',
              statusCode: 401,
            },
          },
        },
      },
      ForbiddenError: {
        description: 'Access denied',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: 'Access denied',
              statusCode: 403,
            },
          },
        },
      },
      NotFoundError: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: 'Resource not found',
              statusCode: 404,
            },
          },
        },
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ValidationError',
            },
          },
        },
      },
    },
  },
  tags: [
    {
      name: 'Authentication',
      description: 'Authentication and authorization endpoints',
    },
    {
      name: 'Users',
      description: 'User management endpoints',
    },
    {
      name: 'Servers',
      description: 'Server management endpoints',
    },
    {
      name: 'Tunnels',
      description: 'Tunnel management and monitoring endpoints',
    },
    {
      name: 'Subscriptions',
      description: 'User subscription endpoints',
    },
    {
      name: 'Settings',
      description: 'System settings and configuration endpoints',
    },
  ],
};

/**
 * Options for swagger-jsdoc
 */
const options = {
  swaggerDefinition,
  // Paths to files containing JSDoc comments with Swagger annotations
  apis: [
    './src/api/routes/*.js',
    './src/api/routes/**/*.js',
  ],
};

/**
 * Initialize swagger-jsdoc
 */
const swaggerSpec = swaggerJsdoc(options);

/**
 * Custom CSS for Swagger UI
 */
const customCss = `
  .swagger-ui .topbar { display: none }
  .swagger-ui .information-container { margin: 50px 0 }
  .swagger-ui .info { margin: 20px 0 }
  .swagger-ui .info .title { font-size: 36px }
`;

/**
 * Swagger UI options
 */
const swaggerUiOptions = {
  customCss,
  customSiteTitle: 'Elahe Panel API Documentation',
  customfavIcon: '/shared/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    syntaxHighlight: {
      activate: true,
      theme: 'monokai',
    },
  },
};

/**
 * Setup Swagger documentation
 */
const setupSwagger = (app) => {
  // Serve Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
  
  // Serve Swagger JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
  
  return swaggerSpec;
};

module.exports = {
  setupSwagger,
  swaggerSpec,
};
