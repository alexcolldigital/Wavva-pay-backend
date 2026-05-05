const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');

// Create support ticket
const createSupportTicket = async (req, res) => {
  try {
    const { subject, message, category, priority = 'medium' } = req.body;
    const userId = req.userId;

    if (!subject || !message || !category) {
      return res.status(400).json({ error: 'Subject, message, and category are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ticket = new SupportTicket({
      userId,
      subject,
      message,
      category,
      priority
    });

    await ticket.save();

    // Emit real-time support update
    const io = require('../server').io;
    if (io) {
      io.to(`user:${userId}`).emit('support:update', {
        type: 'ticket_created',
        ticket: {
          id: ticket._id,
          subject: ticket.subject,
          category: ticket.category,
          status: ticket.status,
          createdAt: ticket.createdAt
        }
      });
    }

    res.status(201).json({
      success: true,
      ticket: {
        id: ticket._id,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt
      },
      message: 'Support ticket created successfully'
    });
  } catch (err) {
    console.error('Create support ticket error:', err);
    res.status(500).json({ error: 'Failed to create support ticket' });
  }
};

// Get user's support tickets
const getSupportTickets = async (req, res) => {
  try {
    const userId = req.userId;
    const { status, limit = 20, offset = 0 } = req.query;

    let query = { userId };
    if (status) {
      query.status = status;
    }

    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .populate('assignedTo', 'firstName lastName');

    const total = await SupportTicket.countDocuments(query);

    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        responses: ticket.responses.length,
        lastResponse: ticket.responses.length > 0 ? ticket.responses[ticket.responses.length - 1] : null,
        assignedTo: ticket.assignedTo,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      })),
      total,
      hasMore: total > parseInt(offset) + tickets.length
    });
  } catch (err) {
    console.error('Get support tickets error:', err);
    res.status(500).json({ error: 'Failed to fetch support tickets' });
  }
};

// Get support ticket details
const getSupportTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.userId;

    const ticket = await SupportTicket.findOne({ _id: ticketId, userId })
      .populate('assignedTo', 'firstName lastName')
      .populate('responses.userId', 'firstName lastName isAdmin');

    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found' });
    }

    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        subject: ticket.subject,
        message: ticket.message,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        responses: ticket.responses,
        attachments: ticket.attachments,
        assignedTo: ticket.assignedTo,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      }
    });
  } catch (err) {
    console.error('Get support ticket error:', err);
    res.status(500).json({ error: 'Failed to fetch support ticket' });
  }
};

// Add response to support ticket
const addSupportResponse = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;
    const userId = req.userId;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const ticket = await SupportTicket.findOne({ _id: ticketId, userId });
    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found' });
    }

    if (ticket.status === 'closed') {
      return res.status(400).json({ error: 'Cannot respond to closed ticket' });
    }

    const user = await User.findById(userId);
    const response = {
      userId,
      message,
      isAdmin: user.isAdmin || false
    };

    ticket.responses.push(response);
    await ticket.save();

    res.json({
      success: true,
      response,
      message: 'Response added successfully'
    });
  } catch (err) {
    console.error('Add support response error:', err);
    res.status(500).json({ error: 'Failed to add response' });
  }
};

// Get support ticket statistics
const getSupportStats = async (req, res) => {
  try {
    const userId = req.userId;

    const stats = await SupportTicket.getTicketStats(userId);

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error('Get support stats error:', err);
    res.status(500).json({ error: 'Failed to fetch support statistics' });
  }
};

module.exports = {
  createSupportTicket,
  getSupportTickets,
  getSupportTicket,
  addSupportResponse,
  getSupportStats
};