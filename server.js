const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const db = require('./src/config/db');
const imageRoutes = require('./src/routes/imageRoutes');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// HTTP Request logging
app.use(morgan('dev'));

// Parse incoming JSON payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Connect S3 Image Management APIs
app.use('/api/images', imageRoutes);

// Catch-all route to serve the SPA or default landing page (index.html)
app.get('*', (req, res, next) => {
  // If request is for an API, forward to 404 handler
  if (req.url.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 API Handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.originalUrl} not found.`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An internal server error occurred.',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Proactively initialize database (creates DB & tables automatically)
    await db.initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(`🌐 Local URL: http://localhost:${PORT}`);
      console.log(`🛠️  phpMyAdmin: http://localhost/phpmyadmin/`);
      console.log(`==================================================`);
    });
  } catch (error) {
    console.error('❌ Failed to initialize application database:', error);
    console.log('Starting Express server anyway so settings/errors can be inspected...');
    
    app.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`⚠️  Server started WITH DATABASE ERRORS on port ${PORT}`);
      console.log(`⚠️  Please check if MySQL is running and credentials are correct in .env`);
      console.log(`==================================================`);
    });
  }
}

startServer();
