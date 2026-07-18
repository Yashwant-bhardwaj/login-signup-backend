const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');
const mongoose = require('mongoose');

// Getter to safely require mockUsers late and avoid circular dependencies
const getMockUsers = () => {
  return require('../controllers/authController').mockUsers;
};

const isDbConnected = () => mongoose.connection.readyState === 1;

// Serialize user into the session (standard passport, though we use JWTs)
passport.serializeUser((user, done) => {
  done(null, user.id || user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    let user;
    if (isDbConnected()) {
      user = await User.findById(id);
    } else {
      user = getMockUsers().find(u => u.id === id || u._id === id);
    }
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Helper function to handle OAuth user creation or linking
const handleOAuthUser = async (profile, provider, done) => {
  try {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    const providerId = profile.id;
    const avatar = profile.photos && profile.photos[0] ? profile.photos[0].value : '';
    
    // Split display name or set fallback
    const displayName = profile.displayName || profile.username || 'OAuth User';
    const nameParts = displayName.split(' ');
    const firstName = nameParts[0] || 'OAuth';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    // 1. Try to find user by provider and providerId
    let user;
    if (isDbConnected()) {
      user = await User.findOne({ provider, providerId });
    } else {
      user = getMockUsers().find(u => u.provider === provider && u.providerId === providerId);
    }

    if (user) {
      return done(null, user);
    }

    // 2. If email is available, try to find user by email
    if (email) {
      if (isDbConnected()) {
        user = await User.findOne({ email });
        if (user) {
          // Link existing account with OAuth details
          user.provider = provider;
          user.providerId = providerId;
          if (!user.avatar) user.avatar = avatar;
          user.isVerified = true; // OAuth email is pre-verified
          await user.save();
          return done(null, user);
        }
      } else {
        user = getMockUsers().find(u => u.email === email);
        if (user) {
          user.provider = provider;
          user.providerId = providerId;
          if (!user.avatar) user.avatar = avatar;
          user.isVerified = true;
          return done(null, user);
        }
      }
    }

    // 3. Create a new user if not found
    // Generate unique username
    let username = (profile.username || email || displayName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
      
    if (isDbConnected()) {
      // Ensure uniqueness in DB
      let usernameExists = await User.findOne({ username });
      let counter = 1;
      while (usernameExists) {
        username = `${username}${counter}`;
        usernameExists = await User.findOne({ username });
        counter++;
      }

      const newUser = await User.create({
        firstName,
        lastName,
        username,
        email: email || `${providerId}@${provider}.mock.com`,
        provider,
        providerId,
        avatar,
        isVerified: true,
        role: 'student'
      });
      return done(null, newUser);
    } else {
      // Ensure uniqueness in Memory
      const mockUsers = getMockUsers();
      let usernameExists = mockUsers.find(u => u.username === username);
      let counter = 1;
      while (usernameExists) {
        username = `${username}${counter}`;
        usernameExists = mockUsers.find(u => u.username === username);
        counter++;
      }

      const newUser = {
        _id: `mock_${provider}_${Date.now()}`,
        id: `mock_${provider}_${Date.now()}`,
        firstName,
        lastName,
        username,
        email: email || `${providerId}@${provider}.mock.com`,
        provider,
        providerId,
        avatar,
        isVerified: true,
        role: 'student',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mockUsers.push(newUser);
      return done(null, newUser);
    }
  } catch (error) {
    return done(error, null);
  }
};

// Google OAuth Strategy
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';

if (googleClientId && googleClientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL: `${serverUrl}/api/auth/google/callback`,
        proxy: true
      },
      async (accessToken, refreshToken, profile, done) => {
        return handleOAuthUser(profile, 'google', done);
      }
    )
  );
  console.log('✅ Passport: Google OAuth Strategy registered.');
} else {
  console.log('⚠️ Passport: Google OAuth credentials missing. SSO via Google disabled.');
}

// GitHub OAuth Strategy
const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

if (githubClientId && githubClientSecret) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: githubClientId,
        clientSecret: githubClientSecret,
        callbackURL: `${serverUrl}/api/auth/github/callback`,
        proxy: true
      },
      async (accessToken, refreshToken, profile, done) => {
        return handleOAuthUser(profile, 'github', done);
      }
    )
  );
  console.log('✅ Passport: GitHub OAuth Strategy registered.');
} else {
  console.log('⚠️ Passport: GitHub OAuth credentials missing. SSO via GitHub disabled.');
}

module.exports = passport;
