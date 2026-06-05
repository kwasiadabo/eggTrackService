const svc = require('../services/customersService');

async function getCustomers(req, res, next) {
	try {
		res.json({ success: true, data: await svc.getAllCustomers() });
	} catch (e) {
		next(e);
	}
}
async function getCustomer(req, res, next) {
	try {
		res.json({ success: true, data: await svc.getCustomerById(req.params.id) });
	} catch (e) {
		next(e);
	}
}
async function createCustomer(req, res, next) {
	try {
		res.status(201).json({
			success: true,
			message: 'Customer created',
			data: await svc.createCustomer(req.body),
		});
	} catch (e) {
		next(e);
	}
}
async function updateCustomer(req, res, next) {
	try {
		res.json({
			success: true,
			message: 'Customer updated',
			data: await svc.updateCustomer(req.params.id, req.body),
		});
	} catch (e) {
		next(e);
	}
}
async function deleteCustomer(req, res, next) {
	try {
		await svc.deleteCustomer(req.params.id, req.user.sub);
		res.json({ success: true, message: 'Customer deleted' });
	} catch (e) {
		next(e);
	}
}

async function getCustomerStatement(req, res, next) {
	try {
		const { customerId, dateFrom, dateTo } = req.query;
		if (!customerId) {
			return res.status(400).json({ success: false, message: 'customerId is required' });
		}
		res.json({
			success: true,
			data: await svc.getCustomerStatement(customerId, dateFrom, dateTo),
		});
	} catch (e) {
		next(e);
	}
}
module.exports = {
	getCustomers,
	getCustomer,
	createCustomer,
	updateCustomer,
	deleteCustomer,
	getCustomerStatement,
};
