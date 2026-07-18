const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_access_key_123456';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_key_789012';

const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id || user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id || user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

const sendTokens = (res, user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Cookie options
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    secure: isProduction,
    sameSite: isProduction ? 'None' : 'Lax',
    path: '/'
  };

  // Set the refresh token in cookie
  res.cookie('refreshToken', refreshToken, cookieOptions);

  return accessToken;
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  sendTokens,
  JWT_SECRET,
  JWT_REFRESH_SECRET
};
