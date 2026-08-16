import { z } from 'zod';
import { ActionIRSchema, PlatformTypeSchema } from './actions.js';
export const TargetConfigSchema = z.object({
    startUrl: z.string().optional(),
    appPackage: z.string().optional(),
    appActivity: z.string().optional(),
    deviceId: z.string().optional(),
    viewport: z
        .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
    })
        .default({ width: 1280, height: 720 }),
    baseUrl: z.string().optional(),
});
export const SessionIRSchema = z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().optional(),
    platform: PlatformTypeSchema,
    targetConfig: TargetConfigSchema,
    environmentVariables: z.record(z.string()).default({}),
    steps: z.array(ActionIRSchema).default([]),
    createdAt: z.number().default(() => Date.now()),
    updatedAt: z.number().default(() => Date.now()),
});
//# sourceMappingURL=session.js.map