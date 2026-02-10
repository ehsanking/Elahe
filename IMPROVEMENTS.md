# Elahe Panel - Comprehensive Improvements Documentation

This document describes the comprehensive improvements added to the Elahe Panel project to enhance code quality, maintainability, security, and developer experience.

## 📋 Table of Contents

- [Overview](#overview)
- [Input Validation](#input-validation)
- [Error Handling](#error-handling)
- [Testing Framework](#testing-framework)
- [API Documentation](#api-documentation)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Migration Guide](#migration-guide)

---

## 🎯 Overview

The improvements focus on four key areas:

1. **Input Validation** - Comprehensive request validation using express-validator
2. **Error Handling** - Structured error handling with custom error classes
3. **Testing Framework** - Jest-based testing infrastructure
4. **API Documentation** - Swagger/OpenAPI documentation

All improvements are **backward compatible** and follow the existing code patterns in the project.

---

## ✅ Input Validation

### Location
- `src/middleware/validation.js`

### Features

The validation middleware provides:

- Pre-built validation rules for common operations
- Custom validators for complex scenarios
- Consistent error messages
- Automatic validation result checking

### Available Validation Rules

#### Authentication
```javascript
const { validationRules } = require('./src/middleware/validation');

// Login validation
router.post('/login', validationRules.login, async (req, res) => {
  // Request is already validated
});
```

#### User Management
```javascript
// Create user
router.post('/users', validationRules.createUser, async (req, res) => {
  // username, password, dataLimit, etc. are validated
});

// Update user
router.put('/users/:id', validationRules.updateUser, async (req, res) => {
  // id parameter and optional fields are validated
});
```

#### Server Management
```javascript
// Create server
router.post('/servers', validationRules.createServer, async (req, res) => {
  // name, host, port, type are validated
});
```

#### Tunnel Management
```javascript
// Create tunnel
router.post('/tunnels', validationRules.createTunnel, async (req, res) => {
  // name, iranServerId, foreignServerId, tunnelType, ports are validated
});
```

#### Generic Validations
```javascript
// ID parameter validation
router.get('/users/:id', validationRules.idParam, async (req, res) => {
  // ID is validated as positive integer
});

// Pagination validation
router.get('/users', validationRules.pagination, async (req, res) => {
  // page and limit query params are validated
});
```

### Custom Validators

```javascript
const { customValidations } = require('./src/middleware/validation');

// Require at least one field for update operations
router.patch('/users/:id', 
  customValidations.requireAtLeastOne(['password', 'dataLimit', 'status']),
  async (req, res) => {
    // At least one field must be present
  }
);

// Validate IP address
router.post('/servers', 
  customValidations.isValidIP('host'),
  async (req, res) => {
    // host is validated as IPv4 or IPv6
  }
);

// Validate domain name
router.post('/settings', 
  customValidations.isValidDomain('domain'),
  async (req, res) => {
    // domain is validated
  }
);

// Validate UUID
router.post('/config', 
  customValidations.isValidUUID('uuid'),
  async (req, res) => {
    // uuid is validated
  }
);
```

### Creating Custom Validation Rules

```javascript
const { body, param, query } = require('express-validator');
const { validate } = require('./src/middleware/validation');

const myCustomValidation = [
  body('customField')
    .trim()
    .notEmpty().withMessage('Custom field is required')
    .isLength({ min: 5 }).withMessage('Must be at least 5 characters')
    .custom((value) => {
      // Custom validation logic
      if (value.includes('forbidden')) {
        throw new Error('Field contains forbidden value');
      }
      return true;
    }),
  validate // Always include this at the end
];

router.post('/custom', myCustomValidation, async (req, res) => {
  // Handle validated request
});
```

---

## 🚨 Error Handling

### Location
- `src/utils/errors.js`

### Features

The error handling system provides:

- Custom error classes for different scenarios
- Structured error responses
- Automatic logging
- Development vs production error details
- Async route error handling

### Error Classes

#### AppError (Base Class)
```javascript
const { AppError } = require('./src/utils/errors');

throw new AppError('Something went wrong', 500, { detail: 'extra info' });
```

#### ValidationError (400)
```javascript
const { ValidationError } = require('./src/utils/errors');

throw new ValidationError('Invalid input', [
  { field: 'username', message: 'Username is required' }
]);
```

#### AuthenticationError (401)
```javascript
const { AuthenticationError } = require('./src/utils/errors');

throw new AuthenticationError('Invalid credentials');
```

#### AuthorizationError (403)
```javascript
const { AuthorizationError } = require('./src/utils/errors');

throw new AuthorizationError('Admin access required');
```

#### NotFoundError (404)
```javascript
const { NotFoundError } = require('./src/utils/errors');

throw new NotFoundError('User'); // "User not found"
```

#### ConflictError (409)
```javascript
const { ConflictError } = require('./src/utils/errors');

throw new ConflictError('Username already exists');
```

#### DatabaseError (500)
```javascript
const { DatabaseError } = require('./src/utils/errors');

throw new DatabaseError('Query failed', { query: 'SELECT ...' });
```

#### ExternalServiceError (502)
```javascript
const { ExternalServiceError } = require('./src/utils/errors');

throw new ExternalServiceError('Geo routing service', 'connection timeout');
```

### Using Error Handling in Routes

#### With asyncHandler (Recommended)
```javascript
const { asyncHandler, NotFoundError } = require('./src/utils/errors');

router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  
  if (!user) {
    throw new NotFoundError('User');
  }
  
  res.json({ success: true, user });
}));
```

#### Error Factory Functions
```javascript
const { errorFactory } = require('./src/utils/errors');

// Validation error
throw errorFactory.validationError([
  { field: 'email', message: 'Invalid email format' }
]);

// Authentication error
throw errorFactory.authError('Invalid credentials');

// Authorization error
throw errorFactory.forbiddenError();

// Not found error
throw errorFactory.notFound('Server');

// Conflict error
throw errorFactory.conflict('Username already taken');

// Database error
throw errorFactory.databaseError('insert', error);
```

#### Database Operation Helper
```javascript
const { withErrorHandling } = require('./src/utils/errors');

const result = await withErrorHandling(
  async () => {
    return db.prepare('INSERT INTO users ...').run(...);
  },
  'Failed to create user'
);
```

### Error Response Format

All errors return a consistent JSON format:

```json
{
  "success": false,
  "error": "User not found",
  "statusCode": 404,
  "details": {
    "userId": 123
  }
}
```

In development mode, stack traces are included:

```json
{
  "success": false,
  "error": "User not found",
  "statusCode": 404,
  "stack": "Error: User not found\n    at ..."
}
```

---

## 🧪 Testing Framework

### Location
- `tests/` directory
- `jest.config.js`

### Features

The testing framework includes:

- Jest testing framework
- Sample test suites
- Test database configuration
- Coverage reporting
- Setup/teardown helpers

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/auth.test.js
```

### Test Structure

#### Basic Test Example
```javascript
describe('MyService', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  it('should perform operation successfully', () => {
    // Test implementation
    expect(result).toBe(expected);
  });

  it('should handle errors correctly', () => {
    expect(() => {
      // Code that throws error
    }).toThrow(ErrorClass);
  });
});
```

#### Testing Async Operations
```javascript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

#### Testing Database Operations
```javascript
const { getDb } = require('../src/database');

it('should insert record into database', () => {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO users (username) VALUES (?)');
  const result = stmt.run('testuser');
  
  expect(result.changes).toBe(1);
});
```

#### Mocking
```javascript
// Mock external dependencies
jest.mock('../src/services/external', () => ({
  fetchData: jest.fn().mockResolvedValue({ data: 'mocked' })
}));

it('should use mocked service', async () => {
  const result = await myFunction();
  expect(externalService.fetchData).toHaveBeenCalled();
});
```

### Sample Test Suites

Two sample test suites are included:

1. **auth.test.js** - Tests for authentication service
2. **validation.test.js** - Tests for validation middleware

### Writing New Tests

Create test files in the `tests/` directory with the `.test.js` extension:

```javascript
/**
 * Test Suite Name
 */

const ModuleToTest = require('../src/path/to/module');

describe('ModuleToTest', () => {
  describe('functionName', () => {
    it('should behave correctly', () => {
      const result = ModuleToTest.functionName();
      expect(result).toBe(expected);
    });
  });
});
```

### Coverage Reports

Coverage reports are generated in the `coverage/` directory:

- `coverage/lcov-report/index.html` - HTML coverage report
- `coverage/lcov.info` - LCOV format for CI integration

---

## 📚 API Documentation

### Location
- `src/utils/swagger.js`
- Access at `/api-docs` when server is running

### Features

The API documentation system provides:

- Interactive Swagger UI
- OpenAPI 3.0 specification
- Authentication support
- Request/response examples
- Schema definitions

### Accessing Documentation

1. Start the server: `npm start`
2. Open browser to: `http://localhost:3000/api-docs`
3. Explore endpoints interactively

### JSON Specification

The OpenAPI specification is available at:
- `http://localhost:3000/api-docs.json`

### Adding Documentation to Routes

Use JSDoc comments with Swagger annotations:

```javascript
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/users', authMiddleware('admin'), asyncHandler(async (req, res) => {
  // Implementation
}));
```

### Pre-defined Schemas

Common schemas are already defined:

- `Error` - Standard error response
- `ValidationError` - Validation error response
- `User` - User object
- `Server` - Server object
- `Tunnel` - Tunnel object
- `LoginRequest` - Login request body
- `LoginResponse` - Login response

### Pre-defined Responses

Common responses are already defined:

- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `ValidationError` (400)

### Example: Complete Endpoint Documentation

```javascript
/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 8
 *               dataLimit:
 *                 type: integer
 *                 minimum: 0
 *               status:
 *                 type: string
 *                 enum: [active, disabled, expired, limited]
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.put('/users/:id', 
  authMiddleware('admin'),
  validationRules.updateUser,
  asyncHandler(async (req, res) => {
    // Implementation
  })
);
```

---

## 💡 Usage Examples

### Complete Route with All Improvements

```javascript
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { validationRules } = require('../middleware/validation');
const { asyncHandler, NotFoundError } = require('../utils/errors');
const { getDb } = require('../database');

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create new user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *               password:
 *                 type: string
 *                 minLength: 8
 *               dataLimit:
 *                 type: integer
 *               maxConnections:
 *                 type: integer
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       409:
 *         description: Username already exists
 */
router.post('/users',
  authMiddleware('admin'),           // Authentication
  validationRules.createUser,        // Validation
  asyncHandler(async (req, res) => { // Error handling
    const db = getDb();
    const { username, password, dataLimit, maxConnections } = req.body;
    
    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new ConflictError('Username already exists');
    }
    
    // Create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(`
      INSERT INTO users (username, password, data_limit, max_connections)
      VALUES (?, ?, ?, ?)
    `).run(username, hashedPassword, dataLimit || 0, maxConnections || 2);
    
    // Fetch created user
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    
    res.status(201).json({ success: true, user });
  })
);

module.exports = router;
```

### Service with Error Handling

```javascript
const { withErrorHandling, NotFoundError } = require('../utils/errors');
const { getDb } = require('../database');

class UserService {
  static async getUser(userId) {
    return await withErrorHandling(async () => {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      
      if (!user) {
        throw new NotFoundError('User');
      }
      
      return user;
    }, 'Failed to fetch user');
  }
  
  static async updateUser(userId, updates) {
    return await withErrorHandling(async () => {
      const db = getDb();
      
      // Verify user exists
      await this.getUser(userId);
      
      // Build update query
      const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(updates), userId];
      
      db.prepare(`UPDATE users SET ${fields} WHERE id = ?`).run(...values);
      
      return await this.getUser(userId);
    }, 'Failed to update user');
  }
}

module.exports = UserService;
```

---

## 🎯 Best Practices

### 1. Always Use Validation

```javascript
// ❌ Bad - No validation
router.post('/users', async (req, res) => {
  const { username, password } = req.body;
  // Direct use without validation
});

// ✅ Good - With validation
router.post('/users', validationRules.createUser, asyncHandler(async (req, res) => {
  const { username, password } = req.body; // Already validated
}));
```

### 2. Use Async Handler

```javascript
// ❌ Bad - Manual try-catch
router.get('/users/:id', async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Good - With asyncHandler
router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.id);
  res.json({ user });
}));
```

### 3. Throw Appropriate Errors

```javascript
// ❌ Bad - Generic error
if (!user) {
  throw new Error('Not found');
}

// ✅ Good - Specific error class
if (!user) {
  throw new NotFoundError('User');
}
```

### 4. Document Your APIs

```javascript
// ❌ Bad - No documentation
router.get('/users', (req, res) => { ... });

// ✅ Good - With Swagger documentation
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     ...
 */
router.get('/users', (req, res) => { ... });
```

### 5. Write Tests

```javascript
// Always write tests for new features
describe('UserService', () => {
  it('should create user successfully', async () => {
    const user = await UserService.createUser({ ... });
    expect(user).toBeDefined();
    expect(user.username).toBe('testuser');
  });
  
  it('should throw error for duplicate username', async () => {
    await expect(UserService.createUser({ username: 'existing' }))
      .rejects.toThrow(ConflictError);
  });
});
```

---

## 🔄 Migration Guide

### Updating Existing Routes

#### Step 1: Add Validation

```javascript
// Before
router.post('/users', authMiddleware('admin'), async (req, res) => {
  // Manual validation
  if (!req.body.username) {
    return res.status(400).json({ error: 'Username required' });
  }
  // ...
});

// After
router.post('/users', 
  authMiddleware('admin'),
  validationRules.createUser,  // Add validation
  async (req, res) => {
    // No manual validation needed
    // ...
  }
);
```

#### Step 2: Add Error Handling

```javascript
// Before
router.post('/users', validationRules.createUser, async (req, res) => {
  try {
    // ...
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// After
router.post('/users', 
  validationRules.createUser,
  asyncHandler(async (req, res) => {  // Add asyncHandler
    // Throw errors instead of try-catch
    if (!user) {
      throw new NotFoundError('User');
    }
    // ...
  })
);
```

#### Step 3: Add Documentation

```javascript
// Before
router.post('/users', ...);

// After
/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create new user
 *     ...
 */
router.post('/users', ...);
```

### Updating Services

```javascript
// Before
class UserService {
  static getUser(userId) {
    try {
      const db = getDb();
      return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    } catch (err) {
      throw new Error('Database error');
    }
  }
}

// After
const { withErrorHandling, NotFoundError } = require('../utils/errors');

class UserService {
  static async getUser(userId) {
    return await withErrorHandling(async () => {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      
      if (!user) {
        throw new NotFoundError('User');
      }
      
      return user;
    }, 'Failed to fetch user');
  }
}
```

---

## 📝 Summary

These improvements provide:

✅ **Input Validation** - Comprehensive request validation with express-validator  
✅ **Error Handling** - Structured error handling with custom error classes  
✅ **Testing Framework** - Jest-based testing infrastructure  
✅ **API Documentation** - Swagger/OpenAPI documentation  
✅ **Backward Compatibility** - All existing code continues to work  
✅ **Best Practices** - Following Node.js and Express best practices  
✅ **Developer Experience** - Better DX with clear error messages and documentation  

For questions or issues, please refer to the inline code comments or create an issue in the repository.
