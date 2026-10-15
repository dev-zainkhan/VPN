import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, statusFor } from '../core/errors';
import { logger } from '../core/logger';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: { code: string; message: string; details?: unknown } = { code: err.code, message: err.message };
    if (err.details !== undefined) body.details = err.details;
    res.status(statusFor(err.code)).json({ error: body });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Validation failed', details: err.issues } });
    return;
  }
  // A body that is not valid JSON is the client's mistake, not an internal error.
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Body is not valid JSON' } });
    return;
  }
  const e = err instanceof Error ? err : new Error(String(err));
  logger.error({ message: e.message, stack: e.stack }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal error' } });
};
