const express = require('express');
const passport = require('passport');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiter');
const { sendTokens } = require('../utils/token');

const router = express.Router();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Local Auth routes
router.post('/signup', authLimiter, authController.signup);
router.post('/login', authLimiter, authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refreshToken);
router.post('/verify-email', authController.verifyEmail);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Profile
router.get('/me', protect, authController.getMe);
router.put('/me', protect, authController.updateProfile);

// Helper for Mock OAuth redirection
const handleMockOAuth = (provider) => {
  return async (req, res) => {
    console.log(`⚠️ Using Mock OAuth strategy for provider: ${provider}`);
    const mockProfileId = `${provider}_user_${Date.now().toString().slice(-6)}`;
    const email = provider === 'google' ? 'sme@gmail.com' : `${provider}_test_user@example.com`;
    
    // Check if user exists in DB or mock list
    let user;
    const isDbConnected = require('mongoose').connection.readyState === 1;
    
    if (isDbConnected) {
      const User = require('../models/User');
      user = await User.findOne({ provider, providerId: mockProfileId });
      if (!user) {
        // Link or create
        user = await User.findOne({ email });
        if (user) {
          user.provider = provider;
          user.providerId = mockProfileId;
          await user.save();
        } else {
          // Ensure username is unique to prevent duplicate key errors in database
          let username = `${provider}_explorer`;
          let usernameExists = await User.findOne({ username });
          let counter = 1;
          while (usernameExists) {
            username = `${provider}_explorer${counter}`;
            usernameExists = await User.findOne({ username });
            counter++;
          }

          user = await User.create({
            firstName: provider === 'google' ? 'Google' : 'GitHub',
            lastName: 'Explorer',
            username,
            email,
            provider,
            providerId: mockProfileId,
            avatar: provider === 'google'
              ? 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80'
              : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
            isVerified: true,
            role: 'student'
          });
        }
      }
    } else {
      user = authController.mockUsers.find(u => u.provider === provider && u.providerId === mockProfileId);
      if (!user) {
        user = {
          _id: `mock_${provider}_${Date.now()}`,
          firstName: provider === 'google' ? 'Google' : 'GitHub',
          lastName: 'Explorer',
          username: `${provider}_explorer`,
          email,
          provider,
          providerId: mockProfileId,
          avatar: provider === 'google'
            ? 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80'
            : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
          isVerified: true,
          role: 'student',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        authController.mockUsers.push(user);
      }
    }

    const accessToken = sendTokens(res, user);
    // Redirect to frontend OAuth success page with token
    res.redirect(`${CLIENT_URL}/oauth-success?token=${accessToken}`);
  };
};

// --- Google Authentication Route ---
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (googleClientId && googleClientSecret) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  
  router.get(
    '/google/callback',
    passport.authenticate('google', { failureRedirect: `${CLIENT_URL}/oauth-failure`, session: false }),
    (req, res) => {
      const accessToken = sendTokens(res, req.user);
      res.redirect(`${CLIENT_URL}/oauth-success?token=${accessToken}`);
    }
  );
} else {
  // Mock Google Authentication when API keys are missing
  router.get('/google', handleMockOAuth('google'));
  router.get('/google/callback', (req, res) => res.redirect(`${CLIENT_URL}/oauth-failure`));
}

// --- GitHub Authentication Route ---
const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

if (githubClientId && githubClientSecret) {
  router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
  
  router.get(
    '/github/callback',
    passport.authenticate('github', { failureRedirect: `${CLIENT_URL}/oauth-failure`, session: false }),
    (req, res) => {
      const accessToken = sendTokens(res, req.user);
      res.redirect(`${CLIENT_URL}/oauth-success?token=${accessToken}`);
    }
  );
} else {
  // Mock GitHub Authentication when API keys are missing
  router.get('/github', handleMockOAuth('github'));
  router.get('/github/callback', (req, res) => res.redirect(`${CLIENT_URL}/oauth-failure`));
}

module.exports = router;
