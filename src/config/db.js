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

  try {
    await pool.query(createTableQuery);
    console.log('[DB] Table "images" is verified/created.');
  } catch (error) {
    console.error('[DB] Failed to create table "images":', error.message);
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
