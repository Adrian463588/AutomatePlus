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

export const LocatorCandidateSchema = z
  .object({
    strategy: LocatorStrategySchema,
    value: z.string().min(1).max(4096),
    role: z.string().min(1).max(256).optional(),
    name: z.string().min(1).max(1024).optional(),
    score: z.number().finite().min(0).max(100).default(50),
  })
  .strict()
  .superRefine((locator, context) => {
    if (locator.strategy === 'bounds' && !/^\[\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\]\[\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\]$/u.test(locator.value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'bounds locator value must be [left,top][right,bottom]',
      });
    }
  });

export type LocatorCandidate = z.infer<typeof LocatorCandidateSchema>;

export function validateLocatorRanking(locators: readonly LocatorCandidate[]): string[] {
  const errors: string[] = [];
  const identities = new Set<string>();

  for (let index = 0; index < locators.length; index += 1) {
    const current = locators[index];
    const identity = `${current.strategy}\u0000${current.value}`;
    if (identities.has(identity)) errors.push(`locators.${index}: duplicate locator strategy/value pair`);
    identities.add(identity);

    const previous = locators[index - 1];
    if (previous && current.score > previous.score) {
      errors.push(`locators.${index}.score: locator candidates must be ordered by descending score`);
    }
  }

  return errors;
}

export function normalizeLocatorRanking<T extends LocatorCandidate>(locators: readonly T[]): T[] {
  return locators
    .map((locator, originalIndex) => ({ locator, originalIndex }))
    .sort((left, right) => right.locator.score - left.locator.score || left.originalIndex - right.originalIndex)
    .map(({ locator }) => locator);
}
