import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('API Error:', err);

  const message = err.message || 'Internal server error';
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';

  if (message.includes('UNAUTHORIZED') || message.includes('INVALID_CREDENTIALS')) {
    statusCode = 401;
    code = 'UNAUTHORIZED';
  } else if (message.includes('FORBIDDEN')) {
    statusCode = 403;
    code = 'FORBIDDEN';
  } else if (message.includes('NOT_FOUND')) {
    statusCode = 404;
    code = 'NOT_FOUND';
  } else if (message.includes('EMAIL_EXISTS') || message.includes('VALIDATION_ERROR') || message.includes('JD_EMPTY')) {
    statusCode = 400;
    code = 'BAD_REQUEST';
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
}
