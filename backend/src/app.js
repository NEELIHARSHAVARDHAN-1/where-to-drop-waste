require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// TFLite backend inference is optional — normal classification happens in-browser.
// Backend model init is attempted so /classify/image fallback (file uploads
// without browser JS) continues to work when Python is available.
const { initializeModel } = require('./services/vision/tensorflowLiteService');
initializeModel().catch(e => console.info('[App] TF backend model (optional):', e.message));

const app = express();

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS configuration
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]);

if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(',').forEach(url => {
    const trimmed = url.trim().replace(/\/$/, '');
    if (trimmed) allowedOrigins.add(trimmed);
  });
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, '');

    // Allow configured origins or Vercel preview deploys matching project domain
    if (
      allowedOrigins.has(normalizedOrigin) ||
      (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) ||
      (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/.test(normalizedOrigin))
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// General rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Strict rate limiting on authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging (only in dev)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Static uploads (for local dev fallback)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Root endpoint — required for health & platform verification
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    name: 'WHERE TO DROP WASTE API',
    version: '2.0.0',
    endpoints: {
      health: '/api/health',
      classify: '/api/classify',
      rules: '/api/rules',
      dashboard: '/api/dashboard',
      leaderboard: '/api/leaderboard',
    },
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    name: 'WHERE TO DROP WASTE',
    environment: process.env.NODE_ENV || 'development',
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/classify', require('./routes/classify'));
app.use('/api/rules', require('./routes/rules'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/impact', require('./routes/impact'));
app.use('/api/gamification', require('./routes/gamification'));
app.use('/api/challenges', require('./routes/challenges'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/tips', require('./routes/tips'));
app.use('/api/waste-items', require('./routes/wasteItems'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/locations', require('./routes/locations'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : err.message || 'Internal server error';
  res.status(status).json({ error: message });
});

module.exports = app;
