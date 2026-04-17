function sanitizeValue(value, key = '') {
  const lowerKey = String(key || '').toLowerCase();
  const sensitiveKeys = new Set([
    'key',
    'sign',
    'sign_type',
    'privatekey',
    'password',
    'cookie',
    'authorization',
    'token',
  ]);

  if (sensitiveKeys.has(lowerKey)) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }

  if (value && typeof value === 'object') {
    return sanitizeObject(value);
  }

  return value;
}

function sanitizeObject(input) {
  const output = {};

  for (const [key, value] of Object.entries(input || {})) {
    output[key] = sanitizeValue(value, key);
  }

  return output;
}

function createRequestLogger({ logger, now = Date.now }) {
  return function requestLogger(req, res, next) {
    const startedAt = now();

    res.on('finish', () => {
      const meta = {
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: now() - startedAt,
        ip: req.ip,
      };

      if (req.query && Object.keys(req.query).length > 0) {
        meta.query = sanitizeObject(req.query);
      }

      if (req.body && Object.keys(req.body).length > 0) {
        meta.body = sanitizeObject(req.body);
      }

      logger.info('http request', meta);
    });

    next();
  };
}

module.exports = {
  createRequestLogger,
  sanitizeObject,
};
