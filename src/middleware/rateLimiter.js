try {
  const rateLimit = require('express-rate-limit');

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      success: false,
      message: 'Too many authentication attempts from this IP, please try again after 15 minutes.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });

  const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 300,
    message: {
      success: false,
      message: 'Too many requests, please slow down.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  module.exports = { authLimiter, apiLimiter };
} catch (error) {
  console.warn('Rate limiting libraries not configured or failed to load. Using dummy rate limiters.');
  
  const dummyLimiter = (req, res, next) => next();
  module.exports = { authLimiter: dummyLimiter, apiLimiter: dummyLimiter };
}
