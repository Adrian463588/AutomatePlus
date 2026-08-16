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
export const LocatorCandidateSchema = z.object({
    strategy: LocatorStrategySchema,
    value: z.string().min(1),
    role: z.string().optional(),
    name: z.string().optional(),
    score: z.number().min(0).max(100).default(50),
});
//# sourceMappingURL=locators.js.map