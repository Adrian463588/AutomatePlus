import { ActionIR } from './actions.js';
import { SessionIR } from './session.js';
export interface ValidationIssue {
    path: Array<string | number>;
    message: string;
    code: string;
}
export interface ValidationResult<T> {
    success: boolean;
    data?: T;
    errors?: string[];
    issues?: ValidationIssue[];
    migrated?: boolean;
}
export declare function normalizeActionIR(raw: unknown): ActionIR;
export declare function normalizeSessionIR(raw: unknown): SessionIR;
export declare function validateActionIR(raw: unknown): ValidationResult<ActionIR>;
export declare function validateSessionIR(raw: unknown): ValidationResult<SessionIR>;
export declare function parseActionIR(raw: unknown): ActionIR;
export declare function parseSessionIR(raw: unknown): SessionIR;
export { migrateActionIR, migrateSessionIR } from './migration.js';
//# sourceMappingURL=validator.d.ts.map