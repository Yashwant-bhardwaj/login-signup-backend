const Complaint = require('../models/Complaint');
const User = require('../models/User');
const mongoose = require('mongoose');
const { mockUsers } = require('./authController');

// In-memory Database Fallback for Complaints
const mockComplaints = [
  {
    _id: 'mock_complaint_1',
    title: 'AC units not working in Hostel Block B',
    description: 'The AC units in the common room of Hostel Block B have been broken for two weeks. It gets extremely hot in the afternoons.',
    category: 'hostel',
    severity: 'high',
    status: 'in-review',
    student: {
      _id: 'mock_user_1',
      firstName: 'Alex',
      lastName: 'Mercer',
      username: 'alexm',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'
    },
    upvotes: [],
    adminRemarks: 'Maintenance has been notified. Technician scheduled for Friday.',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
  },
  {
    _id: 'mock_complaint_2',
    title: 'Outdated lab equipment in CS Dept',
    description: 'The computers in Lab 4 are still running dual-core processors and slow mechanical drives, causing delays during project compilation.',
    category: 'academics',
    severity: 'medium',
    status: 'pending',
    student: {
      _id: 'mock_user_2',
      firstName: 'Jane',
      lastName: 'Doe',
      username: 'janed',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80'
    },
    upvotes: ['mock_user_1'],
    adminRemarks: '',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
  }
];

const isDbConnected = () => mongoose.connection.readyState === 1;

// Create a new student complaint
exports.createComplaint = async (req, res) => {
  try {
    const { title, description, category, severity } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }

    let newComplaint;

    if (isDbConnected()) {
      newComplaint = await Complaint.create({
        title,
        description,
        category: category || 'other',
        severity: severity || 'medium',
        status: 'pending',
        student: req.user.id,
        upvotes: []
      });
      
      // Populate student details
      newComplaint = await Complaint.findById(newComplaint._id).populate('student', 'firstName lastName username avatar email');
    } else {
      // Find current user profile
      const user = mockUsers.find(u => u.id === req.user.id || u._id === req.user.id) || {
        _id: req.user.id,
        firstName: req.user.firstName || 'Student',
        lastName: req.user.lastName || 'User',
        username: req.user.username || 'student',
        avatar: req.user.avatar || ''
      };

      newComplaint = {
        _id: `mock_complaint_${Date.now()}`,
        title,
        description,
        category: category || 'other',
        severity: severity || 'medium',
        status: 'pending',
        student: {
          _id: user._id || user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          avatar: user.avatar
        },
        upvotes: [],
        adminRemarks: '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mockComplaints.unshift(newComplaint);
    }

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully!',
      complaint: newComplaint
    });
  } catch (error) {
    console.error('Create Complaint Error:', error);
    res.status(500).json({ success: false, message: 'Server error creating complaint' });
  }
};

// Fetch all complaints
exports.getComplaints = async (req, res) => {
  try {
    if (isDbConnected()) {
      const complaints = await Complaint.find()
        .populate('student', 'firstName lastName username avatar email')
        .sort({ createdAt: -1 });
      
      res.status(200).json({ success: true, complaints });
    } else {
      // Return local memory complaints
      // Refresh mock student details in case user avatar/name changed
      const updatedMockComplaints = mockComplaints.map(comp => {
        const studentId = comp.student._id || comp.student.id;
        const matchingUser = mockUsers.find(u => u._id === studentId || u.id === studentId);
        if (matchingUser) {
          comp.student = {
            _id: matchingUser._id,
            firstName: matchingUser.firstName,
            lastName: matchingUser.lastName,
            username: matchingUser.username,
            avatar: matchingUser.avatar
          };
        }
        return comp;
      });

      res.status(200).json({ success: true, complaints: updatedMockComplaints });
    }
  } catch (error) {
    console.error('Get Complaints Error:', error);
    res.status(500).json({ success: false, message: 'Server error loading complaints' });
  }
};

// Toggle upvote on a complaint
exports.upvoteComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (isDbConnected()) {
      const complaint = await Complaint.findById(id);
      if (!complaint) {
        return res.status(404).json({ success: false, message: 'Complaint not found' });
      }

      const upvoteIndex = complaint.upvotes.indexOf(userId);
      if (upvoteIndex > -1) {
        complaint.upvotes.splice(upvoteIndex, 1); // remove upvote
      } else {
        complaint.upvotes.push(userId); // add upvote
      }

      await complaint.save();
      const updated = await Complaint.findById(id).populate('student', 'firstName lastName username avatar');
      res.status(200).json({ success: true, complaint: updated });
    } else {
      const complaint = mockComplaints.find(c => c._id === id);
      if (!complaint) {
        return res.status(404).json({ success: false, message: 'Complaint not found' });
      }

      const upvoteIndex = complaint.upvotes.indexOf(userId);
      if (upvoteIndex > -1) {
        complaint.upvotes.splice(upvoteIndex, 1);
      } else {
        complaint.upvotes.push(userId);
      }
      res.status(200).json({ success: true, complaint });
    }
  } catch (error) {
    console.error('Upvote Error:', error);
    res.status(500).json({ success: false, message: 'Server error upvoting complaint' });
  }
};

// Update complaint status (Admin only / Simulator)
exports.updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminRemarks } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    if (isDbConnected()) {
      const complaint = await Complaint.findById(id);
      if (!complaint) {
        return res.status(404).json({ success: false, message: 'Complaint not found' });
      }

      complaint.status = status;
      if (adminRemarks !== undefined) complaint.adminRemarks = adminRemarks;

      await complaint.save();
      const updated = await Complaint.findById(id).populate('student', 'firstName lastName username avatar');
      res.status(200).json({ success: true, complaint: updated });
    } else {
      const complaint = mockComplaints.find(c => c._id === id);
      if (!complaint) {
        return res.status(404).json({ success: false, message: 'Complaint not found' });
      }

      complaint.status = status;
      if (adminRemarks !== undefined) complaint.adminRemarks = adminRemarks;
      res.status(200).json({ success: true, complaint });
    }
  } catch (error) {
    console.error('Update Status Error:', error);
    res.status(500).json({ success: false, message: 'Server error updating complaint status' });
  }
};
