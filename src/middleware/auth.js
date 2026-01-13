const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    
    // Get user and check if email is verified (except for verification endpoints)
    if (!req.path.includes('/auth/verify') && !req.path.includes('/auth/resend')) {
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      if (!user.emailVerified) {
        return res.status(403).json({ 
          error: 'Email verification required',
          requiresEmailVerification: true,
          userEmail: user.email
        });
      }
    }
    
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authMiddleware;
