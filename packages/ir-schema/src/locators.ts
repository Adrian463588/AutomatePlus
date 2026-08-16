import { z } from 'zod';

export const LocatorStrategySchema = z.enum([
  'testId',
  'role',
  'accessibilityId',
  'resourceId',
  'label',
  'id',
  'name',
  'text',
  'css',
  'xpath',
  'bounds',
]);

export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;

export const LocatorCandidateSchema = z.object({
  strategy: LocatorStrategySchema,
  value: z.string().min(1),
  role: z.string().optional(),
  name: z.string().optional(),
  score: z.number().min(0).max(100).default(50),
});

export type LocatorCandidate = z.infer<typeof LocatorCandidateSchema>;
