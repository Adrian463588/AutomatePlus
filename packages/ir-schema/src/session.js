import { z } from 'zod';
import { ActionIRSchema, PlatformTypeSchema, SecretRefSchema } from './actions.js';
import { CURRENT_IR_SCHEMA_VERSION, IrSchemaVersionSchema } from './version.js';
const EnvironmentVariableNameSchema = z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/u);
export const TargetConfigSchema = z
    .object({
    startUrl: z.string().trim().min(1).max(16_384).optional(),
    appPackage: z.string().trim().min(1).max(512).optional(),
    appActivity: z.string().trim().min(1).max(512).optional(),
    deviceId: z.string().trim().min(1).max(512).optional(),
    viewport: z.object({
        width: z.number().int().positive().max(16_384),
        height: z.number().int().positive().max(16_384),
    }).strict().optional(),
    baseUrl: z.string().trim().min(1).max(16_384).optional(),
})
    .strict();
export const SessionIRSchema = z
    .object({
    id: z.string().uuid(),
    schemaVersion: IrSchemaVersionSchema.default(CURRENT_IR_SCHEMA_VERSION),
    projectId: z.string().uuid(),
    name: z.string().trim().min(1).max(512),
    description: z.string().trim().max(4096).optional(),
    platform: PlatformTypeSchema,
    targetConfig: TargetConfigSchema.default({}),
    environmentVariables: z.record(z.union([z.string().max(100_000), SecretRefSchema])).default({}),
    steps: z.array(ActionIRSchema).max(10_000).default([]),
    createdAt: z.number().int().nonnegative().finite().default(() => Date.now()),
    updatedAt: z.number().int().nonnegative().finite().default(() => Date.now()),
})
    .strict()
    .superRefine((session, context) => {
    const stepIds = new Set();
    for (const [index, step] of session.steps.entries()) {
        if (step.stepNumber !== index + 1) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['steps', index, 'stepNumber'],
                message: `stepNumber must be contiguous and start at 1; expected ${index + 1}`,
            });
        }
        if (step.platform !== session.platform) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['steps', index, 'platform'],
                message: `step platform '${step.platform}' must match session platform '${session.platform}'`,
            });
        }
        if (stepIds.has(step.id)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['steps', index, 'id'],
                message: 'step ids must be unique within a session',
            });
        }
        stepIds.add(step.id);
    }
    if (session.updatedAt < session.createdAt) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['updatedAt'],
            message: 'updatedAt cannot be earlier than createdAt',
        });
    }
    const config = session.targetConfig;
    if (session.platform === 'web' && (config.appPackage || config.appActivity || config.deviceId || config.baseUrl)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['targetConfig'],
            message: 'web targetConfig only supports startUrl and viewport',
        });
    }
    if (session.platform === 'android' && (config.startUrl || config.baseUrl || config.viewport)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['targetConfig'],
            message: 'android targetConfig only supports app, device, and activity fields',
        });
    }
    if (session.platform === 'api' && (config.startUrl || config.appPackage || config.appActivity || config.deviceId || config.viewport)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['targetConfig'],
            message: 'api targetConfig only supports baseUrl',
        });
    }
    for (const [name, value] of Object.entries(session.environmentVariables)) {
        if (!EnvironmentVariableNameSchema.safeParse(name).success) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['environmentVariables', name],
                message: 'environment variable names must be valid secret-safe identifiers',
            });
        }
        if (typeof value === 'string' && value.length === 0) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['environmentVariables', name],
                message: 'environment variable values must not be empty',
            });
        }
    }
});
//# sourceMappingURL=session.js.map