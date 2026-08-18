import { ActionIRSchema } from './actions.js';
import { normalizeLocatorRanking } from './locators.js';
import { migrateActionIR, migrateSessionIR } from './migration.js';
import { SessionIRSchema } from './session.js';
import { CURRENT_IR_SCHEMA_VERSION, isRecord, LEGACY_IR_SCHEMA_VERSION, SchemaMigrationError } from './version.js';
function formatIssues(error) {
    return error.issues
        .map((issue) => ({ path: [...issue.path], message: issue.message, code: issue.code }))
        .sort((left, right) => {
        const leftPath = left.path.join('.');
        const rightPath = right.path.join('.');
        return leftPath.localeCompare(rightPath) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message);
    });
}
function toValidationResult(result, migrated = false) {
    if (!result.success) {
        const issues = formatIssues(result.error);
        return {
            success: false,
            errors: issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
            issues,
            migrated,
        };
    }
    return { success: true, data: result.data, migrated };
}
function inputWasLegacy(raw) {
    return !isRecord(raw) || raw.schemaVersion === undefined || raw.schemaVersion === LEGACY_IR_SCHEMA_VERSION;
}
export function normalizeActionIR(raw) {
    const result = ActionIRSchema.safeParse(migrateActionIR(raw));
    if (!result.success)
        throw result.error;
    return {
        ...result.data,
        schemaVersion: CURRENT_IR_SCHEMA_VERSION,
        locators: result.data.locators ? normalizeLocatorRanking(result.data.locators) : undefined,
    };
}
export function normalizeSessionIR(raw) {
    const result = SessionIRSchema.safeParse(migrateSessionIR(raw));
    if (!result.success)
        throw result.error;
    return {
        ...result.data,
        schemaVersion: CURRENT_IR_SCHEMA_VERSION,
        steps: result.data.steps.map((step) => ({
            ...step,
            schemaVersion: CURRENT_IR_SCHEMA_VERSION,
            locators: step.locators ? normalizeLocatorRanking(step.locators) : undefined,
        })),
    };
}
export function validateActionIR(raw) {
    try {
        return toValidationResult(ActionIRSchema.safeParse(migrateActionIR(raw)), inputWasLegacy(raw));
    }
    catch (error) {
        return migrationErrorResult(error);
    }
}
export function validateSessionIR(raw) {
    try {
        return toValidationResult(SessionIRSchema.safeParse(migrateSessionIR(raw)), inputWasLegacy(raw));
    }
    catch (error) {
        return migrationErrorResult(error);
    }
}
function migrationErrorResult(error) {
    if (error instanceof SchemaMigrationError) {
        const issue = { path: ['schemaVersion'], code: 'schema_migration_error', message: error.message };
        return { success: false, errors: [`schemaVersion: ${error.message}`], issues: [issue], migrated: false };
    }
    throw error;
}
export function parseActionIR(raw) {
    const result = validateActionIR(raw);
    if (!result.success || !result.data)
        throw new Error(result.errors?.join('; ') ?? 'Invalid ActionIR');
    return result.data;
}
export function parseSessionIR(raw) {
    const result = validateSessionIR(raw);
    if (!result.success || !result.data)
        throw new Error(result.errors?.join('; ') ?? 'Invalid SessionIR');
    return result.data;
}
export { migrateActionIR, migrateSessionIR } from './migration.js';
//# sourceMappingURL=validator.js.map