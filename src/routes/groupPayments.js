const express = require('express');
const authMiddleware = require('../middleware/auth');
const {
  createGroupPayment,
  getUserGroupPayments,
  getGroupPaymentById,
  addMemberToGroup,
  removeMemberFromGroup,
  contributeToGroup,
  sendGroupReminder,
  updateGroupPayment,
  cancelGroupPayment
} = require('../controllers/groupPaymentController');

const router = express.Router();

// Create a new group payment
router.post('/', authMiddleware, createGroupPayment);

// Get user's group payments
router.get('/', authMiddleware, getUserGroupPayments);

// Get group payment by ID
router.get('/:groupId', authMiddleware, getGroupPaymentById);

// Update group payment
router.put('/:groupId', authMiddleware, updateGroupPayment);

// Cancel group payment
router.post('/:groupId/cancel', authMiddleware, cancelGroupPayment);

// Add member to group
router.post('/:groupId/members', authMiddleware, addMemberToGroup);

// Remove member from group
router.delete('/:groupId/members/:memberId', authMiddleware, removeMemberFromGroup);

// Contribute to group
router.post('/:groupId/contribute', authMiddleware, contributeToGroup);

// Send reminder to group members
router.post('/:groupId/reminder', authMiddleware, sendGroupReminder);

module.exports = router;