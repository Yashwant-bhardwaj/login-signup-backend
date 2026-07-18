const express = require('express');
const complaintController = require('../controllers/complaintController');
const { protect } = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(protect); // Secure all complaint routes

router.get('/', complaintController.getComplaints);
router.post('/', apiLimiter, complaintController.createComplaint);
router.put('/:id/upvote', complaintController.upvoteComplaint);
router.put('/:id/status', complaintController.updateComplaintStatus);

module.exports = router;
