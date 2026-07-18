const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../utils/token');
const User = require('../models/User');

// Middleware to verify JWT token
const protect = async (req, res, next) => {
  let token;

  // Check header or cookies
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, token missing' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Attach decoded user payload to request
    // We can also fetch the user from DB to verify they still exist, but we can do a light fetch
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT Verification Error:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'token_expired' });
    }
    
    return res.status(401).json({ success: false, message: 'Not authorized, token invalid' });
  }
};

// Admin check
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied: Admins only' });
  }
};

module.exports = { protect, adminOnly };
