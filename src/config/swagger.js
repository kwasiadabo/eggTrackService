const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: '🥚 EggTrack — Distribution & Sales API',
      version: '2.0.0',
      description: `
## Egg Distribution & Sales Management System

Full REST API with **JWT authentication**, **role-based authorisation**, and complete **CRUD** operations.

### Authentication Flow
1. \`POST /api/auth/login\` → receive \`accessToken\` (15 min) + \`refreshToken\` (7 days)
2. Pass \`Authorization: Bearer <accessToken>\` on every protected request
3. When the access token expires, call \`POST /api/auth/refresh\` with the refresh token
4. On logout, call \`POST /api/auth/logout\` to revoke the refresh token

### Role Matrix

| Role | Read | Create | Edit | Delete | Manage Users |
|------|------|--------|------|--------|--------------|
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **manager** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **viewer** | ✅ | ❌ | ❌ | ❌ | ❌ |

### Seed Accounts (password: \`Admin@123\`)
| Email | Role |
|-------|------|
| admin@eggtrack.app | admin |
| manager@eggtrack.app | manager |
| viewer@eggtrack.app | viewer |
      `.trim(),
      contact: { name: 'EggTrack Support', email: 'support@eggtrack.app' },
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Local development' },
    ],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth',      description: 'Login, token refresh, logout, profile' },
      { name: 'Users',     description: 'User management (admin only)' },
      { name: 'Dashboard', description: 'Business KPI summary' },
      { name: 'Inventory', description: 'Live stock per egg size' },
      { name: 'Purchases', description: 'Egg procurement — full CRUD' },
      { name: 'Sales',     description: 'Distribution to retailers — full CRUD' },
      { name: 'Customers', description: 'Retailer directory — full CRUD' },
      { name: 'Payments',  description: 'Payment records — full CRUD' },
      { name: 'Debtors',   description: 'Outstanding balance tracking' },
      { name: 'Expenses',  description: 'Operational costs — full CRUD' },
      { name: 'Bank',      description: 'Bank accounts and cash transactions (deposits, withdrawals, approvals)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste the accessToken from POST /api/auth/login',
        },
      },
      schemas: {
        // Enums
        EggSize:       { type: 'string', enum: ['small', 'medium', 'large', 'xlarge', 'pullet'], example: 'large' },
        PaymentMethod: { type: 'string', enum: ['cash', 'mobile_money', 'bank_transfer', 'cheque'], example: 'mobile_money' },
        UserRole:      { type: 'string', enum: ['admin', 'manager', 'viewer'], example: 'manager' },

        // Auth
        UserProfile: {
          type: 'object',
          properties: {
            id:              { type: 'integer', example: 1 },
            name:            { type: 'string',  example: 'Super Admin' },
            email:           { type: 'string',  example: 'admin@eggtrack.app' },
            role:            { $ref: '#/components/schemas/UserRole' },
            isActive:        { type: 'boolean', example: true },
            lastLoginAt:     { type: 'string',  format: 'date-time', nullable: true },
            createdAt:       { type: 'string',  format: 'date-time' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success:      { type: 'boolean', example: true },
            message:      { type: 'string',  example: 'Login successful' },
            accessToken:  { type: 'string',  description: 'JWT valid for 15 minutes' },
            refreshToken: { type: 'string',  description: 'Opaque token valid for 7 days' },
            user:         { $ref: '#/components/schemas/UserProfile' },
          },
        },

        // Business entities
        InventoryItem: {
          type: 'object',
          properties: {
            id: { type: 'integer' }, eggSize: { $ref: '#/components/schemas/EggSize' },
            quantity: { type: 'integer', example: 320 }, updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Purchase: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 7 }, farmName: { type: 'string', example: 'Golden Farms' },
            eggSize: { $ref: '#/components/schemas/EggSize' }, quantity: { type: 'integer', example: 200 },
            costPerTray: { type: 'number', example: 28.00 }, totalCost: { type: 'number', example: 5600.00 },
            purchaseDate: { type: 'string', format: 'date' }, notes: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected'], example: 'approved' },
            initiatedById: { type: 'integer', nullable: true }, initiatedByName: { type: 'string', nullable: true },
            approvedById: { type: 'integer', nullable: true }, approvedByName: { type: 'string', nullable: true },
            approvedAt: { type: 'string', format: 'date-time', nullable: true },
            rejectedAt: { type: 'string', format: 'date-time', nullable: true },
            rejectionNote: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreatePurchaseBody: {
          type: 'object', required: ['farmName', 'eggSize', 'quantity', 'costPerTray'],
          properties: {
            farmName:    { type: 'string', example: 'Golden Farms' },
            eggSize:     { $ref: '#/components/schemas/EggSize' },
            quantity:    { type: 'integer', minimum: 1, example: 200 },
            costPerTray: { type: 'number', minimum: 0.01, example: 28.00 },
            purchaseDate:{ type: 'string', format: 'date' },
            notes:       { type: 'string' },
          },
        },
        UpdatePurchaseBody: {
          type: 'object',
          properties: {
            farmName:    { type: 'string' }, eggSize: { $ref: '#/components/schemas/EggSize' },
            quantity:    { type: 'integer', minimum: 1 }, costPerTray: { type: 'number', minimum: 0.01 },
            purchaseDate:{ type: 'string', format: 'date' }, notes: { type: 'string' },
          },
        },
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 }, name: { type: 'string', example: 'Akosua Retail Store' },
            phone: { type: 'string', nullable: true }, address: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true }, createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateCustomerBody: {
          type: 'object', required: ['name'],
          properties: {
            name: { type: 'string', example: 'Kwame Supermarket' }, phone: { type: 'string' },
            address: { type: 'string' }, email: { type: 'string' },
          },
        },
        Sale: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 12 }, customerId: { type: 'integer' },
            customerName: { type: 'string', example: 'Akosua Retail Store' },
            eggSize: { $ref: '#/components/schemas/EggSize' }, quantity: { type: 'integer', example: 50 },
            unitPrice: { type: 'number', example: 35.00 }, totalAmount: { type: 'number', example: 1750.00 },
            saleDate: { type: 'string', format: 'date' }, notes: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateSaleBody: {
          type: 'object', required: ['customerId', 'eggSize', 'quantity', 'unitPrice'],
          properties: {
            customerId: { type: 'integer', minimum: 1, example: 1 },
            eggSize: { $ref: '#/components/schemas/EggSize' }, quantity: { type: 'integer', minimum: 1, example: 50 },
            unitPrice: { type: 'number', minimum: 0.01, example: 35.00 },
            saleDate: { type: 'string', format: 'date' }, notes: { type: 'string' },
          },
        },
        Receipt: {
          type: 'object',
          properties: {
            receiptNo: { type: 'string', example: 'RCP-12' }, date: { type: 'string', format: 'date' },
            customer: { type: 'string' }, phone: { type: 'string', nullable: true },
            eggSize: { $ref: '#/components/schemas/EggSize' }, quantity: { type: 'integer' },
            unitPrice: { type: 'number' }, totalAmount: { type: 'number' },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 5 }, customerId: { type: 'integer' },
            customerName: { type: 'string' }, saleId: { type: 'integer', nullable: true },
            amount: { type: 'number', example: 1000.00 }, paymentDate: { type: 'string', format: 'date' },
            method: { $ref: '#/components/schemas/PaymentMethod' }, notes: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CreatePaymentBody: {
          type: 'object', required: ['customerId', 'amount'],
          properties: {
            customerId: { type: 'integer', minimum: 1, example: 1 },
            saleId: { type: 'integer', nullable: true }, amount: { type: 'number', minimum: 0.01, example: 1000.00 },
            paymentDate: { type: 'string', format: 'date' }, method: { $ref: '#/components/schemas/PaymentMethod' },
            notes: { type: 'string' },
          },
        },
        Debtor: {
          type: 'object',
          properties: {
            customerId: { type: 'integer' }, customerName: { type: 'string' }, phone: { type: 'string', nullable: true },
            totalSales: { type: 'number' }, totalPaid: { type: 'number' }, balance: { type: 'number' },
            lastSaleDate: { type: 'string', format: 'date', nullable: true },
            daysDue: { type: 'integer' }, overdue: { type: 'boolean' },
          },
        },
        Expense: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 2 }, category: { type: 'string', example: 'Transport' },
            description: { type: 'string', example: 'Fuel for delivery van' }, amount: { type: 'number', example: 200.00 },
            expenseDate: { type: 'string', format: 'date' }, createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateExpenseBody: {
          type: 'object', required: ['category', 'description', 'amount'],
          properties: {
            category: { type: 'string', example: 'Transport' }, description: { type: 'string', example: 'Fuel for delivery van' },
            amount: { type: 'number', minimum: 0.01, example: 200.00 }, expenseDate: { type: 'string', format: 'date' },
          },
        },
        ExpenseSummaryItem: {
          type: 'object',
          properties: { category: { type: 'string' }, total: { type: 'number' }, count: { type: 'integer' } },
        },
        DashboardStats: {
          type: 'object',
          properties: {
            inventory:       { type: 'array', items: { $ref: '#/components/schemas/InventoryItem' } },
            totalRevenue:    { type: 'number', example: 12450.00 },
            totalSales:      { type: 'integer', example: 14 },
            totalPaid:       { type: 'number', example: 8200.00 },
            outstandingDebt: { type: 'number', example: 4250.00 },
            totalExpenses:   { type: 'number', example: 1900.00 },
            netProfit:       { type: 'number', example: 10550.00 },
          },
        },
        ErrorEnvelope: {
          type: 'object',
          properties: { success: { type: 'boolean', example: false }, message: { type: 'string' } },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing or invalid JWT',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' },
            example: { success: false, message: 'Authentication required. Please log in.' } } },
        },
        Forbidden: {
          description: 'Authenticated but insufficient role',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' },
            example: { success: false, message: 'Access denied. Required role: admin. Your role: viewer.' } } },
        },
        BadRequest: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
        },
        NotFound: {
          description: 'Resource not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
        },
        InternalError: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
