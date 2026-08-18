import { LocatorCandidate, LocatorStrategy, PlatformType } from '@automate-plus/ir-schema';

const WEB_WEIGHTS: Record<LocatorStrategy, number> = {
  testId: 100,
  role: 90,
  accessibilityId: 85,
  label: 80,
  id: 75,
  name: 70,
  text: 65,
  css: 50,
  bounds: 30,
  resourceId: 25,
  xpath: 20,
};

const ANDROID_WEIGHTS: Record<LocatorStrategy, number> = {
  resourceId: 100,
  accessibilityId: 95,
  role: 85,
  label: 80,
  id: 75,
  testId: 70,
  text: 65,
  bounds: 45,
  css: 40,
  name: 30,
  xpath: 20,
};

export function calculateLocatorScore(
  strategy: LocatorStrategy,
  value: string,
  platform: PlatformType
): number {
  const baseWeight =
    platform === 'android'
      ? (ANDROID_WEIGHTS[strategy] ?? 50)
      : (WEB_WEIGHTS[strategy] ?? 50);

  let penalty = 0;

  // Penalty for long xpath or deep hierarchy
  if (strategy === 'xpath' && value.split('/').length > 5) {
    penalty += 15;
  }

  // Penalty for generated/dynamic id hashes (e.g., id="btn-172938491823" or id=":r1:")
  if (strategy === 'id' && (/\d{5,}/.test(value) || /^:[a-z0-9]+:$/.test(value))) {
    penalty += 35;
  }

  // Penalty for overly generic text
  if (strategy === 'text' && value.trim().length === 0) {
    penalty += 50;
  }

  return Math.max(5, baseWeight - penalty);
}

export function rankLocators(
  candidates: LocatorCandidate[],
  platform: PlatformType
): LocatorCandidate[] {
  const scored = candidates.map((candidate) => ({
    ...candidate,
    score: calculateLocatorScore(candidate.strategy, candidate.value, platform),
  }));

  return scored.sort((a, b) => b.score - a.score);
}
