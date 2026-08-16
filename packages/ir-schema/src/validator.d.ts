import { ActionIR } from './actions.js';
import { SessionIR } from './session.js';
export interface ValidationResult<T> {
    success: boolean;
    data?: T;
    errors?: string[];
}
export declare function validateActionIR(raw: unknown): ValidationResult<ActionIR>;
export declare function validateSessionIR(raw: unknown): ValidationResult<SessionIR>;
//# sourceMappingURL=validator.d.ts.map