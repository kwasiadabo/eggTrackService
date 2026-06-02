const authService = require('../services/authService');

async function register(req, res, next) {
  try {
    const data = await authService.register(req.body);
    res.status(201).json({ success: true, message: 'User registered successfully', data });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const data = await authService.login(req.body);
    res.json({ success: true, message: 'Login successful', ...data });
  } catch (err) { next(err); }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) { return res.status(400).json({ success: false, message: 'refreshToken is required' }); }
    const data = await authService.refresh(refreshToken);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await authService.logout(refreshToken);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) { next(err); }
}

async function getMe(req, res, next) {
  try {
    const data = await authService.getMe(req.user.sub);
    if (!data) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function changePassword(req, res, next) {
  try {
    await authService.changePassword(req.user.sub, req.body);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) { next(err); }
}

// Admin only
async function listUsers(req, res, next) {
  try {
    const data = await authService.listUsers();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    const data = await authService.updateUser(req.params.id, req.body);
    res.json({ success: true, message: 'User updated', data });
  } catch (err) { next(err); }
}

async function listRoles(req, res, next) {
  try {
    const data = await authService.listRoles();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

module.exports = { register, login, refresh, logout, getMe, changePassword, listUsers, updateUser, listRoles };
