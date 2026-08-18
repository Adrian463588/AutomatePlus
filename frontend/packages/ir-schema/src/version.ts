import { z } from 'zod';

export const LEGACY_IR_SCHEMA_VERSION = 1 as const;
export const CURRENT_IR_SCHEMA_VERSION = 2 as const;

export const IrSchemaVersionSchema = z.union([
  z.literal(LEGACY_IR_SCHEMA_VERSION),
  z.literal(CURRENT_IR_SCHEMA_VERSION),
]);

export type IrSchemaVersion = z.infer<typeof IrSchemaVersionSchema>;

export class SchemaMigrationError extends Error {
  public readonly version?: unknown;

  constructor(message: string, version?: unknown) {
    super(message);
    this.name = 'SchemaMigrationError';
    this.version = version;
  }
}

export function getSchemaVersion(raw: unknown): IrSchemaVersion {
  if (!isRecord(raw)) return LEGACY_IR_SCHEMA_VERSION;

  const version = raw.schemaVersion ?? LEGACY_IR_SCHEMA_VERSION;
  const parsed = IrSchemaVersionSchema.safeParse(version);
  if (!parsed.success) {
    throw new SchemaMigrationError(
      `Unsupported IR schema version: ${String(version)}. Supported versions are 1 and 2.`,
      version,
    );
  }
  return parsed.data;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
