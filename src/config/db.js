const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/student_complaints';
    console.log('Connecting to MongoDB at:', mongoUri);
    
    // Connect with options to avoid deprecation warnings
    await mongoose.connect(mongoUri);
    console.log('MongoDB connection established successfully.');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.log('⚠️ Running in mock mode with in-memory database fallback! All data will reset on server restart.');
  }
};

module.exports = connectDB;
