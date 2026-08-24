import { ActionIR, LocatorCandidate } from '@automate-plus/ir-schema';
import { rankLocators } from './scoring.js';

export interface HealingResult {
  healed: boolean;
  originalCandidate?: LocatorCandidate;
  chosenCandidate?: LocatorCandidate;
  remainingCandidates: LocatorCandidate[];
}

/**
 * Orders only locators captured in ActionIR. Healing never invents a selector,
 * coordinate, target, or device value.
 */
export function orderedHealingCandidates(action: ActionIR): LocatorCandidate[] {
  return rankLocators(action.locators ?? [], action.platform);
}

export function findNextResilientLocator(
  action: ActionIR,
  failedLocatorValue: string
): HealingResult {
  const locators = orderedHealingCandidates(action);
  if (locators.length === 0) {
    return { healed: false, remainingCandidates: [] };
  }

  const failedIndex = locators.findIndex((l) => l.value === failedLocatorValue);
  const original = failedIndex >= 0 ? locators[failedIndex] : undefined;

  // Filter out the failed locator and sort remaining by highest score
  const remaining = locators
    .filter((l) => l.value !== failedLocatorValue)
    .sort((a, b) => b.score - a.score);

  if (remaining.length === 0) {
    return {
      healed: false,
      originalCandidate: original,
      remainingCandidates: [],
    };
  }

  return {
    healed: true,
    originalCandidate: original,
    chosenCandidate: remaining[0],
    remainingCandidates: remaining.slice(1),
  };
}
