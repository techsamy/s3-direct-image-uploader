const db = require('../config/db');
const linkedinService = require('../services/linkedinService');

/**
 * Retrieves the list of all posts (drafts and published) joined with their S3 images.
 */
async function getPosts(req, res) {
  try {
    const sql = `
      SELECT 
        p.*,
        i.file_name,
        i.image_url,
        i.s3_key
      FROM linkedin_posts p
      LEFT JOIN images i ON p.image_id = i.id
      ORDER BY p.created_at DESC
    `;
    const posts = await db.query(sql);
    res.json(posts);
  } catch (error) {
    console.error('[PostController] Failed to fetch posts:', error.message);
    res.status(500).json({ error: 'Failed to retrieve posts list.' });
  }
}

/**
 * Creates a new post in DRAFT status.
 */
async function createPost(req, res) {
  const { title, content, post_type, external_url, image_id } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Post content (description) is mandatory.' });
  }

  const allowedTypes = ['POST', 'ARTICLE_LINK'];
  const postType = (post_type || 'POST').toUpperCase();
  if (!allowedTypes.includes(postType)) {
    return res.status(400).json({ error: 'Invalid post type. Must be POST or ARTICLE_LINK.' });
  }

  try {
    const sql = `
      INSERT INTO linkedin_posts (
        title, content, image_id, post_type, external_url, status
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT')
    `;

    const result = await db.query(sql, [
      title ? title.trim() : null,
      content.trim(),
      image_id || null,
      postType,
      postType === 'ARTICLE_LINK' && external_url ? external_url.trim() : null
    ]);

    res.status(201).json({
      message: 'Post draft created successfully.',
      postId: result.insertId
    });
  } catch (error) {
    console.error('[PostController] Failed to create post:', error.message);
    res.status(500).json({ error: 'Failed to create post draft.' });
  }
}

/**
 * Triggers the n8n webhook to publish the post.
 */
async function sendToN8n(req, res) {
  const { id } = req.params;

  try {
    // 1. Fetch post joined with S3 image details
    const sql = `
      SELECT 
        p.*,
        i.image_url AS s3_image_url
      FROM linkedin_posts p
      LEFT JOIN images i ON p.image_id = i.id
      WHERE p.id = ? LIMIT 1
    `;
    const posts = await db.query(sql, [id]);

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    const post = posts[0];
    
    // 2. Update status in database to PENDING_N8N (indicates sending in progress)
    await db.query('UPDATE linkedin_posts SET status = "PENDING_N8N", error_message = NULL WHERE id = ?', [id]);

    // 3. Publish directly to LinkedIn API
    try {
      console.log(`[PostController] Direct publishing post ID ${id} to LinkedIn...`);
      const urn = await linkedinService.publishPost(post);
      
      // Update DB to PUBLISHED
      const updateSql = `
        UPDATE linkedin_posts 
        SET 
          status = "PUBLISHED", 
          linkedin_post_urn = ?, 
          published_at = CURRENT_TIMESTAMP,
          error_message = NULL
        WHERE id = ?
      `;
      await db.query(updateSql, [urn, id]);
      
      console.log(`[PostController] Post ID ${id} directly published to LinkedIn. URN: ${urn}`);
      
      return res.json({ 
        success: true,
        message: 'Post successfully published directly to LinkedIn!',
        status: 'PUBLISHED',
        urn: urn
      });
    } catch (publishErr) {
      console.error('[PostController] Direct publishing failed:', publishErr.message);
      
      // Update status to FAILED
      await db.query('UPDATE linkedin_posts SET status = "FAILED", error_message = ? WHERE id = ?', [
        publishErr.message,
        id
      ]);

      return res.status(500).json({ 
        error: `LinkedIn Publish Failed: ${publishErr.message}`
      });
    }

  } catch (error) {
    console.error('[PostController] Error in direct dispatch:', error.message);
    res.status(500).json({ error: 'Failed to process post dispatch.' });
  }
}

/**
 * n8n Callback: Confirms post has been successfully shared on LinkedIn.
 */
async function confirmPublished(req, res) {
  const { id } = req.params;
  const { linkedin_post_urn, error_message } = req.body;

  try {
    if (error_message) {
      // If n8n failed to publish, update DB to FAILED
      await db.query(`
        UPDATE linkedin_posts 
        SET status = "FAILED", error_message = ? 
        WHERE id = ?
      `, [error_message, id]);

      return res.json({ message: 'Post status marked as FAILED.' });
    }

    if (!linkedin_post_urn) {
      return res.status(400).json({ error: 'linkedin_post_urn is required for success confirmation.' });
    }

    // Update status to PUBLISHED and save the URN
    const sql = `
      UPDATE linkedin_posts 
      SET 
        status = "PUBLISHED", 
        linkedin_post_urn = ?, 
        published_at = CURRENT_TIMESTAMP,
        error_message = NULL
      WHERE id = ?
    `;

    await db.query(sql, [linkedin_post_urn, id]);
    
    console.log(`[PostController] Post ID ${id} confirmed as PUBLISHED with URN: ${linkedin_post_urn}`);
    res.json({ message: 'Post publication confirmed successfully.' });

  } catch (error) {
    console.error('[PostController] Failed to confirm publication:', error.message);
    res.status(500).json({ error: 'Database update failed.' });
  }
}

module.exports = {
  getPosts,
  createPost,
  sendToN8n,
  confirmPublished
};
