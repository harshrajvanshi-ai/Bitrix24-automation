/**
 * src/middleware/rateLimiter.js
 * API and Webhook event rate limiting (Cloudflare Tunnel & Reverse Proxy safe)
 */

const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false },
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  }
});

const eventLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // accommodate high-frequency CRM webhooks
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false },
  message: {
    success: false,
    error: 'Event rate limit exceeded.'
  }
});

module.exports = {
  apiLimiter,
  eventLimiter
};
