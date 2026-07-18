const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendTokens, JWT_REFRESH_SECRET } = require('../utils/token');
const sendEmail = require('../utils/sendEmail');
const mongoose = require('mongoose');

// In-memory Database Fallback for Users
const mockUsers = [];

const isDbConnected = () => mongoose.connection.readyState === 1;

// Helper to find a user
const findUserByEmail = async (email) => {
  const normEmail = email.toLowerCase().trim();
  if (isDbConnected()) {
    return await User.findOne({ email: normEmail });
  } else {
    return mockUsers.find(u => u.email === normEmail);
  }
};

const findUserById = async (id) => {
  if (isDbConnected()) {
    return await User.findById(id);
  } else {
    return mockUsers.find(u => u.id === id || u._id === id);
  }
};

const findUserByUsername = async (username) => {
  const normUser = username.toLowerCase().trim();
  if (isDbConnected()) {
    return await User.findOne({ username: normUser });
  } else {
    return mockUsers.find(u => u.username === normUser);
  }
};

// Signup controller
exports.signup = async (req, res) => {
  try {
    const { firstName, lastName, username, email, password } = req.body;

    if (!firstName || !lastName || !username || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check duplicate
    const emailExists = await findUserByEmail(email);
    if (emailExists) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const usernameExists = await findUserByUsername(username);
    if (usernameExists) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create verification token
    const verificationToken = crypto.randomBytes(20).toString('hex');
    const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    let newUser;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const verifyUrl = `${clientUrl}/verify-email?token=${verificationToken}`;

    if (isDbConnected()) {
      newUser = await User.create({
        firstName,
        lastName,
        username: username.toLowerCase().trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        verificationToken,
        verificationTokenExpires,
        isVerified: false,
        role: 'student'
      });
    } else {
      newUser = {
        _id: `mock_user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        firstName,
        lastName,
        username: username.toLowerCase().trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        verificationToken,
        verificationTokenExpires,
        isVerified: false,
        role: 'student',
        provider: 'local',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      // Store in memory
      mockUsers.push(newUser);
    }

    // Send verification email
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #111827; margin-bottom: 16px;">Verify your email address</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 24px;">Welcome to the Student Voice Portal! Please click the button below to verify your email address and activate your account.</p>
        <div style="margin: 32px 0;">
          <a href="${verifyUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 16px; display: inline-block;">Verify Email</a>
        </div>
        <p style="color: #9ca3af; font-size: 14px;">If you didn't register for an account, you can safely ignore this email.</p>
      </div>
    `;

    await sendEmail({
      to: newUser.email,
      subject: 'Verify your Student Voice Account',
      html: emailHtml,
      text: `Verify your email by copying this link: ${verifyUrl}`
    });

    res.status(201).json({
      success: true,
      message: 'Signup successful! Verification email sent. Please check your inbox (or server console logs).'
    });

  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({ success: false, message: 'Server error during signup' });
  }
};

// Login controller
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.provider !== 'local') {
      return res.status(400).json({
        success: false,
        message: `This account was registered using ${user.provider} sign-in. Please use that login method.`
      });
    }

    // Match password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    // Verify verification state
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        isNotVerified: true,
        message: 'Please verify your email address. Check server console logs for the link!'
      });
    }

    // Generate tokens and send cookie
    const accessToken = sendTokens(res, user);

    res.status(200).json({
      success: true,
      accessToken,
      user: {
        id: user._id || user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        provider: user.provider
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// Verify Email controller
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token is missing' });
    }

    let user;

    if (isDbConnected()) {
      user = await User.findOne({
        verificationToken: token,
        verificationTokenExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
      }

      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpires = undefined;
      await user.save();
    } else {
      user = mockUsers.find(
        u => u.verificationToken === token && u.verificationTokenExpires > Date.now()
      );

      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
      }

      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpires = undefined;
    }

    res.status(200).json({
      success: true,
      message: 'Email verified successfully! You can now log in.'
    });

  } catch (error) {
    console.error('Verify Email Error:', error);
    res.status(500).json({ success: false, message: 'Server error during email verification' });
  }
};

// Forgot Password controller
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide your email address' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // Security: return success anyway to hide active user database
      return res.status(200).json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched.'
      });
    }

    if (user.provider !== 'local') {
      return res.status(400).json({
        success: false,
        message: `This account uses ${user.provider} login. Password recovery is only for local accounts.`
      });
    }

    // Generate token
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour

    if (isDbConnected()) {
      const dbUser = await User.findById(user._id);
      dbUser.resetPasswordToken = resetToken;
      dbUser.resetPasswordTokenExpires = resetTokenExpires;
      await dbUser.save();
    } else {
      user.resetPasswordToken = resetToken;
      user.resetPasswordTokenExpires = resetTokenExpires;
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #111827; margin-bottom: 16px;">Reset your password</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 24px;">You requested a password reset. Please click the button below to choose a new password. This link is valid for 1 hour.</p>
        <div style="margin: 32px 0;">
          <a href="${resetUrl}" style="background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 16px; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #9ca3af; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: 'Reset your Student Voice Password',
      html: emailHtml,
      text: `Reset your password by copying this link: ${resetUrl}`
    });

    res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been dispatched.'
    });

  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({ success: false, message: 'Server error during password reset request' });
  }
};

// Reset Password controller
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    let user;
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (isDbConnected()) {
      user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordTokenExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired password reset token' });
      }

      user.password = hashedPassword;
      user.resetPasswordToken = undefined;
      user.resetPasswordTokenExpires = undefined;
      await user.save();
    } else {
      user = mockUsers.find(
        u => u.resetPasswordToken === token && u.resetPasswordTokenExpires > Date.now()
      );

      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid or expired password reset token' });
      }

      user.password = hashedPassword;
      user.resetPasswordToken = undefined;
      user.resetPasswordTokenExpires = undefined;
    }

    res.status(200).json({
      success: true,
      message: 'Password reset successful! You can now log in with your new password.'
    });

  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({ success: false, message: 'Server error during password resetting' });
  }
};

// Silent Refresh Access Token
exports.refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token missing' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Refresh token invalid or expired' });
    }

    const user = await findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const accessToken = sendTokens(res, user);

    res.status(200).json({
      success: true,
      accessToken,
      user: {
        id: user._id || user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        provider: user.provider
      }
    });

  } catch (error) {
    console.error('Refresh Token Error:', error);
    res.status(500).json({ success: false, message: 'Server error during token refresh' });
  }
};

// Logout controller
exports.logout = (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'None' : 'Lax',
    path: '/'
  });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

// Get current authenticated user
exports.getMe = async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id || user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        provider: user.provider
      }
    });
  } catch (error) {
    console.error('Get Me Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching user details' });
  }
};

// Update profile controller
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, username, avatar } = req.body;
    let user;

    if (isDbConnected()) {
      user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (avatar !== undefined) user.avatar = avatar;
      
      if (username && username.toLowerCase().trim() !== user.username) {
        const usernameExists = await User.findOne({ username: username.toLowerCase().trim() });
        if (usernameExists) {
          return res.status(400).json({ success: false, message: 'Username is already taken' });
        }
        user.username = username.toLowerCase().trim();
      }

      await user.save();
    } else {
      user = mockUsers.find(u => u.id === req.user.id || u._id === req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (avatar !== undefined) user.avatar = avatar;

      if (username && username.toLowerCase().trim() !== user.username) {
        const usernameExists = mockUsers.find(u => u.username === username.toLowerCase().trim() && u.id !== user.id);
        if (usernameExists) {
          return res.status(400).json({ success: false, message: 'Username is already taken' });
        }
        user.username = username.toLowerCase().trim();
      }
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: user._id || user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        provider: user.provider
      }
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({ success: false, message: 'Server error updating profile' });
  }
};

// Export mock databases for other controller files
exports.mockUsers = mockUsers;
