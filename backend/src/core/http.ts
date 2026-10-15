import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

export function ah(fn: Handler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, value: unknown): T {
  return schema.parse(value);
}
