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
const paymentsCtrl = require('../controllers/paymentsController');
const expensesCtrl = require('../controllers/expensesController');
const dashboardCtrl = require('../controllers/dashboardController');
const reportRecipientsCtrl = require('../controllers/reportRecipientsController');
const emailLogsCtrl = require('../controllers/emailLogsController');
const emailScheduleCtrl = require('../controllers/emailScheduleController');
const farmsCtrl = require('../controllers/farmsController');
const bankCtrl = require('../controllers/bankController');

const EGG_SIZES = ['small', 'medium', 'large', 'xlarge', 'pullet'];

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
router.post(
	'/inventory/reconcile',
	...requireAdmin,
	inventoryCtrl.reconcileInventory,
);

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
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected] }
 *         description: Filter by approval status
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
router.post(
	'/purchases/batch',
	...requireManager,
	purchasesCtrl.createBatchPurchase,
);

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
 *     description: >
 *       The farm must be on the authorised farms list (Farm Setup → active farms).
 *       Every purchase is created as **pending** and does not affect inventory until
 *       an admin approves it via PUT /api/purchases/{id}/approve.
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

/**
 * @openapi
 * /api/purchases/{id}/approve:
 *   put:
 *     summary: Approve a pending purchase (admin only)
 *     description: Marks the purchase as approved and increments inventory.
 *     tags: [Purchases]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Purchase approved }
 *       400: { description: Not a pending purchase }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: Not found }
 */
router.put(
	'/purchases/:id/approve',
	...requireAdmin,
	purchasesCtrl.approvePurchase,
);

/**
 * @openapi
 * /api/purchases/{id}/reject:
 *   put:
 *     summary: Reject a pending purchase (admin only)
 *     description: Marks the purchase as rejected. Inventory is not affected.
 *     tags: [Purchases]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rejectionNote: { type: string, description: 'Reason for rejection' }
 *     responses:
 *       200: { description: Purchase rejected }
 *       400: { description: Not a pending purchase }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: Not found }
 */
router.put(
	'/purchases/:id/reject',
	...requireAdmin,
	purchasesCtrl.rejectPurchase,
);

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

/**
 * @openapi
 * /api/debtors/send-report:
 *   post:
 *     summary: Manually send the debtors report to selected recipients (manager+)
 *     description: Sends the debtors report email immediately to the chosen report recipients, regardless of their active/inactive status or the daily schedule.
 *     tags: [Debtors]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipientIds]
 *             properties:
 *               recipientIds:
 *                 type: array
 *                 items: { type: integer }
 *                 description: IDs of report recipients to send to
 *     responses:
 *       200: { description: Report sent }
 *       400: { description: No recipients selected }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
	'/debtors/send-report',
	...requireManager,
	paymentsCtrl.sendDebtorsReport,
);

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
router.get(
	'/report-recipients',
	...requireViewer,
	reportRecipientsCtrl.getRecipients,
);

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
router.put(
	'/report-recipients/:id',
	...requireManager,
	reportRecipientsCtrl.updateRecipient,
);

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
router.delete(
	'/report-recipients/:id',
	...requireAdmin,
	reportRecipientsCtrl.deleteRecipient,
);

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
router.put(
	'/email-schedule',
	...requireAdmin,
	emailScheduleCtrl.updateSchedule,
);

// ── Farms ─────────────────────────────────────────────────────────────────────
router.get('/farms/active', ...requireViewer, farmsCtrl.getActiveFarms); // for purchase dropdown
router.get('/farms', ...requireManager, farmsCtrl.getFarms); // full list with inactive
router.post(
	'/farms',
	...requireManager,
	validate({ name: { required: true } }),
	farmsCtrl.createFarm,
);
router.put('/farms/:id', ...requireManager, farmsCtrl.updateFarm);
router.delete('/farms/:id', ...requireAdmin, farmsCtrl.deleteFarm);

// ════════════════════════════════════════════════════════════
//  BANK ACCOUNTS  (admin manages; manager+ reads)
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/bank-accounts:
 *   get:
 *     summary: List bank accounts (manager+)
 *     description: Returns active accounts. Admin callers also see inactive accounts. Balance is computed dynamically from approved transactions.
 *     tags: [Bank]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Bank accounts list
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
 *                       id:            { type: integer }
 *                       bankName:      { type: string }
 *                       accountName:   { type: string }
 *                       accountNumber: { type: string }
 *                       branch:        { type: string, nullable: true }
 *                       isActive:      { type: boolean }
 *                       balance:       { type: number, format: float, description: 'GHS — approved deposits minus approved withdrawals' }
 *                       createdAt:     { type: string, format: date-time }
 *                       updatedAt:     { type: string, format: date-time }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/bank-accounts', ...requireManager, bankCtrl.getAccounts);

/**
 * @openapi
 * /api/bank-accounts:
 *   post:
 *     summary: Create a bank account (admin only)
 *     tags: [Bank]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bankName, accountName, accountNumber]
 *             properties:
 *               bankName:      { type: string, example: 'GCB Bank' }
 *               accountName:   { type: string, example: 'Tenderbite Farms Ltd' }
 *               accountNumber: { type: string, example: '1234567890' }
 *               branch:        { type: string, example: 'Kumasi Main' }
 *     responses:
 *       201: { description: Bank account created }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
	'/bank-accounts',
	...requireManager,
	validate({
		bankName: { required: true },
		accountName: { required: true },
		accountNumber: { required: true },
	}),
	bankCtrl.createAccount,
);

/**
 * @openapi
 * /api/bank-accounts/{id}:
 *   put:
 *     summary: Update a bank account (admin only)
 *     description: Any combination of bankName, accountName, accountNumber, branch, and isActive may be patched.
 *     tags: [Bank]
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
 *           schema:
 *             type: object
 *             properties:
 *               bankName:      { type: string }
 *               accountName:   { type: string }
 *               accountNumber: { type: string }
 *               branch:        { type: string }
 *               isActive:      { type: boolean }
 *     responses:
 *       200: { description: Bank account updated }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: Account not found }
 */
router.put('/bank-accounts/:id', ...requireAdmin, bankCtrl.updateAccount);

// ════════════════════════════════════════════════════════════
//  BANK TRANSACTIONS
// ════════════════════════════════════════════════════════════

/**
 * @openapi
 * /api/bank-transactions:
 *   get:
 *     summary: List bank transactions (manager+)
 *     tags: [Bank]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: bankAccountId
 *         schema: { type: integer }
 *         description: Filter by account
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [deposit, withdrawal] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected] }
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Transaction list
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
 *                       id:              { type: integer }
 *                       bankAccountId:   { type: integer }
 *                       bankName:        { type: string }
 *                       accountName:     { type: string }
 *                       accountNumber:   { type: string }
 *                       type:            { type: string, enum: [deposit, withdrawal] }
 *                       amount:          { type: number }
 *                       description:     { type: string, nullable: true }
 *                       reference:       { type: string, nullable: true }
 *                       status:          { type: string, enum: [pending, approved, rejected] }
 *                       transactionDate: { type: string, format: date }
 *                       createdAt:       { type: string, format: date-time }
 *                       initiatedByName: { type: string }
 *                       approvedByName:  { type: string, nullable: true }
 *                       approvedAt:      { type: string, format: date-time, nullable: true }
 *                       rejectedAt:      { type: string, format: date-time, nullable: true }
 *                       rejectionNote:   { type: string, nullable: true }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/bank-transactions', ...requireManager, bankCtrl.getTransactions);

/**
 * @openapi
 * /api/bank-transactions/deposit:
 *   post:
 *     summary: Record a deposit (manager+)
 *     description: Deposits are auto-approved and immediately increase the account balance.
 *     tags: [Bank]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bankAccountId, amount]
 *             properties:
 *               bankAccountId:   { type: integer }
 *               amount:          { type: number, minimum: 0.01, description: 'GHS' }
 *               description:     { type: string }
 *               reference:       { type: string }
 *               transactionDate: { type: string, format: date }
 *     responses:
 *       201: { description: Deposit recorded }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
	'/bank-transactions/deposit',
	...requireManager,
	validate({
		bankAccountId: { required: true, type: 'number', min: 1 },
		amount: { required: true, type: 'number', min: 0.01 },
	}),
	bankCtrl.deposit,
);

/**
 * @openapi
 * /api/bank-transactions/withdrawal:
 *   post:
 *     summary: Request or record a withdrawal (manager+)
 *     description: >
 *       Manager submissions create a **pending** withdrawal that an admin must approve before it
 *       affects the balance. Admin submissions are auto-approved immediately.
 *       Rejected or pending withdrawals do not reduce the balance.
 *     tags: [Bank]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bankAccountId, amount]
 *             properties:
 *               bankAccountId:   { type: integer }
 *               amount:          { type: number, minimum: 0.01, description: 'GHS' }
 *               description:     { type: string }
 *               reference:       { type: string }
 *               transactionDate: { type: string, format: date }
 *     responses:
 *       201:
 *         description: Withdrawal recorded (pending or approved depending on caller role)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:  { type: boolean }
 *                 message:  { type: string }
 *                 data:     { type: object }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
	'/bank-transactions/withdrawal',
	...requireManager,
	validate({
		bankAccountId: { required: true, type: 'number', min: 1 },
		amount: { required: true, type: 'number', min: 0.01 },
	}),
	bankCtrl.withdrawal,
);

/**
 * @openapi
 * /api/bank-transactions/{id}/approve:
 *   put:
 *     summary: Approve a pending withdrawal (admin only)
 *     tags: [Bank]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: BankTransaction ID
 *     responses:
 *       200: { description: Withdrawal approved }
 *       400: { description: Not a pending withdrawal }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: Transaction not found }
 */
router.put(
	'/bank-transactions/:id/approve',
	...requireAdmin,
	bankCtrl.approveWithdrawal,
);

/**
 * @openapi
 * /api/bank-transactions/{id}/reject:
 *   put:
 *     summary: Reject a pending withdrawal (admin only)
 *     tags: [Bank]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: BankTransaction ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rejectionNote: { type: string, description: 'Reason for rejection' }
 *     responses:
 *       200: { description: Withdrawal rejected }
 *       400: { description: Not a pending withdrawal }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: Transaction not found }
 */
router.put(
	'/bank-transactions/:id/reject',
	...requireAdmin,
	bankCtrl.rejectWithdrawal,
);

module.exports = router;
