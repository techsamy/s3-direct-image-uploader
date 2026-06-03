const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 's3_image_manager'
};

let pool;

async function initializeDatabase() {
  console.log('[DB] Connecting to MySQL host at ' + dbConfig.host + ' to check database...');
  
  // 1. First connect without a database selection to ensure the DB itself exists
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password
  });

  try {
    // 2. Create database if it does not exist
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`[DB] Database "${dbConfig.database}" is ready.`);
  } catch (error) {
    console.error('[DB] Failed to create database:', error.message);
    throw error;
  } finally {
    await connection.end();
  }

  // 3. Setup the global connection pool for the selected database
  pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // 4. Create the required 'images' table if it does not exist
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS \`images\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`file_name\` VARCHAR(255) NOT NULL,
      \`s3_key\` VARCHAR(255) NOT NULL,
      \`image_url\` TEXT DEFAULT NULL,
      \`file_size\` BIGINT NOT NULL,
      \`status\` ENUM('PENDING', 'UPLOADED', 'FAILED') DEFAULT 'PENDING',
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_status\` (\`status\`),
      INDEX \`idx_created_at\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  // Create table for posts metadata
  const createPostsTableQuery = `
    CREATE TABLE IF NOT EXISTS \`linkedin_posts\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`title\` VARCHAR(255) NULL,
      \`content\` TEXT NOT NULL,
      \`image_id\` INT NULL,
      \`post_type\` ENUM('POST', 'ARTICLE_LINK') DEFAULT 'POST',
      \`external_url\` VARCHAR(512) NULL,
      \`status\` ENUM('DRAFT', 'PENDING_N8N', 'PUBLISHED', 'FAILED') DEFAULT 'DRAFT',
      \`linkedin_post_urn\` VARCHAR(255) NULL,
      \`error_message\` TEXT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`published_at\` TIMESTAMP NULL,
      FOREIGN KEY (\`image_id\`) REFERENCES \`images\`(\`id\`) ON DELETE SET NULL,
      INDEX \`idx_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  // Create table for dynamic token rotation and security (refresh_token is nullable for standard apps)
  const createOauthTableQuery = `
    CREATE TABLE IF NOT EXISTS \`linkedin_oauth\` (
      \`id\` INT PRIMARY KEY DEFAULT 1,
      \`access_token\` TEXT NOT NULL,
      \`refresh_token\` TEXT NULL,
      \`access_token_expires_at\` TIMESTAMP NOT NULL,
      \`refresh_token_expires_at\` TIMESTAMP NULL,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  try {
    await pool.query(createTableQuery);
    console.log('[DB] Table "images" is verified/created.');
    await pool.query(createPostsTableQuery);
    console.log('[DB] Table "linkedin_posts" is verified/created.');
    await pool.query(createOauthTableQuery);
    console.log('[DB] Table "linkedin_oauth" is verified/created.');
    
    // Self-healing migration to make refresh_token nullable for existing databases
    await pool.query(`
      ALTER TABLE \`linkedin_oauth\` 
      MODIFY COLUMN \`refresh_token\` TEXT NULL,
      MODIFY COLUMN \`refresh_token_expires_at\` TIMESTAMP NULL
    `);
    console.log('[DB] Table "linkedin_oauth" columns altered successfully.');
  } catch (error) {
    console.error('[DB] Failed to verify/create database tables:', error.message);
    throw error;
  }
}

// Helper to run raw SQL queries easily
async function query(sql, params) {
  if (!pool) {
    throw new Error('[DB] Database pool is not initialized. Please call initializeDatabase first.');
  }
  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = {
  initializeDatabase,
  query,
  getPool: () => pool
};
