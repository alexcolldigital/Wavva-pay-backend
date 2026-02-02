const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - phone
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               phone:
 *                 type: string
 *                 pattern: '^\\+234[0-9]{10}$'
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 */
router.post('/register', (req, res) => {
  // Implementation handled by existing auth middleware
});

/**
 * @swagger
 * /api/auth/kyc-upgrade:
 *   post:
 *     summary: Upgrade KYC tier
 *     tags: [KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bvn:
 *                 type: string
 *                 pattern: '^[0-9]{11}$'
 *               nin:
 *                 type: string
 *                 pattern: '^[0-9]{11}$'
 *               targetTier:
 *                 type: integer
 *                 enum: [2, 3]
 *     responses:
 *       200:
 *         description: KYC upgrade successful
 *       400:
 *         description: Invalid documents
 */
router.post('/kyc-upgrade', (req, res) => {
  // KYC upgrade implementation
});

module.exports = router;