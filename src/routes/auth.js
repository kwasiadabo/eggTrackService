const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware');

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: JWT authentication — login, token refresh, logout, profile
 *   - name: Users
 *     description: User management (admin only)
 */

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user (admin only)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:     { type: string, example: Jane Doe }
 *               email:    { type: string, format: email, example: jane@eggtrack.app }
 *               password: { type: string, minLength: 6, example: 'Secure@123' }
 *               roleId:   { type: integer, example: 2, description: '1=admin 2=manager 3=viewer' }
 *     responses:
 *       201: { description: User registered }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: Email already registered }
 */
router.post('/register',
  ...requireAdmin,
  validate({ name: { required: true }, email: { required: true }, password: { required: true } }),
  ctrl.register
);

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     description: Returns a short-lived access token (15 min) and a long-lived refresh token (7 days).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, example: admin@eggtrack.app }
 *               password: { type: string, example: 'Admin@123' }
 *           examples:
 *             admin:   { summary: Admin account,   value: { email: admin@eggtrack.app,   password: 'Admin@123' } }
 *             manager: { summary: Manager account, value: { email: manager@eggtrack.app, password: 'Admin@123' } }
 *             viewer:  { summary: Viewer account,  value: { email: viewer@eggtrack.app,  password: 'Admin@123' } }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:      { type: boolean }
 *                 message:      { type: string }
 *                 accessToken:  { type: string }
 *                 refreshToken: { type: string }
 *                 user:         { $ref: '#/components/schemas/UserProfile' }
 *       401: { description: Invalid credentials }
 */
router.post('/login',
  validate({ email: { required: true }, password: { required: true } }),
  ctrl.login
);

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Rotate tokens using a refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: New token pair issued }
 *       401: { description: Invalid or expired refresh token }
 */
router.post('/refresh', ctrl.refresh);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Revoke refresh token and log out
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Logged out }
 */
router.post('/logout', ctrl.logout);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:    { $ref: '#/components/schemas/UserProfile' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/me', authenticate, ctrl.getMe);

/**
 * @openapi
 * /api/auth/change-password:
 *   put:
 *     summary: Change current user password
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string, minLength: 6 }
 *     responses:
 *       200: { description: Password changed }
 *       400: { description: Current password incorrect }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.put('/change-password',
  authenticate,
  validate({ currentPassword: { required: true }, newPassword: { required: true } }),
  ctrl.changePassword
);

/**
 * @openapi
 * /api/auth/users:
 *   get:
 *     summary: List all users (admin only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of users }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/users', ...requireAdmin, ctrl.listUsers);

/**
 * @openapi
 * /api/auth/users/{id}:
 *   put:
 *     summary: Update a user (admin only)
 *     tags: [Users]
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
 *               name:     { type: string }
 *               email:    { type: string }
 *               roleId:   { type: integer }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: User updated }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { description: User not found }
 */
router.put('/users/:id', ...requireAdmin, ctrl.updateUser);

/**
 * @openapi
 * /api/auth/roles:
 *   get:
 *     summary: List all roles
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of roles }
 */
router.get('/roles', authenticate, ctrl.listRoles);

module.exports = router;
