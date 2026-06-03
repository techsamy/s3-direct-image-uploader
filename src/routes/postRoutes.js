const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');

// Retrieve all posts
router.get('/', postController.getPosts);

// Save a new post draft
router.post('/', postController.createPost);

// Dispatch a draft to the n8n automation webhook
router.post('/:id/send', postController.sendToN8n);

// Webhook callback endpoint for n8n to confirm publication
router.post('/:id/confirm-published', postController.confirmPublished);

module.exports = router;
