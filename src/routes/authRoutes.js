const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Entry point: Redirects user to LinkedIn authentication screen
router.get('/linkedin', authController.redirectToLinkedIn);

// Callback receiver: LinkedIn redirects back here with access codes
router.get('/linkedin/callback', authController.handleCallback);

module.exports = router;
