const User = require('../models/User');
const Transaction = require('../models/Transaction');
const SupportTicket = require('../models/SupportTicket');
const Issue = require('../models/Issue');
const logger = require('../utils/logger');

// ===== DASHBOARD FUNCTIONS =====

// Get Rep Dashboard Stats
const getDashboardStats = async (req, res) => {
  try {
    const repId = req.userId;

    // Get assigned customers count
    const assignedCustomers = await User.countDocuments({ assignedRep: repId });

    // Get active tickets count
    const activeTickets = await SupportTicket.countDocuments({
      assignedTo: repId,
      status: { $in: ['open', 'in_progress'] }
    });

    // Get resolved tickets this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const resolvedThisMonth = await SupportTicket.countDocuments({
      assignedTo: repId,
      status: 'resolved',
      updatedAt: { $gte: startOfMonth }
    });

    // Get average response time (in hours)
    const avgResponseTime = await SupportTicket.aggregate([
      { $match: { assignedTo: repId, status: 'resolved' } },
      {
        $group: {
          _id: null,
          avgResponseTime: { $avg: { $divide: [{ $subtract: ['$updatedAt', '$createdAt'] }, 1000 * 60 * 60] } }
        }
      }
    ]);

    res.json({
      assignedCustomers,
      activeTickets,
      resolvedThisMonth,
      avgResponseTime: avgResponseTime[0]?.avgResponseTime || 0
    });
  } catch (err) {
    logger.error('Rep dashboard stats fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

// ===== CUSTOMER MANAGEMENT FUNCTIONS =====

// Get Assigned Customers
const getAssignedCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', kycStatus = '' } = req.query;
    const repId = req.userId;

    // Build query
    const query = { assignedRep: repId };
    if (status && status !== 'all') query.status = status;
    if (kycStatus && kycStatus !== 'all') query.kycStatus = kycStatus;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const customers = await User.find(query)
      .populate('wallet', 'balance')
      .select('firstName lastName email username phone status kycStatus createdAt lastLogin assignedRep')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip);

    const total = await User.countDocuments(query);

    res.json({
      customers,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    logger.error('Assigned customers fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch assigned customers' });
  }
};

// Get Customer Details
const getCustomerDetails = async (req, res) => {
  try {
    const { customerId } = req.params;
    const repId = req.userId;

    // Verify customer is assigned to this rep
    const customer = await User.findOne({
      _id: customerId,
      assignedRep: repId
    }).populate('wallet', 'balance type');

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or not assigned to you' });
    }

    // Get customer transaction history
    const transactions = await Transaction.find({
      $or: [{ sender: customerId }, { receiver: customerId }]
    })
    .populate('sender', 'firstName lastName')
    .populate('receiver', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(10);

    res.json({
      customer: {
        _id: customer._id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        username: customer.username,
        phone: customer.phone,
        status: customer.status,
        kycStatus: customer.kycStatus,
        wallet: customer.wallet,
        createdAt: customer.createdAt,
        lastLogin: customer.lastLogin
      },
      recentTransactions: transactions
    });
  } catch (err) {
    logger.error('Customer details fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
};

// ===== TICKET MANAGEMENT FUNCTIONS =====

// Get Tickets
const getTickets = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', priority = '', search = '' } = req.query;
    const repId = req.userId;

    // Build query
    const query = { assignedTo: repId };
    if (status && status !== 'all') query.status = status;
    if (priority && priority !== 'all') query.priority = priority;
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const tickets = await SupportTicket.find(query)
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip);

    const total = await SupportTicket.countDocuments(query);

    res.json({
      tickets,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    logger.error('Tickets fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
};

// Get Ticket Details
const getTicketDetails = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const repId = req.userId;

    const ticket = await SupportTicket.findOne({
      _id: ticketId,
      assignedTo: repId
    }).populate('userId', 'firstName lastName email phone');

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found or not assigned to you' });
    }

    res.json({ ticket });
  } catch (err) {
    logger.error('Ticket details fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch ticket details' });
  }
};

// Update Ticket Status
const updateTicketStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, notes } = req.body;
    const repId = req.userId;

    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: ticketId, assignedTo: repId },
      {
        status,
        updatedAt: new Date(),
        $push: {
          responses: {
            userId: repId,
            message: notes || `Status updated to ${status}`,
            isAdmin: false,
            createdAt: new Date()
          }
        }
      },
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found or not assigned to you' });
    }

    res.json({ ticket });
  } catch (err) {
    logger.error('Ticket status update failed', err.message);
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
};

// ===== ISSUE MANAGEMENT FUNCTIONS =====

// Get Issues
const getIssues = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', category = '', search = '' } = req.query;
    const repId = req.userId;

    // Build query - issues can be viewed by assigned rep or all reps for general issues
    const query = {
      $or: [
        { assignedTo: repId },
        { assignedTo: { $exists: false } } // Unassigned issues
      ]
    };

    if (status && status !== 'all') query.status = status;
    if (category && category !== 'all') query.category = category;
    if (search) {
      query.$or = query.$or.map(q => ({
        ...q,
        $and: [{
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
          ]
        }]
      }));
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const issues = await Issue.find(query)
      .populate('customer', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip);

    const total = await Issue.countDocuments(query);

    res.json({
      issues,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    logger.error('Issues fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
};

// ===== REPORTS & ANALYTICS FUNCTIONS =====

// Get Reports
const getReports = async (req, res) => {
  try {
    const { dateRange = '30d', type = 'performance' } = req.query;
    const repId = req.userId;

    let data = {};

    if (type === 'performance') {
      // Get performance metrics
      const dateFilter = getDateFilter(dateRange);

      const ticketsHandled = await SupportTicket.countDocuments({
        assignedTo: repId,
        createdAt: { $gte: dateFilter }
      });

      const resolutionRate = await SupportTicket.aggregate([
        { $match: { assignedTo: repId, createdAt: { $gte: dateFilter } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            resolved: {
              $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
            }
          }
        }
      ]);

      const avgResponseTime = await SupportTicket.aggregate([
        {
          $match: {
            assignedTo: repId,
            status: 'resolved',
            createdAt: { $gte: dateFilter }
          }
        },
        {
          $group: {
            _id: null,
            avgTime: {
              $avg: {
                $divide: [
                  { $subtract: ['$updatedAt', '$createdAt'] },
                  1000 * 60 * 60 // Convert to hours
                ]
              }
            }
          }
        }
      ]);

      data = {
        ticketsHandled,
        resolutionRate: resolutionRate[0] ? (resolutionRate[0].resolved / resolutionRate[0].total) * 100 : 0,
        avgResponseTime: avgResponseTime[0]?.avgTime || 0,
        resolutionTrend: [], // Would need more complex aggregation
        categoryBreakdown: [] // Would need category data
      };
    }

    res.json(data);
  } catch (err) {
    logger.error('Reports fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
};

// ===== EXPORT FUNCTIONS =====

// Export Customers
const exportCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 1000, search = '', status = '', kycStatus = '', format = 'csv' } = req.query;
    const repId = req.userId;

    // Build query
    const query = { assignedRep: repId };
    if (status && status !== 'all') query.status = status;
    if (kycStatus && kycStatus !== 'all') query.kycStatus = kycStatus;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    const customers = await User.find(query)
      .populate('wallet', 'balance')
      .select('firstName lastName email username phone status kycStatus createdAt lastLogin')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    if (format === 'csv') {
      const csvData = customers.map(customer => ({
        'First Name': customer.firstName || '',
        'Last Name': customer.lastName || '',
        'Email': customer.email || '',
        'Username': customer.username || '',
        'Phone': customer.phone || '',
        'Status': customer.status || '',
        'KYC Status': customer.kycStatus || '',
        'Wallet Balance': customer.wallet?.balance || 0,
        'Joined Date': customer.createdAt ? customer.createdAt.toISOString().split('T')[0] : '',
        'Last Login': customer.lastLogin ? customer.lastLogin.toISOString() : ''
      }));

      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(csvData);

      res.header('Content-Type', 'text/csv');
      res.attachment('customers.csv');
      res.send(csv);
    } else {
      // Excel format
      const XLSX = require('xlsx');
      const ws = XLSX.utils.json_to_sheet(customers.map(customer => ({
        'First Name': customer.firstName || '',
        'Last Name': customer.lastName || '',
        'Email': customer.email || '',
        'Username': customer.username || '',
        'Phone': customer.phone || '',
        'Status': customer.status || '',
        'KYC Status': customer.kycStatus || '',
        'Wallet Balance': customer.wallet?.balance || 0,
        'Joined Date': customer.createdAt ? customer.createdAt.toISOString().split('T')[0] : '',
        'Last Login': customer.lastLogin ? customer.lastLogin.toISOString() : ''
      })));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Customers');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment('customers.xlsx');
      res.send(buffer);
    }
  } catch (err) {
    logger.error('Customer export failed', err.message);
    res.status(500).json({ error: 'Failed to export customers' });
  }
};

// Export Tickets
const exportTickets = async (req, res) => {
  try {
    const { page = 1, limit = 1000, status = '', priority = '', search = '', format = 'csv' } = req.query;
    const repId = req.userId;

    // Build query
    const query = { assignedTo: repId };
    if (status && status !== 'all') query.status = status;
    if (priority && priority !== 'all') query.priority = priority;
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const tickets = await SupportTicket.find(query)
      .populate('userId', 'firstName lastName email')
      .select('subject status priority message createdAt updatedAt userId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    if (format === 'csv') {
      const csvData = tickets.map(ticket => ({
        'Subject': ticket.subject || '',
        'Status': ticket.status || '',
        'Priority': ticket.priority || '',
        'Message': ticket.message || '',
        'Customer': ticket.userId ? `${ticket.userId.firstName} ${ticket.userId.lastName}` : '',
        'Customer Email': ticket.userId?.email || '',
        'Created Date': ticket.createdAt ? ticket.createdAt.toISOString() : '',
        'Updated Date': ticket.updatedAt ? ticket.updatedAt.toISOString() : ''
      }));

      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(csvData);

      res.header('Content-Type', 'text/csv');
      res.attachment('tickets.csv');
      res.send(csv);
    } else {
      // Excel format
      const XLSX = require('xlsx');
      const ws = XLSX.utils.json_to_sheet(tickets.map(ticket => ({
        'Subject': ticket.subject || '',
        'Status': ticket.status || '',
        'Priority': ticket.priority || '',
        'Message': ticket.message || '',
        'Customer': ticket.userId ? `${ticket.userId.firstName} ${ticket.userId.lastName}` : '',
        'Customer Email': ticket.userId?.email || '',
        'Created Date': ticket.createdAt ? ticket.createdAt.toISOString() : '',
        'Updated Date': ticket.updatedAt ? ticket.updatedAt.toISOString() : ''
      })));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment('tickets.xlsx');
      res.send(buffer);
    }
  } catch (err) {
    logger.error('Ticket export failed', err.message);
    res.status(500).json({ error: 'Failed to export tickets' });
  }
};

// Export Issues
const exportIssues = async (req, res) => {
  try {
    const { page = 1, limit = 1000, status = '', category = '', search = '', format = 'csv' } = req.query;
    const repId = req.userId;

    // Build query
    const query = {
      $or: [
        { assignedTo: repId },
        { assignedTo: { $exists: false } }
      ]
    };

    if (status && status !== 'all') query.status = status;
    if (category && category !== 'all') query.category = category;
    if (search) {
      query.$or = query.$or.map(q => ({
        ...q,
        $and: [{
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
          ]
        }]
      }));
    }

    const issues = await Issue.find(query)
      .populate('customer', 'firstName lastName email')
      .select('title description status category priority createdAt resolvedAt customer')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    if (format === 'csv') {
      const csvData = issues.map(issue => ({
        'Title': issue.title || '',
        'Description': issue.description || '',
        'Status': issue.status || '',
        'Category': issue.category || '',
        'Priority': issue.priority || '',
        'Customer': issue.customer ? `${issue.customer.firstName} ${issue.customer.lastName}` : '',
        'Customer Email': issue.customer?.email || '',
        'Created Date': issue.createdAt ? issue.createdAt.toISOString() : '',
        'Resolved Date': issue.resolvedAt ? issue.resolvedAt.toISOString() : ''
      }));

      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(csvData);

      res.header('Content-Type', 'text/csv');
      res.attachment('issues.csv');
      res.send(csv);
    } else {
      // Excel format
      const XLSX = require('xlsx');
      const ws = XLSX.utils.json_to_sheet(issues.map(issue => ({
        'Title': issue.title || '',
        'Description': issue.description || '',
        'Status': issue.status || '',
        'Category': issue.category || '',
        'Priority': issue.priority || '',
        'Customer': issue.customer ? `${issue.customer.firstName} ${issue.customer.lastName}` : '',
        'Customer Email': issue.customer?.email || '',
        'Created Date': issue.createdAt ? issue.createdAt.toISOString() : '',
        'Resolved Date': issue.resolvedAt ? issue.resolvedAt.toISOString() : ''
      })));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Issues');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment('issues.xlsx');
      res.send(buffer);
    }
  } catch (err) {
    logger.error('Issue export failed', err.message);
    res.status(500).json({ error: 'Failed to export issues' });
  }
};

// Export Reports
const exportReports = async (req, res) => {
  try {
    const { dateRange = '30d', type = 'performance', format = 'csv' } = req.query;
    const repId = req.userId;

    // Get report data
    const reportData = await getReports({ query: { dateRange, type } }, { userId: repId });

    if (format === 'csv') {
      let csvData = [];

      if (type === 'performance') {
        csvData = [{
          'Metric': 'Tickets Handled',
          'Value': reportData.ticketsHandled || 0
        }, {
          'Metric': 'Resolution Rate (%)',
          'Value': reportData.resolutionRate || 0
        }, {
          'Metric': 'Average Response Time (hours)',
          'Value': reportData.avgResponseTime || 0
        }];
      }

      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(csvData);

      res.header('Content-Type', 'text/csv');
      res.attachment(`rep-report-${type}-${dateRange}.csv`);
      res.send(csv);
    } else {
      // Excel format
      const XLSX = require('xlsx');
      let data = [];

      if (type === 'performance') {
        data = [{
          'Metric': 'Tickets Handled',
          'Value': reportData.ticketsHandled || 0
        }, {
          'Metric': 'Resolution Rate (%)',
          'Value': reportData.resolutionRate || 0
        }, {
          'Metric': 'Average Response Time (hours)',
          'Value': reportData.avgResponseTime || 0
        }];
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reports');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment(`rep-report-${type}-${dateRange}.xlsx`);
      res.send(buffer);
    }
  } catch (err) {
    logger.error('Report export failed', err.message);
    res.status(500).json({ error: 'Failed to export reports' });
  }
};

// Helper function for date filtering
const getDateFilter = (dateRange) => {
  const now = new Date();
  switch (dateRange) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
};

module.exports = {
  getDashboardStats,
  getAssignedCustomers,
  getCustomerDetails,
  getTickets,
  getTicketDetails,
  updateTicketStatus,
  getIssues,
  getReports,
  exportCustomers,
  exportTickets,
  exportIssues,
  exportReports,
};