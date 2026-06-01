const db = require('../config/db');
const s3Service = require('../services/s3Service');
const path = require('path');

// Allowed image mime types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp'
];

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Helper to sanitize filename by removing special characters
 */
function sanitizeFileName(fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  const cleanBase = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-') // replace non-alphanumeric characters with hyphens
    .replace(/-+/g, '-')        // collapse multiple consecutive hyphens
    .replace(/^-|-$/g, '');     // trim leading/trailing hyphens
  return `${cleanBase}${ext}`;
}

/**
 * 1. GET /api/images
 * Lists uploaded images with search and pagination support
 */
async function listImages(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';

    const offset = (page - 1) * limit;

    let countQuery = 'SELECT COUNT(*) as total FROM images';
    let dataQuery = 'SELECT * FROM images';
    let queryParams = [];

    // Filter by search query if provided
    if (search) {
      const searchPattern = `%${search}%`;
      countQuery += ' WHERE file_name LIKE ?';
      dataQuery += ' WHERE file_name LIKE ?';
      queryParams.push(searchPattern);
    }

    // Append ordering and pagination
    dataQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    // Add pagination params
    const countResult = await db.query(countQuery, queryParams);
    const totalCount = countResult[0].total;

    const dataParams = [...queryParams, limit, offset];
    const images = await db.query(dataQuery, dataParams);

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      success: true,
      data: images,
      pagination: {
        total: totalCount,
        page: page,
        limit: limit,
        totalPages: totalPages
      }
    });
  } catch (error) {
    console.error('[Controller] listImages Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch images from the database.',
      error: error.message
    });
  }
}

/**
 * 2. POST /api/images/presign
 * Generates an S3 presigned PUT URL and creates a PENDING database entry
 */
async function generatePresignedUrl(req, res) {
  try {
    const { fileName, fileType, fileSize } = req.body;

    // 1. Basic validation
    if (!fileName || !fileType || !fileSize) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: fileName, fileType, and fileSize are required.'
      });
    }

    // 2. MIME Type validation
    if (!ALLOWED_MIME_TYPES.includes(fileType.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type. Supported types: ${ALLOWED_MIME_TYPES.join(', ')}`
      });
    }

    // 3. File size validation (10MB limit)
    if (fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        message: `File exceeds maximum allowed size of 10MB (Received: ${(fileSize / (1024 * 1024)).toFixed(2)}MB).`
      });
    }

    // 4. Generate unique S3 Key
    const cleanName = sanitizeFileName(fileName);
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const s3Key = `uploads/${uniqueId}-${cleanName}`;

    // 5. Generate PUT presigned URL from S3
    const uploadUrl = await s3Service.generatePutPresignedUrl(s3Key, fileType);
    const projectedUrl = s3Service.getS3PublicUrl(s3Key);

    // 6. Create database record in PENDING state
    const insertResult = await db.query(
      'INSERT INTO images (file_name, s3_key, file_size, status) VALUES (?, ?, ?, ?)',
      [fileName, s3Key, fileSize, 'PENDING']
    );

    const imageId = insertResult.insertId;
    console.log(`[Controller] Generated presigned URL for ID: ${imageId}, S3 Key: ${s3Key}`);

    return res.status(200).json({
      success: true,
      message: 'Presigned S3 URL generated successfully.',
      data: {
        imageId: imageId,
        s3Key: s3Key,
        uploadUrl: uploadUrl,
        imageUrl: projectedUrl
      }
    });
  } catch (error) {
    console.error('[Controller] generatePresignedUrl Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate S3 presigned URL.',
      error: error.message
    });
  }
}

/**
 * 3. POST /api/images/confirm
 * Confirms the successful direct upload and updates database state
 */
async function confirmUpload(req, res) {
  try {
    const { imageId, status } = req.body;

    if (!imageId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: imageId and status are required.'
      });
    }

    if (!['UPLOADED', 'FAILED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Must be either 'UPLOADED' or 'FAILED'."
      });
    }

    // Check if the pending image record exists
    const checkResult = await db.query('SELECT * FROM images WHERE id = ?', [imageId]);
    if (checkResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Image record with ID ${imageId} not found.`
      });
    }

    const imageRecord = checkResult[0];

    if (status === 'UPLOADED') {
      const publicUrl = s3Service.getS3PublicUrl(imageRecord.s3_key);
      
      // Update DB record to UPLOADED and save public S3 URL
      await db.query(
        'UPDATE images SET status = ?, image_url = ? WHERE id = ?',
        ['UPLOADED', publicUrl, imageId]
      );
      
      console.log(`[Controller] Image ID ${imageId} confirmed as UPLOADED. URL: ${publicUrl}`);

      return res.status(200).json({
        success: true,
        message: 'Image upload confirmed successfully.',
        data: {
          id: imageId,
          fileName: imageRecord.file_name,
          imageUrl: publicUrl,
          status: 'UPLOADED'
        }
      });
    } else {
      // Mark as FAILED
      await db.query('UPDATE images SET status = ? WHERE id = ?', ['FAILED', imageId]);
      
      console.log(`[Controller] Image ID ${imageId} confirmed as FAILED.`);

      return res.status(200).json({
        success: true,
        message: 'Image status updated to FAILED.',
        data: {
          id: imageId,
          fileName: imageRecord.file_name,
          status: 'FAILED'
        }
      });
    }
  } catch (error) {
    console.error('[Controller] confirmUpload Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm image status update.',
      error: error.message
    });
  }
}

module.exports = {
  listImages,
  generatePresignedUrl,
  confirmUpload
};
