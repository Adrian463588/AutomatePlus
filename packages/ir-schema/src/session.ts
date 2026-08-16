import { z } from 'zod';
import { ActionIRSchema, PlatformTypeSchema, SecretRefSchema } from './actions.js';

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
    .optional(),
  baseUrl: z.string().optional(),
});

export const SessionIRSchema = z.object({
  id: z.string().uuid(),
  schemaVersion: z.number().int().default(1),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  platform: PlatformTypeSchema,
  targetConfig: TargetConfigSchema,
  environmentVariables: z.record(z.union([z.string(), SecretRefSchema])).default({}),
  steps: z.array(ActionIRSchema).default([]),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
});

export type SessionIR = z.infer<typeof SessionIRSchema>;
