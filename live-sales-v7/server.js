const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import routes
const apiRoutes = require('./backend/routes/api');
const authRoutes = require('./backend/routes/auth');
const userRoutes = require('./backend/routes/user');
const baselinkRoutes = require('./backend/routes/baselinker');
const sheetsRoutes = require('./backend/routes/sheets');
const exportsRoutes = require('./backend/routes/exports');

// Import middleware
const { publicLimiter } = require('./backend/middleware/rateLimiter');
const authMiddleware = require('./backend/middleware/auth');

// Import scheduler
const scheduler = require('./backend/scheduler');

// Import logger
const logger = require('./backend/utils/logger');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// HTTPS Redirect in Production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Render.com uses x-forwarded-proto header
    const proto = req.headers['x-forwarded-proto'];
    if (proto && proto !== 'https') {
      logger.warn('HTTP request redirected to HTTPS', {
        path: req.path,
        ip: req.ip
      });
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // ✅ STRICT CSP - No unsafe-inline, No unsafe-eval
      // Vue 3 with Vite pre-compiles templates - NO runtime compilation needed!
      scriptSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://cdn.tailwindcss.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Still needed for Tailwind CDN dynamic styles
        "https://cdn.jsdelivr.net",
        "https://cdn.tailwindcss.com"
      ],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        process.env.FRONTEND_URL || "*"
      ],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

app.use(compression());

// CORS Configuration - WHITELIST ONLY
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());

// Response Size Limits - Different limits for different endpoints
// Default: 1MB for most API endpoints
app.use('/api/exports', express.json({ limit: '5mb' })); // Exports can be larger
app.use(express.json({ limit: '1mb' })); // Default for all other routes
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Apply rate limiting to all routes
app.use(publicLimiter);

// Request logging
app.use((req, res, next) => {
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Serve static files (frontend) - Vite build output
// In production, serve from dist/ folder (Vite build output)
// In development, Vite dev server runs separately on port 5173
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
} else {
  // In development, serve from root for login.html and other static assets
  app.use(express.static(path.join(__dirname)));
}

// API Routes
app.use('/api/auth', authRoutes);  // Public auth routes
app.use('/api', apiRoutes);
app.use('/api/user', authMiddleware.authenticate(), userRoutes);            // Protected
app.use('/api/baselinker', authMiddleware.authenticate(), baselinkRoutes);  // Protected
app.use('/api/sheets', authMiddleware.authenticate(), sheetsRoutes);        // Protected
app.use('/api/exports', authMiddleware.authenticate(), exportsRoutes);      // Protected

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500
    }
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'not set'}`);

  // Start scheduler
  scheduler.init();
  logger.info('⏰ Scheduler initialized');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  scheduler.stop();
  process.exit(0);
});
