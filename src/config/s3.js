const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

const clientConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// If explicit credentials are provided in .env, use them.
// Otherwise, omit them to let the AWS SDK fallback securely to standard IAM Instance Roles or Task Roles.
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };
}

const s3Client = new S3Client(clientConfig);

module.exports = s3Client;
