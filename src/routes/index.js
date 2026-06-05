const express = require('express');
const router = express.Router();
const { validate } = require('../middleware');
const {
	requireViewer,
	requireManager,
	requireAdmin,
} = require('../middleware/auth');

const purchasesCtrl = require('../controllers/purchasesController');
const inventoryCtrl = require('../controllers/inventoryController');
const salesCtrl = require('../controllers/salesController');
const customersCtrl = require('../controllers/customersController');
const reportingCtrl = require('../controllers/customersController');
const paymentsCtrl = require('../controllers/paymentsController');
const expensesCtrl = require('../controllers/expensesController');
const dashboardCtrl = require('../controllers/dashboardController');

const EGG_SIZES = ['small', 'medium', 'large'];

// ════════════════════════════════════════════════════════════
//  DASHBOARD  (viewer+)
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/dashboard:
 *   get:
 *     summary: Business KPI summary
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Dashboard stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/DashboardStats' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/dashboard', ...requireViewer, dashboardCtrl.getDashboard);

// ════════════════════════════════════════════════════════════
//  INVENTORY  (viewer+)
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/inventory:
 *   get:
 *     summary: Current stock levels per egg size
 *     tags: [Inventory]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Inventory rows
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/InventoryItem' } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/inventory', ...requireViewer, inventoryCtrl.getInventory);

// ════════════════════════════════════════════════════════════
//  PURCHASES  (viewer=GET, manager=POST/PUT, admin=DELETE)
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/purchases:
 *   get:
 *     summary: List all purchases
 *     tags: [Purchases]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Purchases list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Purchase' } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/purchases', ...requireViewer, purchasesCtrl.getPurchases);

/**
 * @openapi
 * /api/purchases/{id}:
 *   get:
 *     summary: Get a single purchase
 *     tags: [Purchases]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Purchase record }
 *       404: { description: Not found }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/purchases/:id', ...requireViewer, purchasesCtrl.getPurchase);

/**
 * @openapi
 * /api/purchases:
 *   post:
 *     summary: Record a purchase (manager+)
 *     description: Saves purchase and increments inventory atomically.
 *     tags: [Purchases]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreatePurchaseBody' }
 *     responses:
 *       201: { description: Purchase created }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
	'/purchases',
	...requireManager,
	validate({
		farmName: { required: true },
		eggSize: { required: true, enum: EGG_SIZES },
		quantity: { required: true, type: 'number', min: 1 },
		costPerTray: { required: true, type: 'number', min: 0.01 },
	}),
	purchasesCtrl.createPurchase,
);

/**
 * @openapi
 * /api/purchases/{id}:
 *   put:
 *     summary: Update a purchase (manager+)
 *     description: Updates purchase and reconciles inventory — handles size and quantity changes.
 *     tags: [Purchases]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreatePurchaseBody' }
 *     responses:
 *       200: { description: Purchase updated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: Not found }
 */
router.put('/purchases/:id', ...requireManager, purchasesCtrl.updatePurchase);

/**
 * @openapi
 * /api/purchases/{id}:
 *   delete:
 *     summary: Soft-delete a purchase (admin only)
 *     description: Marks purchase as deleted and reverses the inventory increment.
 *     tags: [Purchases]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Purchase deleted }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: Not found }
 */
router.delete('/purchases/:id', ...requireAdmin, purchasesCtrl.deletePurchase);

// ════════════════════════════════════════════════════════════
//  SALES
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/sales:
 *   get:
 *     summary: List all sales
 *     tags: [Sales]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Sales list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Sale' } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/sales', ...requireViewer, salesCtrl.getSales);

/**
 * @openapi
 * /api/sales/{id}:
 *   get:
 *     summary: Get a single sale with customer details
 *     tags: [Sales]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Sale record }
 *       404: { description: Not found }
 */
router.get('/sales/:id', ...requireViewer, salesCtrl.getSale);

/**
 * @openapi
 * /api/sales:
 *   post:
 *     summary: Record a sale (manager+)
 *     description: Validates stock, creates sale, decrements inventory — all in one transaction. Returns a receipt.
 *     tags: [Sales]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateSaleBody' }
 *     responses:
 *       201: { description: Sale created with receipt }
 *       400: { description: Validation error or insufficient stock }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
	'/sales',
	...requireManager,
	validate({
		customerId: { required: true, type: 'number', min: 1 },
		eggSize: { required: true, enum: EGG_SIZES },
		quantity: { required: true, type: 'number', min: 1 },
		unitPrice: { required: true, type: 'number', min: 0.01 },
	}),
	salesCtrl.createSale,
);

/**
 * @openapi
 * /api/sales/{id}:
 *   put:
 *     summary: Update a sale (manager+)
 *     description: Updates the sale and reconciles inventory accordingly.
 *     tags: [Sales]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateSaleBody' }
 *     responses:
 *       200: { description: Sale updated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: Not found }
 */
router.put('/sales/:id', ...requireManager, salesCtrl.updateSale);

/**
 * @openapi
 * /api/sales/{id}:
 *   delete:
 *     summary: Soft-delete a sale (admin only)
 *     description: Marks sale as deleted and restores the inventory.
 *     tags: [Sales]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Sale deleted }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.delete('/sales/:id', ...requireAdmin, salesCtrl.deleteSale);

// ════════════════════════════════════════════════════════════
//  CUSTOMERS
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/customers:
 *   get:
 *     summary: List all customers
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Customer list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Customer' } }
 */
router.get('/customers', ...requireViewer, customersCtrl.getCustomers);

/**
 * @openapi
 * /api/customers/{id}:
 *   get:
 *     summary: Get a single customer
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Customer record }
 *       404: { description: Not found }
 */
router.get('/customers/:id', ...requireViewer, customersCtrl.getCustomer);

/**
 * @openapi
 * /api/customers:
 *   post:
 *     summary: Create a customer (manager+)
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCustomerBody' }
 *     responses:
 *       201: { description: Customer created }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
	'/customers',
	...requireManager,
	validate({ name: { required: true } }),
	customersCtrl.createCustomer,
);

/**
 * @openapi
 * /api/customers/{id}:
 *   put:
 *     summary: Update a customer (manager+)
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateCustomerBody' }
 *     responses:
 *       200: { description: Customer updated }
 *       404: { description: Not found }
 */
router.put('/customers/:id', ...requireManager, customersCtrl.updateCustomer);

/**
 * @openapi
 * /api/customers/{id}:
 *   delete:
 *     summary: Soft-delete a customer (admin only)
 *     description: Blocked if the customer has active sales records.
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Customer deleted }
 *       409: { description: Customer has active sales — cannot delete }
 */
router.delete('/customers/:id', ...requireAdmin, customersCtrl.deleteCustomer);

// ════════════════════════════════════════════════════════════
//  PAYMENTS
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/payments:
 *   get:
 *     summary: List all payments
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Payments list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Payment' } }
 */
router.get('/payments', ...requireViewer, paymentsCtrl.getAllPayments);

/**
 * @openapi
 * /api/payments:
 *   post:
 *     summary: Record a payment (manager+)
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreatePaymentBody' }
 *     responses:
 *       201: { description: Payment recorded }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.post(
	'/payments',
	...requireManager,
	validate({
		customerId: { required: true, type: 'number', min: 1 },
		amount: { required: true, type: 'number', min: 0.01 },
	}),
	paymentsCtrl.createPayment,
);

/**
 * @openapi
 * /api/payments/{id}:
 *   put:
 *     summary: Update a payment (manager+)
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreatePaymentBody' }
 *     responses:
 *       200: { description: Payment updated }
 */
router.put('/payments/:id', ...requireManager, paymentsCtrl.updatePayment);

/**
 * @openapi
 * /api/payments/{id}:
 *   delete:
 *     summary: Soft-delete a payment (admin only)
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Payment deleted }
 */
router.delete('/payments/:id', ...requireAdmin, paymentsCtrl.deletePayment);

/**
 * @openapi
 * /api/payments/customer/{customerId}:
 *   get:
 *     summary: Get payments for a specific customer
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Customer payments }
 */
router.get(
	'/payments/customer/:customerId',
	...requireViewer,
	paymentsCtrl.getPaymentsByCustomer,
);

// ════════════════════════════════════════════════════════════
//  DEBTORS
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/debtors:
 *   get:
 *     summary: Customers with outstanding balances
 *     description: Dynamically computes balance = total sales − total payments. Flags accounts overdue after 30 days.
 *     tags: [Debtors]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Debtors list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Debtor' } }
 */
router.get('/debtors', ...requireViewer, paymentsCtrl.getDebtors);

// ════════════════════════════════════════════════════════════
//  EXPENSES
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/expenses:
 *   get:
 *     summary: List all expenses
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Expenses list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Expense' } }
 */
router.get('/expenses', ...requireViewer, expensesCtrl.getExpenses);

/**
 * @openapi
 * /api/expenses/summary:
 *   get:
 *     summary: Expenses grouped by category
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Category summary }
 */
router.get(
	'/expenses/summary',
	...requireViewer,
	expensesCtrl.getExpenseSummary,
);

/**
 * @openapi
 * /api/expenses/{id}:
 *   get:
 *     summary: Get a single expense
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Expense record }
 *       404: { description: Not found }
 */
router.get('/expenses/:id', ...requireViewer, expensesCtrl.getExpense);

/**
 * @openapi
 * /api/expenses:
 *   post:
 *     summary: Record an expense (manager+)
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateExpenseBody' }
 *     responses:
 *       201: { description: Expense recorded }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
	'/expenses',
	...requireManager,
	validate({
		category: { required: true },
		description: { required: true },
		amount: { required: true, type: 'number', min: 0.01 },
	}),
	expensesCtrl.createExpense,
);

/**
 * @openapi
 * /api/expenses/{id}:
 *   put:
 *     summary: Update an expense (manager+)
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateExpenseBody' }
 *     responses:
 *       200: { description: Expense updated }
 */
router.put('/expenses/:id', ...requireManager, expensesCtrl.updateExpense);

/**
 * @openapi
 * /api/expenses/{id}:
 *   delete:
 *     summary: Soft-delete an expense (admin only)
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Expense deleted }
 */
router.delete('/expenses/:id', ...requireAdmin, expensesCtrl.deleteExpense);

/**
 * @openapi
 * /api/customerstatement:
 *   get:
 *     summary: Get customer statement ledger, summary, or overdue report
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerId
 *         required: false
 *         schema:
 *           type: integer
 *         description: Customer ID. Omit to retrieve statements for all customers.
 *
 *       - in: query
 *         name: dateFrom
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the statement period (YYYY-MM-DD).
 *
 *       - in: query
 *         name: dateTo
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the statement period (YYYY-MM-DD).
 *
 *       - in: query
 *         name: includeOpeningBalance
 *         required: false
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include opening balance brought forward before the statement period.
 *
 *       - in: query
 *         name: mode
 *         required: false
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3]
 *           default: 1
 *         description: |
 *           Report mode:
 *           1 = Detailed Ledger
 *           2 = Customer Summary
 *           3 = Overdue Customers Only
 *
 *       - in: query
 *         name: overdueDays
 *         required: false
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days after which a customer is considered overdue.
 *
 *     responses:
 *       200:
 *         description: Customer statement generated successfully
 *       400:
 *         description: Invalid request parameters
 *       404:
 *         description: Customer not found
 *       500:
 *         description: Internal server error
 */
router.get(
	'/customerstatement',
	...requireManager,
	reportingCtrl.getCustomerStatement,
);

module.exports = router;
