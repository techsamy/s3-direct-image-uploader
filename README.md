# CloudSnap - S3 Direct Image Manager (Express + MySQL + AWS S3)

A high-fidelity, premium Image Management Module built using **Node.js (Express)**, **MySQL**, and **AWS S3**, utilizing **S3 Presigned URLs** for direct-to-bucket client uploads.

---

## 🚀 Key Features

* **S3 Presigned PUT Uploads**: Browser uploads images directly to S3, bypassing backend bottle-necks.
* **Auto-DB Setup**: Automatic database (`s3_image_manager`) and tables creation on startup.
* **Premium Dashboard UI**: Built with beautiful glassmorphic Tailwind CSS elements.
* **Smart Search & Debouncing**: Responsive image search query inputs with custom debouncing.
* **Dynamic Pagination**: Full list paging with interactive limit selectors.
* **Detailed High-Res Preview Overlay**: Zoom-in viewer modal showing advanced metadata details.
* **Custom Toast Alert Core**: Dynamic, slide-in glassmorphic notification timeline alerts.
* **Active Progress Tracker**: High-accuracy upload speeds and ETA estimates during uploads.

---

## 🛠️ AWS S3 Bucket Setup Guide

To upload files directly from your browser to an AWS S3 bucket, configure the bucket's permissions and CORS policies correctly. Follow these steps:

### Step 1: Create S3 Bucket
1. Open the [Amazon S3 Console](https://console.aws.amazon.com/s3/).
2. Click **Create bucket**.
3. Enter a unique **Bucket name** (e.g., `cloudsnap-image-bucket`) and select your desired **AWS Region**.
4. In **Object Ownership**, select **ACLs disabled (recommended)**.
5. In **Block Public Access settings for this bucket**, uncheck **Block *all* public access** (this allows images to be read publicly via their S3 URLs).
   > [!WARNING]
   > Ensure you understand the security implications. If you want private images, leave it checked and implement S3 Presigned GET URLs instead.
6. Click **Create bucket**.

### Step 2: Configure Bucket Policy
To allow public read access to uploaded images, set a bucket policy:
1. Click on your newly created bucket.
2. Go to the **Permissions** tab.
3. Under **Bucket policy**, click **Edit** and paste the following JSON:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::your-s3-bucket-name/*"
       }
     ]
   }
   ```
   *Replace `your-s3-bucket-name` with your actual bucket name.*
4. Click **Save changes**.

### Step 3: Configure S3 Cross-Origin Resource Sharing (CORS)
To allow browser uploads from your local development environment directly to S3:
1. In the **Permissions** tab of your bucket, scroll down to **Cross-origin resource sharing (CORS)**.
2. Click **Edit** and paste the following policy:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["PUT", "GET", "POST", "HEAD"],
       "AllowedOrigins": ["http://localhost:3000"],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```
3. Click **Save changes**.

### Step 4: Create IAM User and Credentials
1. Open the [IAM Console](https://console.aws.amazon.com/iam/).
2. Go to **Users** and click **Create user**.
3. Name the user (e.g., `cloudsnap-s3-uploader`) and click **Next**.
4. Choose **Attach policies directly** and select **AmazonS3FullAccess** (or create a custom policy restricting access to this bucket only).
5. Review and click **Create user**.
6. Select the newly created user, go to the **Security credentials** tab, and click **Create access key**.
7. Choose **Local code** or **Other**, click **Next**, and click **Create access key**.
8. Copy the **Access key ID** and **Secret access key** to your `.env` file.

---

## 🗄️ Database Table Structure

The application creates the database and table structure automatically on startup. The schema consists of:

```sql
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
);
```

You can view the tables in phpMyAdmin at [http://localhost/phpmyadmin/](http://localhost/phpmyadmin/).

---

## 💻 Local Installation & Run Instructions

### Prerequisites
* [Node.js](https://nodejs.org/) (v16+ recommended)
* [MySQL Server](https://www.mysql.com/) running locally (e.g., via XAMPP, WAMP, or standalone)

### Step 1: Clone or Open Workspace
Ensure all project files are structured within the working folder.

### Step 2: Configure Environment Variables
1. Copy `.env.example` to a new file named `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your local MySQL details and AWS S3 credentials:
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Database Configuration (Defaults connect automatically on localhost)
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASS=
   DB_NAME=s3_image_manager

   # AWS S3 Settings
   AWS_ACCESS_KEY_ID=your-aws-access-key-id
   AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
   AWS_REGION=us-east-1
   AWS_S3_BUCKET=your-s3-bucket-name
   ```

### Step 3: Run the Application
Start the Node.js Express server:
```bash
# Start in development mode (with nodemon live-reloading)
npm run dev

# Or start in standard production mode
npm start
```

On start:
1. The app automatically connects to your local MySQL.
2. It verifies if `s3_image_manager` exists and creates it if missing.
3. It creates the `images` table if missing.
4. The server spins up at [http://localhost:3000](http://localhost:3000).

---

## 📂 Project Architecture

```text
├── public/                 # Static Frontend
│   ├── css/
│   ├── js/
│   │   ├── app.js          # Main image listing logic
│   │   ├── upload.js       # S3 presigned PUT upload logic
│   │   └── toast.js        # Modern toast notification plugin
│   ├── index.html          # Dashboard Grid/Table screen
│   └── upload.html         # Drag-and-drop Upload screen
├── src/                    # Backend Source
│   ├── config/
│   │   ├── db.js           # MySQL connection pool and auto DB generator
│   │   └── s3.js           # AWS S3 Client setup
│   ├── controllers/
│   │   └── imageController.js  # Request/response logic
│   ├── routes/
│   │   └── imageRoutes.js  # REST routes
│   └── services/
│   │   └── s3Service.js    # Presigned URL and URL builder
├── .env                    # Main config credentials
├── .env.example            # Environment template config
├── package.json            # Node project configuration
├── schema.sql              # MySQL DDL backup script
└── README.md               # Setup and running manual
```
