function errorHandler(err, req, res, next) {
  console.error('❌ Error:', err.message || err);

  if (err.code === 'ECONNREFUSED' || err.code === 'ESOCKET') {
    return res.status(503).json({
      success: false,
      message: 'Database connection failed. Please check your MSSQL server.',
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
}

function validate(rules) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, checks] of Object.entries(rules)) {
      const value = req.body[field];
      if (checks.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      if (value !== undefined && value !== null && value !== '') {
        if (checks.type === 'number' && isNaN(Number(value))) {
          errors.push(`${field} must be a number`);
        }
        if (checks.min !== undefined && Number(value) < checks.min) {
          errors.push(`${field} must be at least ${checks.min}`);
        }
        if (checks.enum && !checks.enum.includes(value)) {
          errors.push(`${field} must be one of: ${checks.enum.join(', ')}`);
        }
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join('; ') });
    }
    next();
  };
}

module.exports = { errorHandler, notFound, validate };
