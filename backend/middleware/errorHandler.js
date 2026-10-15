export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err.isOperational) {
    return res.status(err.status).json({ message: err.message, details: err.details });
  }
  if (err.name === 'MulterError') {
    const msg = {
      LIMIT_FILE_SIZE: 'Each image must be 2 MB or smaller',
      LIMIT_FILE_COUNT: 'You can upload at most 5 images',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field or too many images (max 5)',
    }[err.code] || 'Invalid file upload';
    return res.status(400).json({ message: msg });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Malformed JSON body' });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'A record with these details already exists' });
  }
  // Unknown error: log internally, never leak details to the client.
  console.error(err);
  res.status(500).json({ message: 'Something went wrong. Please try again later.' });
}
