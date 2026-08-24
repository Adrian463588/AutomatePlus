import { LocatorCandidate, LocatorStrategy, PlatformType } from '@automate-plus/ir-schema';

const WEB_WEIGHTS: Record<LocatorStrategy, number> = {
  testId: 100,
  role: 95,
  accessibilityId: 90,
  label: 88,
  id: 82,
  name: 76,
  text: 68,
  css: 50,
  resourceId: 45,
  xpath: 20,
  bounds: 5,
};

const ANDROID_WEIGHTS: Record<LocatorStrategy, number> = {
  resourceId: 100,
  accessibilityId: 95,
  label: 88,
  id: 82,
  testId: 78,
  text: 72,
  role: 45,
  name: 40,
  xpath: 20,
  bounds: 5,
  css: 5,
};

const STRATEGY_TIE_BREAK: Record<LocatorStrategy, number> = {
  testId: 0,
  resourceId: 1,
  accessibilityId: 2,
  role: 3,
  label: 4,
  id: 5,
  name: 6,
  text: 7,
  css: 8,
  xpath: 9,
  bounds: 10,
};

const GENERIC_TEXT = new Set(['button', 'link', 'input', 'text', 'image', 'item']);

function isDynamicIdentifier(value: string): boolean {
  return /(?:\d{5,}|^:[a-z0-9]+:$|[a-f0-9]{8,})/iu.test(value);
}

function qualityPenalty(strategy: LocatorStrategy, value: string, role?: string, name?: string): number {
  const normalized = value.trim();
  let penalty = 0;

  if (['id', 'resourceId', 'testId'].includes(strategy) && isDynamicIdentifier(normalized)) penalty += 30;
  if (strategy === 'role' && !name?.trim()) penalty += 8;
  if (strategy === 'text') {
    if (normalized.length > 80) penalty += 20;
    if (GENERIC_TEXT.has(normalized.toLowerCase())) penalty += 18;
  }
  if (strategy === 'css') {
    if (/^\.?[a-z_-]+$/iu.test(normalized)) penalty += 10;
    if (/:nth(?:-child|-of-type)|\[class\*=/iu.test(normalized)) penalty += 18;
  }
  if (strategy === 'xpath') {
    if (/^\/(?:html|body)/iu.test(normalized)) penalty += 25;
    penalty += Math.max(0, normalized.split('/').length - 5) * 3;
  }
  if (strategy === 'bounds') penalty += 15;
  if (role?.trim() && role.trim() !== normalized && strategy === 'role') penalty -= 2;

  return penalty;
}

export function calculateLocatorScore(
  strategy: LocatorStrategy,
  value: string,
  platform: PlatformType,
  metadata?: Pick<LocatorCandidate, 'role' | 'name'>,
): number {
  const weights = platform === 'android' ? ANDROID_WEIGHTS : WEB_WEIGHTS;
  const baseWeight = weights[strategy] ?? 50;
  return Math.max(5, Math.min(100, baseWeight - qualityPenalty(strategy, value, metadata?.role, metadata?.name)));
}

export function rankLocators(
  candidates: LocatorCandidate[],
  platform: PlatformType,
): LocatorCandidate[] {
  const seen = new Set<string>();
  return candidates
    .map((candidate, originalIndex) => ({
      originalIndex,
      candidate: {
        ...candidate,
        value: candidate.value.trim(),
        score: calculateLocatorScore(candidate.strategy, candidate.value, platform, candidate),
      },
    }))
    .filter(({ candidate }) => {
      const identity = `${candidate.strategy}\u0000${candidate.value}`;
      if (seen.has(identity) || candidate.value.length === 0) return false;
      seen.add(identity);
      return true;
    })
    .sort((left, right) =>
      right.candidate.score - left.candidate.score
      || STRATEGY_TIE_BREAK[left.candidate.strategy] - STRATEGY_TIE_BREAK[right.candidate.strategy]
      || left.originalIndex - right.originalIndex,
    )
    .map(({ candidate }) => candidate);
}

export function selectBestLocator(
  candidates: readonly LocatorCandidate[] | undefined,
  platform: PlatformType,
): LocatorCandidate | undefined {
  return candidates && candidates.length > 0 ? rankLocators([...candidates], platform)[0] : undefined;
}
