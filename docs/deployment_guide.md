# CloudSnap Production Deployment Guide

This guide outlines the steps required to deploy the **CloudSnap - S3 Direct Image Manager** backend and frontend into a production-grade environment. 

The application has been verified, tested under parallel loads, and refined to adapt automatically to modern containerized cloud infrastructures (e.g. AWS ECS/EC2 IAM Roles).

---

## 📋 1. Production Environment Variables (`.env`)

In production, you must transition from `development` to `production` mode, secure your database passwords, and connect real AWS resources.

Create a production `.env` file on your server:

```ini
# Server settings
PORT=3000
NODE_ENV=production

# Database Settings (use a managed DB like AWS RDS in production)
DB_HOST=your-rds-endpoint.amazonaws.com
DB_PORT=3306
DB_USER=cloudsnap_prod
DB_PASS=A_Highly_Secure_Password_123!
DB_NAME=s3_image_manager

# AWS Settings
AWS_REGION=us-east-1
AWS_S3_BUCKET=prod-cloudsnap-storage

# NOTE ON AWS CREDENTIALS:
# - If deploying on AWS EC2, ECS, or Elastic Beanstalk: Omit AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.
#   The app will automatically fall back securely to the IAM Instance Role / Task Role.
# - If deploying on a non-AWS VPS (DigitalOcean, Render, etc.): Provide explicit keys below:
AWS_ACCESS_KEY_ID=AKIA...your-access-key...
AWS_SECRET_ACCESS_KEY=your-secret-access-key...
```

---

## 🔒 2. AWS S3 Configuration Checklist

For direct client-side S3 PUT uploads to succeed, your S3 bucket must be properly configured for permissions and CORS.

### A. AWS IAM Policy (Least Privilege)
The IAM user or role executing this application needs only two permissions on the target bucket:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::prod-cloudsnap-storage/*"
        }
    ]
}
```

### B. S3 Bucket CORS Policy (CRITICAL ⚠️)
Because your frontend uploads files directly from the browser to your S3 bucket, **you must configure S3 CORS**. Without this, uploads will fail with `Access to XMLHttpRequest at ... has been blocked by CORS policy`.

In your AWS S3 Console, select your bucket -> **Permissions** -> **CORS**, and add:

```json
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "PUT",
            "GET"
        ],
        "AllowedOrigins": [
            "https://yourproductiondomain.com"
        ],
        "ExposeHeaders": [
            "ETag"
        ],
        "MaxAgeSeconds": 3000
    }
]
```
> [!TIP]
> During initial staging deployment, you can set `"AllowedOrigins": ["*"]` for verification, but narrow it down to your production domain for security before going live.

### C. S3 Public Read Access (Optional)
If you want the uploaded images to be viewable directly from their S3 public URLs (e.g. rendering in the dashboard grid or public sites):
1. **Disable** "Block public access (bucket settings)" under Bucket Permissions.
2. Add a **Bucket Policy** allowing public anonymous reads:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::prod-cloudsnap-storage/*"
        }
    ]
}
```

---

## ⚙️ 3. VPS Deployment Guide (Ubuntu + Nginx + PM2)

This traditional deployment model is highly popular for standard Linux Virtual Private Servers.

### Step 1: Install Node.js & MySQL
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (v20+ recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 Process Manager globally
sudo npm install pm2 -g
```

### Step 2: Set Up Project Files
1. Clone your repository to `/var/www/html/s3-bucket-image-upload`.
2. Run `npm install --omit=dev` to install only production dependencies.
3. Configure your production `.env` as defined in Section 1.

### Step 3: Run Node Server with PM2
PM2 acts as a daemon and automatically restarts your server if it crashes or the OS reboots.

```bash
# Start server with PM2
pm2 start server.js --name "cloudsnap-backend"

# Configure PM2 to start on system bootup
pm2 startup
pm2 save
```

### Step 4: Configure Nginx Reverse Proxy
To serve the application securely over Port 80 (HTTP) or 443 (HTTPS), configure Nginx as a reverse proxy.

Create `/etc/nginx/sites-available/cloudsnap`:
```nginx
server {
    listen 80;
    server_name yourproductiondomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable the configuration and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/cloudsnap /etc/nginx/sites-enabled/
sudo nginx -t
sudo system5 reload nginx
```

---

## 🐳 4. Modern Container Deployment (Docker)

If deploying to AWS ECS, Kubernetes, Render, or GCP Cloud Run, package your application into a Docker container.

Here is an optimized, multi-stage **production-ready `Dockerfile`**:

```dockerfile
# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- Production Stage ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source files
COPY --from=builder /app/node_modules ./node_modules
COPY server.js ./
COPY public/ ./public/
COPY src/ ./src/

# Expose port
EXPOSE 3000

# Run as non-root user for security
USER node

# Launch application
CMD ["node", "server.js"]
```

---

## 🛡️ 5. Production Security Hardening

Before going live, implement these advanced security recommendations:

1. **Restrict CORS in Node.js**:
   Modify `server.js` to restrict API connections to your domain:
   ```javascript
   const corsOptions = {
     origin: process.env.NODE_ENV === 'production' ? 'https://yourproductiondomain.com' : '*',
     methods: ['GET', 'POST']
   };
   app.use(cors(corsOptions));
   ```
2. **API Rate Limiting**:
   Protect the `/api/images/presign` endpoint from storage-exhaustion attacks by rate-limiting client IPs:
   ```bash
   npm install express-rate-limit
   ```
   ```javascript
   const rateLimit = require('express-rate-limit');
   const presignLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100, // Limit each IP to 100 URL requests per window
     message: { success: false, message: 'Too many upload requests. Please try again later.' }
   });
   app.use('/api/images/presign', presignLimiter);
   ```
3. **Database Security**:
   Ensure your MySQL server does not have public access (bind-address `127.0.0.1` or within a private VPC network subnet if using AWS RDS) and disable the root user remote log-in.
