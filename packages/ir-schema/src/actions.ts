import { z } from 'zod';
import { LocatorCandidateSchema } from './locators.js';

export const PlatformTypeSchema = z.enum(['web', 'android', 'api']);
export type PlatformType = z.infer<typeof PlatformTypeSchema>;

export const ActionTypeSchema = z.enum([
  // Universal / Web Actions
  'navigate',
  'click',
  'doubleClick',
  'rightClick',
  'hover',
  'fill',
  'clear',
  'pressKey',
  'scroll',
  'dragAndDrop',
  'waitFor',
  'sleep',
  'takeScreenshot',
  // Mobile / Android Actions
  'tap',
  'doubleTap',
  'longPress',
  'swipe',
  'drag',
  'pinch',
  'back',
  'home',
  'enter',
  'launchApp',
  'closeApp',
  // API Actions
  'httpRequest',
  // Assertions
  'assertVisible',
  'assertHidden',
  'assertText',
  'assertValue',
  'assertAttribute',
  'assertUrl',
  'assertStatusCode',
  'assertJsonPath',
  'assertHeader',
  'assertResponseTime',
]);

export type ActionType = z.infer<typeof ActionTypeSchema>;

export const SecretRefSchema = z.object({
  kind: z.literal('secret'),
  key: z.string().min(1),
});
export type SecretRef = z.infer<typeof SecretRefSchema>;

export const DragTargetSchema = z.object({
  locators: z.array(LocatorCandidateSchema),
  coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const ScrollOffsetSchema = z.object({
  deltaX: z.number(),
  deltaY: z.number(),
});

export const SwipeVectorSchema = z.object({
  startX: z.number(),
  startY: z.number(),
  endX: z.number(),
  endY: z.number(),
  durationMs: z.number().default(300),
});

export const ApiPayloadSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string(),
  headers: z.record(z.string()).default({}),
  queryParams: z.record(z.string()).default({}),
  bodyType: z.enum(['none', 'json', 'form-data', 'x-www-form-urlencoded', 'raw']).default('none'),
  bodyContent: z.string().optional(),
  extractedVariables: z
    .array(
      z.object({
        variableName: z.string(),
        jsonPath: z.string(),
      })
    )
    .default([]),
});

export const ActionIRSchema = z.object({
  id: z.string().uuid(),
  schemaVersion: z.number().int().default(1),
  stepNumber: z.number().int().positive(),
  platform: PlatformTypeSchema,
  action: ActionTypeSchema,
  description: z.string().optional(),
  locators: z.array(LocatorCandidateSchema).optional(),
  value: z.union([z.string(), SecretRefSchema]).optional(),
  attributeName: z.string().optional(),
  expectedValue: z.string().optional(),
  dragTarget: DragTargetSchema.optional(),
  scrollOffset: ScrollOffsetSchema.optional(),
  swipeVector: SwipeVectorSchema.optional(),
  apiPayload: ApiPayloadSchema.optional(),
  timeoutMs: z.number().positive().default(5000),
  optional: z.boolean().default(false),
  timestamp: z.number().default(() => Date.now()),
});

export type ActionIR = z.infer<typeof ActionIRSchema>;
