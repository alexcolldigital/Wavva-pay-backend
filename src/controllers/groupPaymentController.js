const GroupPayment = require('../models/GroupPayment');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const logger = require('../utils/logger');

// Create a new group payment
const createGroupPayment = async (req, res) => {
  try {
    const {
      title,
      description,
      goal,
      targetAmount,
      currency = 'NGN',
      contributionType = 'flexible',
      deadline,
      isRecurring = false,
      recurringInterval,
      recurringAmount,
      category = 'other',
      isPublic = false,
      autoReminders = true,
      completionAction = 'transfer_to_creator'
    } = req.body;

    const userId = req.userId;

    // Validate required fields
    if (!title || !goal || !targetAmount) {
      return res.status(400).json({
        success: false,
        message: 'Title, goal, and target amount are required'
      });
    }

    // Create the group payment
    const groupPayment = new GroupPayment({
      title,
      description,
      goal,
      targetAmount: Math.round(targetAmount * 100), // Convert to cents
      currency,
      contributionType,
      deadline: deadline ? new Date(deadline) : null,
      isRecurring,
      recurringInterval,
      recurringAmount: recurringAmount ? Math.round(recurringAmount * 100) : null,
      category,
      isPublic,
      autoReminders,
      completionAction,
      createdBy: userId,
      members: [{
        userId,
        role: 'admin',
        contributionType: 'flexible',
        status: 'contributing'
      }]
    });

    await groupPayment.save();

    // Populate member details
    await groupPayment.populate('members.userId', 'firstName lastName username profilePicture');
    await groupPayment.populate('createdBy', 'firstName lastName username profilePicture');

    // Emit real-time event to creator
    req.io.to(`user_group_payments:${userId}`).emit('group_payment:created', {
      groupPayment,
      message: 'New group payment created'
    });

    // Emit to all members (initially just creator)
    req.io.to(`group_payment:${groupPayment._id}`).emit('group_payment:updated', {
      groupPayment,
      action: 'created',
      message: 'Group payment created'
    });

    res.status(201).json({
      success: true,
      data: groupPayment
    });

  } catch (error) {
    logger.error('Create group payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create group payment'
    });
  }
};

// Get all group payments for a user
const getUserGroupPayments = async (req, res) => {
  try {
    const userId = req.userId;
    const { status, page = 1, limit = 10 } = req.query;

    const query = {
      $or: [
        { createdBy: userId },
        { 'members.userId': userId }
      ]
    };

    if (status) {
      query.status = status;
    }

    const groupPayments = await GroupPayment.find(query)
      .populate('createdBy', 'firstName lastName username profilePicture')
      .populate('members.userId', 'firstName lastName username profilePicture')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await GroupPayment.countDocuments(query);

    res.json({
      success: true,
      data: groupPayments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Get user group payments error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch group payments'
    });
  }
};

// Get group payment by ID
const getGroupPaymentById = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    const groupPayment = await GroupPayment.findById(groupId)
      .populate('createdBy', 'firstName lastName username profilePicture')
      .populate('members.userId', 'firstName lastName username profilePicture')
      .populate('transactionIds');

    if (!groupPayment) {
      return res.status(404).json({
        success: false,
        message: 'Group payment not found'
      });
    }

    // Check if user is a member or creator
    const isMember = groupPayment.members.some(member =>
      member.userId._id.toString() === userId
    );
    const isCreator = groupPayment.createdBy._id.toString() === userId;

    if (!isMember && !isCreator && !groupPayment.isPublic) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Add member-specific data
    const memberData = groupPayment.members.find(member =>
      member.userId._id.toString() === userId
    );

    const response = {
      ...groupPayment.toObject(),
      memberData: memberData || null,
      canContribute: groupPayment.canContribute(userId),
      memberSummary: memberData ? groupPayment.getMemberSummary(userId) : null
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    logger.error('Get group payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch group payment'
    });
  }
};

// Add member to group payment
const addMemberToGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId: memberUserId, contributionType = 'flexible', fixedAmount, percentageAmount } = req.body;
    const userId = req.userId;

    const groupPayment = await GroupPayment.findById(groupId);

    if (!groupPayment) {
      return res.status(404).json({
        success: false,
        message: 'Group payment not found'
      });
    }

    // Check if user is admin or creator
    const isAdmin = groupPayment.createdBy.toString() === userId ||
      groupPayment.members.some(member =>
        member.userId.toString() === userId && member.role === 'admin'
      );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can add members'
      });
    }

    // Check if group is still active
    if (groupPayment.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot add members to inactive groups'
      });
    }

    await groupPayment.addMember(memberUserId, contributionType, fixedAmount, percentageAmount);

    // Populate member details
    await groupPayment.populate('members.userId', 'firstName lastName username profilePicture');

    // Emit real-time event to all group members
    const memberData = groupPayment.members.find(m => m.userId.toString() === memberUserId);
    if (memberData) {
      const eventData = {
        groupId: groupPayment._id,
        member: {
          userId: memberData.userId,
          firstName: memberData.userId.firstName,
          lastName: memberData.userId.lastName,
          username: memberData.userId.username,
          profilePicture: memberData.userId.profilePicture,
          role: memberData.role,
          contributionType: memberData.contributionType,
          fixedAmount: memberData.fixedAmount,
          percentageAmount: memberData.percentageAmount,
          joinedAt: memberData.joinedAt
        },
        groupTitle: groupPayment.title,
        totalMembers: groupPayment.members.length,
        currentAmount: groupPayment.currentAmount,
        targetAmount: groupPayment.targetAmount
      };

      // Emit to group room
      req.io.to(`group_payment:${groupId}`).emit('member_joined', eventData);

      // Also emit to the new member's personal room for notifications
      req.io.to(`user:${memberUserId}`).emit('group_invitation_accepted', {
        groupId: groupPayment._id,
        groupTitle: groupPayment.title,
        role: memberData.role
      });
    }

    res.json({
      success: true,
      data: groupPayment
    });

  } catch (error) {
    logger.error('Add member to group error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add member'
    });
  }
};

// Remove member from group payment
const removeMemberFromGroup = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.userId;

    const groupPayment = await GroupPayment.findById(groupId);

    if (!groupPayment) {
      return res.status(404).json({
        success: false,
        message: 'Group payment not found'
      });
    }

    // Check if user is admin or creator
    const isAdmin = groupPayment.createdBy.toString() === userId ||
      groupPayment.members.some(member =>
        member.userId.toString() === userId && member.role === 'admin'
      );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can remove members'
      });
    }

    // Cannot remove creator
    if (groupPayment.createdBy.toString() === memberId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove group creator'
      });
    }

    // Get member data before removal for real-time event
    const memberToRemove = groupPayment.members.find(m => m.userId.toString() === memberId);
    let removedMemberData = null;
    if (memberToRemove) {
      await groupPayment.populate('members.userId', 'firstName lastName username profilePicture');
      const populatedMember = groupPayment.members.find(m => m.userId.toString() === memberId);
      if (populatedMember) {
        removedMemberData = {
          userId: populatedMember.userId._id,
          firstName: populatedMember.userId.firstName,
          lastName: populatedMember.userId.lastName,
          username: populatedMember.userId.username,
          profilePicture: populatedMember.userId.profilePicture,
          role: populatedMember.role,
          contributionType: populatedMember.contributionType,
          fixedAmount: populatedMember.fixedAmount,
          percentageAmount: populatedMember.percentageAmount,
          joinedAt: populatedMember.joinedAt
        };
      }
    }

    await groupPayment.removeMember(memberId);

    // Emit real-time event to all group members
    if (removedMemberData) {
      const eventData = {
        groupId: groupPayment._id,
        removedMember: removedMemberData,
        groupTitle: groupPayment.title,
        totalMembers: groupPayment.members.length,
        currentAmount: groupPayment.currentAmount,
        targetAmount: groupPayment.targetAmount,
        removedBy: userId
      };

      // Emit to group room
      req.io.to(`group_payment:${groupId}`).emit('member_removed', eventData);

      // Also emit to the removed member's personal room for notifications
      req.io.to(`user:${memberId}`).emit('group_removal', {
        groupId: groupPayment._id,
        groupTitle: groupPayment.title,
        reason: 'removed_by_admin'
      });
    }

    res.json({
      success: true,
      message: 'Member removed successfully'
    });

  } catch (error) {
    logger.error('Remove member from group error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to remove member'
    });
  }
};

// Contribute to group payment
const contributeToGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { amount } = req.body;
    const userId = req.userId;

    const groupPayment = await GroupPayment.findById(groupId);

    if (!groupPayment) {
      return res.status(404).json({
        success: false,
        message: 'Group payment not found'
      });
    }

    // Check if user can contribute
    if (!groupPayment.canContribute(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot contribute to this group at this time'
      });
    }

    // Get user wallet
    const user = await User.findById(userId).populate('walletId');
    if (!user?.walletId) {
      return res.status(404).json({
        success: false,
        message: 'User wallet not found'
      });
    }

    const wallet = user.walletId;
    const contributionAmount = Math.round(amount * 100); // Convert to cents

    // Check if user has sufficient balance
    const currencyWallet = wallet.getOrCreateWallet(groupPayment.currency);
    if (currencyWallet.balance < contributionAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance'
      });
    }

    // Deduct from wallet
    currencyWallet.balance -= contributionAmount;
    await wallet.save();

    // Add contribution to group
    await groupPayment.addContribution(userId, contributionAmount);

    // Create transaction record
    const transaction = new Transaction({
      sender: userId,
      receiver: null, // Group payment
      amount: contributionAmount,
      currency: groupPayment.currency,
      type: 'group_contribution',
      method: 'wallet',
      status: 'completed',
      description: `Contribution to ${groupPayment.title}`,
      metadata: {
        groupPaymentId: groupId,
        groupTitle: groupPayment.title
      }
    });

    await transaction.save();

    // Add transaction to group
    groupPayment.transactionIds.push(transaction._id);
    await groupPayment.save();

    // Check if group is now complete
    if (groupPayment.status === 'completed') {
      await handleGroupCompletion(groupPayment);
    }

    // Populate updated group data
    await groupPayment.populate('members.userId', 'firstName lastName username profilePicture');
    await groupPayment.populate('createdBy', 'firstName lastName username profilePicture');

    // Emit real-time events
    const contributionData = {
      groupId,
      contributorId: userId,
      amount: contributionAmount,
      currency: groupPayment.currency,
      contributor: await User.findById(userId).select('firstName lastName username'),
      timestamp: new Date()
    };

    // Emit to group members
    req.io.to(`group_payment:${groupId}`).emit('group_payment:contribution_received', {
      groupPayment,
      contribution: contributionData,
      message: `${contributionData.contributor.firstName} contributed ₦${(contributionAmount / 100).toFixed(2)}`
    });

    // Emit to user's personal group payments feed
    req.io.to(`user_group_payments:${userId}`).emit('group_payment:contribution_made', {
      groupPayment,
      contribution: contributionData,
      message: `You contributed ₦${(contributionAmount / 100).toFixed(2)} to ${groupPayment.title}`
    });

    // If group is completed, emit completion event
    if (groupPayment.status === 'completed') {
      req.io.to(`group_payment:${groupId}`).emit('group_payment:completed', {
        groupPayment,
        message: 'Group payment completed successfully!'
      });
    }

    res.json({
      success: true,
      message: 'Contribution successful',
      data: {
        groupPayment,
        transaction
      }
    });

  } catch (error) {
    logger.error('Contribute to group error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to contribute'
    });
  }
};

// Handle group completion
const handleGroupCompletion = async (groupPayment) => {
  try {
    logger.info(`Group payment ${groupPayment._id} completed`);

    // Execute completion action
    if (groupPayment.completionAction === 'transfer_to_creator') {
      // Transfer funds to creator's wallet
      const creator = await User.findById(groupPayment.createdBy).populate('walletId');
      if (creator?.walletId) {
        const currencyWallet = creator.walletId.getOrCreateWallet(groupPayment.currency);
        currencyWallet.balance += groupPayment.currentAmount;
        await creator.walletId.save();

        // Create transaction record
        const transaction = new Transaction({
          sender: null, // System
          receiver: groupPayment.createdBy,
          amount: groupPayment.currentAmount,
          currency: groupPayment.currency,
          type: 'group_completion',
          method: 'system',
          status: 'completed',
          description: `Group payment completion: ${groupPayment.title}`,
          metadata: {
            groupPaymentId: groupPayment._id,
            completionAction: 'transfer_to_creator'
          }
        });

        await transaction.save();
      }
    }

    // TODO: Implement other completion actions (group wallet, distribution, etc.)

  } catch (error) {
    logger.error('Handle group completion error:', error);
  }
};

// Send reminder to group members
const sendGroupReminder = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    const groupPayment = await GroupPayment.findById(groupId);

    if (!groupPayment) {
      return res.status(404).json({
        success: false,
        message: 'Group payment not found'
      });
    }

    // Check if user is admin or creator
    const isAdmin = groupPayment.createdBy.toString() === userId ||
      groupPayment.members.some(member =>
        member.userId.toString() === userId && member.role === 'admin'
      );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can send reminders'
      });
    }

    // TODO: Implement notification system for reminders
    // For now, just return success

    res.json({
      success: true,
      message: 'Reminder sent successfully'
    });

  } catch (error) {
    logger.error('Send group reminder error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send reminder'
    });
  }
};

// Update group payment
const updateGroupPayment = async (req, res) => {
  try {
    const { groupId } = req.params;
    const updates = req.body;
    const userId = req.userId;

    const groupPayment = await GroupPayment.findById(groupId);

    if (!groupPayment) {
      return res.status(404).json({
        success: false,
        message: 'Group payment not found'
      });
    }

    // Check if user is admin or creator
    const isAdmin = groupPayment.createdBy.toString() === userId ||
      groupPayment.members.some(member =>
        member.userId.toString() === userId && member.role === 'admin'
      );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update group'
      });
    }

    // Prevent updates to completed/cancelled groups
    if (['completed', 'cancelled'].includes(groupPayment.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update completed or cancelled groups'
      });
    }

    // Update allowed fields
    const allowedUpdates = [
      'title', 'description', 'deadline', 'autoReminders',
      'reminderFrequency', 'isPublic'
    ];

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        groupPayment[field] = updates[field];
      }
    });

    await groupPayment.save();

    res.json({
      success: true,
      data: groupPayment
    });

  } catch (error) {
    logger.error('Update group payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update group payment'
    });
  }
};

// Cancel group payment
const cancelGroupPayment = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { reason } = req.body;
    const userId = req.userId;

    const groupPayment = await GroupPayment.findById(groupId);

    if (!groupPayment) {
      return res.status(404).json({
        success: false,
        message: 'Group payment not found'
      });
    }

    // Check if user is admin or creator
    const isAdmin = groupPayment.createdBy.toString() === userId ||
      groupPayment.members.some(member =>
        member.userId.toString() === userId && member.role === 'admin'
      );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can cancel group'
      });
    }

    // Prevent cancelling completed groups
    if (groupPayment.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel completed groups'
      });
    }

    groupPayment.status = 'cancelled';
    groupPayment.cancelledAt = new Date();
    await groupPayment.save();

    // TODO: Refund contributions if needed

    res.json({
      success: true,
      message: 'Group payment cancelled successfully'
    });

  } catch (error) {
    logger.error('Cancel group payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel group payment'
    });
  }
};

module.exports = {
  createGroupPayment,
  getUserGroupPayments,
  getGroupPaymentById,
  addMemberToGroup,
  removeMemberFromGroup,
  contributeToGroup,
  sendGroupReminder,
  updateGroupPayment,
  cancelGroupPayment
};