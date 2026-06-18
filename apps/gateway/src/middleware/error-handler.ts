import type { NextFunction, Request, Response } from 'express';

interface ErrorResponse {
  readonly error: string;
  readonly status: number;
}

interface HttpError extends Error {
  readonly status?: number;
  readonly statusCode?: number;
}

export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err.status ?? err.statusCode ?? 500;
  const body: ErrorResponse = {
    error: err.message || 'Internal Server Error',
    status,
  };
  res.status(status).json(body);
}
