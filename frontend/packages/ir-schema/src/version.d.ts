import { z } from 'zod';
export declare const LEGACY_IR_SCHEMA_VERSION: 1;
export declare const CURRENT_IR_SCHEMA_VERSION: 2;
export declare const IrSchemaVersionSchema: z.ZodUnion<[z.ZodLiteral<1>, z.ZodLiteral<2>]>;
export type IrSchemaVersion = z.infer<typeof IrSchemaVersionSchema>;
export declare class SchemaMigrationError extends Error {
    readonly version?: unknown;
    constructor(message: string, version?: unknown);
}
export declare function getSchemaVersion(raw: unknown): IrSchemaVersion;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
//# sourceMappingURL=version.d.ts.map