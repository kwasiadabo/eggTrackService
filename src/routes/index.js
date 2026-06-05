const express = require('express');
const router = express.Router();
const { validate } = require('../middleware');
const {
	requireViewer,
	requireManager,
	requireAdmin,
} = require('../middleware/auth');

const purchasesCtrl          = require('../controllers/purchasesController');
const inventoryCtrl          = require('../controllers/inventoryController');
const salesCtrl              = require('../controllers/salesController');
const customersCtrl          = require('../controllers/customersController');
const paymentsCtrl           = require('../controllers/paymentsController');
const expensesCtrl           = require('../controllers/expensesController');
const dashboardCtrl          = require('../controllers/dashboardController');
const reportRecipientsCtrl   = require('../controllers/reportRecipientsController');
const emailLogsCtrl          = require('../controllers/emailLogsController');
const emailScheduleCtrl      = require('../controllers/emailScheduleController');
const farmsCtrl              = require('../controllers/farmsController');

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

/**
 * @openapi
 * /api/inventory/reconcile:
 *   post:
 *     summary: Reconcile inventory from purchases and sales (admin only)
 *     description: Recalculates each egg size stock as total active purchases minus total active sales and updates the Inventory table.
 *     tags: [Inventory]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Reconciled inventory
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data: { type: array, items: { $ref: '#/components/schemas/InventoryItem' } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/inventory/reconcile', ...requireAdmin, inventoryCtrl.reconcileInventory);

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

// Batch create — must be before /purchases/:id to avoid param clash
router.post('/purchases/batch', ...requireManager, purchasesCtrl.createBatchPurchase);

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

// Multi-line invoice — registered before /sales/:id to avoid param clash
router.post('/sales/invoice', ...requireManager, salesCtrl.createInvoice);

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

/**
 * @openapi
 * /api/sales/{id}/invoice:
 *   get:
 *     summary: Generate a print-ready HTML invoice for a sale
 *     tags: [Sales]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Sale ID
 *     responses:
 *       200:
 *         description: HTML invoice document
 *         content:
 *           text/html:
 *             schema: { type: string }
 *       404: { description: Sale not found }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/sales/:id/invoice', ...requireViewer, salesCtrl.getSaleInvoice);

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

// ════════════════════════════════════════════════════════════
//  REPORT RECIPIENTS
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/report-recipients:
 *   get:
 *     summary: List all debtors report email recipients
 *     tags: [Report Recipients]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Recipients list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:        { type: integer }
 *                       email:     { type: string }
 *                       name:      { type: string }
 *                       isActive:  { type: boolean }
 *                       createdAt: { type: string, format: date-time }
 */
router.get('/report-recipients', ...requireViewer, reportRecipientsCtrl.getRecipients);

/**
 * @openapi
 * /api/report-recipients:
 *   post:
 *     summary: Add a report email recipient (manager+)
 *     tags: [Report Recipients]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *               name:  { type: string }
 *     responses:
 *       201: { description: Recipient added }
 *       409: { description: Email already exists }
 */
router.post(
	'/report-recipients',
	...requireManager,
	validate({ email: { required: true } }),
	reportRecipientsCtrl.addRecipient,
);

/**
 * @openapi
 * /api/report-recipients/{id}:
 *   put:
 *     summary: Update a recipient's name or active status (manager+)
 *     tags: [Report Recipients]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Recipient updated }
 *       404: { description: Not found }
 */
router.put('/report-recipients/:id', ...requireManager, reportRecipientsCtrl.updateRecipient);

/**
 * @openapi
 * /api/report-recipients/{id}:
 *   delete:
 *     summary: Remove a report email recipient (admin only)
 *     tags: [Report Recipients]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Recipient removed }
 *       404: { description: Not found }
 */
router.delete('/report-recipients/:id', ...requireAdmin, reportRecipientsCtrl.deleteRecipient);

// ════════════════════════════════════════════════════════════
//  EMAIL LOGS
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/email-logs:
 *   get:
 *     summary: View history of sent report emails (viewer+)
 *     tags: [Email Logs]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *         description: Max number of records to return
 *       - in: query
 *         name: jobType
 *         schema: { type: string }
 *         description: Filter by job type (e.g. debtors_report)
 *     responses:
 *       200:
 *         description: Email log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:             { type: integer }
 *                       jobType:        { type: string }
 *                       recipients:     { type: string }
 *                       recipientCount: { type: integer }
 *                       debtorCount:    { type: integer }
 *                       status:         { type: string, enum: [sent, failed] }
 *                       errorMessage:   { type: string }
 *                       sentAt:         { type: string, format: date-time }
 */
router.get('/email-logs', ...requireViewer, emailLogsCtrl.getEmailLogs);

// ── Email schedule (admin only) ───────────────────────────────────────────────
router.get('/email-schedule', ...requireAdmin, emailScheduleCtrl.getSchedule);
router.put('/email-schedule', ...requireAdmin, emailScheduleCtrl.updateSchedule);

// ── Farms ─────────────────────────────────────────────────────────────────────
router.get('/farms/active', ...requireViewer, farmsCtrl.getActiveFarms); // for purchase dropdown
router.get('/farms',        ...requireAdmin,  farmsCtrl.getFarms);       // full list with inactive
router.post('/farms',
  ...requireAdmin,
  validate({ name: { required: true } }),
  farmsCtrl.createFarm
);
router.put('/farms/:id',    ...requireAdmin, farmsCtrl.updateFarm);
router.delete('/farms/:id', ...requireAdmin, farmsCtrl.deleteFarm);

module.exports = router;
