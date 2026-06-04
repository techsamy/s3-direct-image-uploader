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

-- Create linkedin_posts table
CREATE TABLE IF NOT EXISTS `linkedin_posts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NULL,
    `content` TEXT NOT NULL,
    `image_id` INT NULL,
    `post_type` ENUM('POST', 'ARTICLE_LINK') DEFAULT 'POST',
    `external_url` VARCHAR(512) NULL,
    `status` ENUM('DRAFT', 'PENDING_N8N', 'PUBLISHED', 'FAILED') DEFAULT 'DRAFT',
    `linkedin_post_urn` VARCHAR(255) NULL,
    `error_message` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `published_at` TIMESTAMP NULL,
    FOREIGN KEY (`image_id`)
        REFERENCES `images`(`id`)
        ON DELETE SET NULL,
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

-- Create linkedin_oauth table
CREATE TABLE IF NOT EXISTS `linkedin_oauth` (
    `id` INT PRIMARY KEY DEFAULT 1,
    `access_token` TEXT NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token_expires_at` TIMESTAMP NOT NULL,
    `refresh_token_expires_at` TIMESTAMP NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;