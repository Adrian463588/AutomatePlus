import { ActionIRSchema } from './actions.js';
import { SessionIRSchema } from './session.js';
export function validateActionIR(raw) {
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
export function validateSessionIR(raw) {
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
//# sourceMappingURL=validator.js.map