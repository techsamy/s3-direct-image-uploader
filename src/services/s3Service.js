const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Client = require('../config/s3');
require('dotenv').config();

const BUCKET_NAME = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION || 'us-east-1';

/**
 * Generates a PUT presigned URL for direct S3 upload from the browser
 * @param {string} key - S3 object key (destination path in bucket)
 * @param {string} fileType - MIME type of the file (e.g. image/jpeg, image/png)
 * @param {number} expiresInSeconds - Time before link expires (default: 3600 seconds)
 * @returns {Promise<string>} - Presigned URL string
 */
async function generatePutPresignedUrl(key, fileType, expiresInSeconds = 3600) {
  if (!BUCKET_NAME) {
    throw new Error('[S3] AWS_S3_BUCKET is not defined in environment variables.');
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: fileType
  });

  // Get standard PUT presigned URL
  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: expiresInSeconds
  });

  return uploadUrl;
}

/**
 * Constructs the standard S3 public URL for an uploaded file
 * @param {string} key - S3 object key
 * @returns {string} - Public URL of the image
 */
function getS3PublicUrl(key) {
  if (!BUCKET_NAME) {
    throw new Error('[S3] AWS_S3_BUCKET is not defined in environment variables.');
  }
  
  // Clean key to prevent double slashes or spaces
  const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
  
  // Standard bucket-first host
  return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${encodedKey}`;
}

module.exports = {
  generatePutPresignedUrl,
  getS3PublicUrl
};
