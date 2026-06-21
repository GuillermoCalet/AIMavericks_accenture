import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import type { ApiError } from '@copilot/shared'

interface CodedError extends Error {
  code?: string
  status?: number
}

const STATUS_BY_CODE: Record<string, number> = {
  LLM_UNAVAILABLE: 503,
  LLM_RATE_LIMITED: 429,
  LLM_ERROR: 502,
  LLM_INVALID_OUTPUT: 502,
  SOLVER_ERROR: 502,
  NOT_FOUND: 404,
  VALIDATION: 400,
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export function notFound(_req: Request, res: Response): void {
  const body: ApiError = { error: 'Not found', code: 'NOT_FOUND' }
  res.status(404).json(body)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const body: ApiError = { error: 'Invalid request', code: 'VALIDATION', details: err.flatten() }
    res.status(400).json(body)
    return
  }
  if (err instanceof HttpError) {
    const body: ApiError = { error: err.message, code: err.code, details: err.details }
    res.status(err.status).json(body)
    return
  }
  const e = err as CodedError
  const code = e.code ?? 'INTERNAL'
  const status = e.status ?? STATUS_BY_CODE[code] ?? 500
  // Log without secrets or payloads.
  console.error(`[error] ${code} ${status}: ${e.message}`)
  const body: ApiError = { error: e.message || 'Internal server error', code }
  res.status(status).json(body)
}
