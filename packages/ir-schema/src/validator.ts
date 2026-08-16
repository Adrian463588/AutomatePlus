import { ActionIR, ActionIRSchema } from './actions.js';
import { SessionIR, SessionIRSchema } from './session.js';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export function validateActionIR(raw: unknown): ValidationResult<ActionIR> {
  const result = ActionIRSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    };
  }
  return {
    success: true,
    data: result.data,
  };
}

export function validateSessionIR(raw: unknown): ValidationResult<SessionIR> {
  const result = SessionIRSchema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    };
  }
  return {
    success: true,
    data: result.data,
  };
}
