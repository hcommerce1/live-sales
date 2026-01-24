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
const adminRoutes = require('./backend/routes/admin');
const billingRoutes = require('./backend/routes/billing');
const featuresRoutes = require('./backend/routes/features');
const teamRoutes = require('./backend/routes/team');
const companyRoutes = require('./backend/routes/company');
const integrationsRoutes = require('./backend/routes/integrations');

// Import middleware
const { publicLimiter } = require('./backend/middleware/rateLimiter');
const authMiddleware = require('./backend/middleware/auth');

// Import scheduler
const scheduler = require('./backend/scheduler');

// Import logger
const logger = require('./backend/utils/logger');

// Import feature flags
const featureFlags = require('./backend/utils/feature-flags');

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

// Security Middleware - HARDENED CSP
// NOTE: For strict CSP without unsafe-inline, Vite needs to output external JS/CSS
// or use nonces. Current config is a balance between security and compatibility.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // unsafe-inline still needed for Vite's dev mode and some runtime features
        // TODO: Configure Vite to output external scripts for strict CSP in production
        "'unsafe-inline'",
        // Tailwind CSS CDN - needed until proper build is configured
        "https://cdn.tailwindcss.com",
        // Remove unsafe-eval in production - Vue 3 uses pre-compiled templates
        ...(process.env.NODE_ENV === 'production' ? [] : ["'unsafe-eval'"]),
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Needed for Vue/Vite style injection
      ],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        // API connections
        process.env.FRONTEND_URL || "http://localhost:5173",
        // Stripe (for billing)
        "https://api.stripe.com",
        "https://js.stripe.com",
      ],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: [
        "'self'",
        // Stripe checkout iframe
        "https://js.stripe.com",
        "https://hooks.stripe.com",
      ],
      childSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // Upgrade HTTP to HTTPS in production
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  // HSTS - enforce HTTPS
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // Prevent MIME type sniffing
  noSniff: true,
  // Prevent clickjacking
  frameguard: {
    action: 'deny',
  },
  // XSS filter (legacy browsers)
  xssFilter: true,
  // Hide X-Powered-By header
  hidePoweredBy: true,
  // Referrer policy - don't leak URLs
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  // Permissions policy - disable sensitive features
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },
}));

// Additional security headers not covered by helmet
app.use((req, res, next) => {
  // Permissions-Policy (formerly Feature-Policy)
  res.setHeader('Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(self), usb=()');

  // X-Content-Type-Options already set by helmet
  // X-Frame-Options already set by helmet

  next();
});

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id'],
}));

app.use(cookieParser());

// Response Size Limits - Different limits for different endpoints
// IMPORTANT: Stripe webhook needs raw body for signature verification
// Skip JSON parsing for webhook endpoint - it uses express.raw() in its route
const jsonParser = express.json({ limit: '1mb' });
const jsonParserLarge = express.json({ limit: '5mb' });

app.use('/api/exports', jsonParserLarge); // Exports can be larger
app.use((req, res, next) => {
  // Skip JSON parsing for Stripe webhook - needs raw body for signature verification
  // Use originalUrl for reverse proxy compatibility (handles prefix variations)
  if (req.originalUrl.startsWith('/api/billing/webhook')) {
    return next();
  }
  jsonParser(req, res, next);
});
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
app.use('/api/admin', authMiddleware.authenticate(), adminRoutes);          // Protected + admin check inside
app.use('/api/billing', billingRoutes);                                      // Mixed: webhook public, rest protected
app.use('/api/features', featuresRoutes);                                    // Auth inside routes
app.use('/api/team', authMiddleware.authenticate(), teamRoutes);            // Protected - team management
app.use('/api/company', companyRoutes);                                       // Mixed: lookup/register public, rest protected
app.use('/api/integrations', authMiddleware.authenticate(), integrationsRoutes); // Protected - integration management

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 301 Redirect: login.html → /login (migrate to SPA login)
// This ensures old bookmarks and links continue to work
app.get('/login.html', (req, res) => {
  logger.info('Redirecting login.html to /login', { ip: req.ip });
  res.redirect(301, '/login');
});

// Serve index.html for all other routes (SPA support)
// Skip if request is for a file (has extension) or starts with /api
app.get('*', (req, res, next) => {
  // Skip if it's an API route or a file request (has extension)
  if (req.path.startsWith('/api') || req.path.match(/\.[a-zA-Z0-9]+$/)) {
    return next();
  }

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
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    status: err.status || 500
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Frontend URL: ${process.env.FRONTEND_URL || 'not set'}`);

  // Initialize feature flags (connects to Redis)
  featureFlags.init();
  logger.info('Feature flags initialized');

  // Start scheduler
  scheduler.init();
  logger.info('Scheduler initialized');
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
