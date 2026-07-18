const dotenv = require('dotenv');
const path = require('path');
// Load environment variables immediately, overriding any existing system env variables, using absolute path
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const passport = require('./config/passport');

const app = express();
const PORT = process.env.PORT || 5060;

// Connect to Database
connectDB();

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false, // Allows loading resources across domains (e.g. avatars)
}));

// CORS Configuration
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({
  origin: clientUrl,
  credentials: true, // Enables cookies to be exchanged across domains
  optionsSuccessStatus: 200
}));

// Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'cookie_secret_passphrase_321'));

// Initialize Passport Session (not strictly needed since we use JWT, but good for strategy initialization)
app.use(passport.initialize());

// Routes
const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);

// Root Endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Premium Student Voice Auth Portal API',
    dbConnected: require('mongoose').connection.readyState === 1,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Handle 404
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'Resource not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`👉 Client application address configured at: ${clientUrl}`);
});
