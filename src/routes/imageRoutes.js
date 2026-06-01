const express = require('express');
const router = express.Router();
const imageController = require('../controllers/imageController');

// Define REST API routes for images
router.get('/', imageController.listImages);
router.post('/presign', imageController.generatePresignedUrl);
router.post('/confirm', imageController.confirmUpload);

module.exports = router;
