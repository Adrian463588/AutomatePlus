import { z } from 'zod';
export const LEGACY_IR_SCHEMA_VERSION = 1;
export const CURRENT_IR_SCHEMA_VERSION = 2;
export const IrSchemaVersionSchema = z.union([
    z.literal(LEGACY_IR_SCHEMA_VERSION),
    z.literal(CURRENT_IR_SCHEMA_VERSION),
]);
export class SchemaMigrationError extends Error {
    version;
    constructor(message, version) {
        super(message);
        this.name = 'SchemaMigrationError';
        this.version = version;
    }
}
export function getSchemaVersion(raw) {
    if (!isRecord(raw))
        return LEGACY_IR_SCHEMA_VERSION;
    const version = raw.schemaVersion ?? LEGACY_IR_SCHEMA_VERSION;
    const parsed = IrSchemaVersionSchema.safeParse(version);
    if (!parsed.success) {
        throw new SchemaMigrationError(`Unsupported IR schema version: ${String(version)}. Supported versions are 1 and 2.`, version);
    }
    return parsed.data;
}
export function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=version.js.map