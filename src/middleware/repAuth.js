const User = require('../models/User');

const repAuthMiddleware = async (req, res, next) => {
  try {
    // Get user from req.userId (set by authMiddleware)
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if user has customer representative role
    if (user.role !== 'customer_rep' && !user.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Customer representative access required.' });
    }

    // Add user info to request for controllers
    req.user = user;
    next();
  } catch (err) {
    console.error('Rep auth middleware error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
};

module.exports = repAuthMiddleware;