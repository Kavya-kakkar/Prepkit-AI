import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'COMPANY_UNREACHABLE',
  'LLM_RATE_LIMITED',
  'LLM_FAILED',
  'INVALID_SCHEMA',
  'PARSE_ERROR',
  'INVALID_URL',
  'SSRF_BLOCKED',
  'INPUT_TOO_THIN',
  'PIPELINE_FAILED',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const DomainErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().optional(),
});
export type DomainError = z.infer<typeof DomainErrorSchema>;

export class AppDomainError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppDomainError';
    this.code = code;
    this.details = details;
  }
}
