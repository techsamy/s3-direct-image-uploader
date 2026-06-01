-- MySQL Schema Creation Script
-- Creates the database if it does not exist and creates the required 'images' table.

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS `s3_image_manager` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `s3_image_manager`;

-- Create images table
CREATE TABLE IF NOT EXISTS `images` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `file_name` VARCHAR(255) NOT NULL,
  `s3_key` VARCHAR(255) NOT NULL,
  `image_url` TEXT DEFAULT NULL,
  `file_size` BIGINT NOT NULL,
  `status` ENUM('PENDING', 'UPLOADED', 'FAILED') DEFAULT 'PENDING',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
