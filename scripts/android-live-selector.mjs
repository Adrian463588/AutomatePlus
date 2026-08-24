function decodeXmlAttribute(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attributesForNode(rawAttributes) {
  return Object.fromEntries(
    [...rawAttributes.matchAll(/([\w:-]+)="([^"]*)"/gu)].map((match) => [
      match[1],
      decodeXmlAttribute(match[2]),
    ]),
  );
}

function usefulValue(value) {
  const normalized = value?.trim();
  return normalized && normalized.length <= 256 && /\p{L}/u.test(normalized)
    ? normalized
    : undefined;
}

function boundsFor(value) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(value ?? '');
  if (!match) return undefined;
  const [, left, top, right, bottom] = match.map(Number);
  return {
    left,
    top,
    right,
    bottom,
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2),
  };
}

function candidatesForNode(attributes) {
  const candidates = [];
  const resourceId = usefulValue(attributes['resource-id']);
  const contentDescription = usefulValue(attributes['content-desc']);
  const text = usefulValue(attributes.text);
  const className = usefulValue(attributes.class);

  if (resourceId && !resourceId.startsWith('android:', 0)) {
    candidates.push({ strategy: 'resourceId', value: resourceId, score: 100 });
  }
  if (contentDescription) candidates.push({ strategy: 'accessibilityId', value: contentDescription, score: 95 });
  if (text) candidates.push({ strategy: 'text', value: text, score: 72 });
  if (className) candidates.push({ strategy: 'role', value: className, score: 40 });
  return rankLocators(candidates, 'android');
}

function observedNodes(xml, packageName) {
  return [...xml.matchAll(/<node\b([^>]*)>/gu)]
    .map((match) => attributesForNode(match[1]))
    .flatMap((attributes) => {
      if (packageName && attributes.package !== packageName) return [];
      const bounds = boundsFor(attributes.bounds);
      if (!bounds) return [];
      return candidatesForNode(attributes).map((candidate) => ({
        ...candidate,
        clickable: attributes.clickable === 'true',
        bounds,
        packageName: attributes.package,
      }));
    })
    .sort((left, right) => right.score - left.score);
}

function bestObservedActionNode(nodes) {
  return nodes.find((node) => node.clickable && node.strategy !== 'role')
    ?? nodes.find((node) => node.strategy !== 'role')
    ?? nodes.find((node) => node.clickable)
    ?? nodes[0];
}

function firstObservedNode(xml, packageName) {
  const nodes = observedNodes(xml, packageName);
  // Generator actions begin with tap/click/assert against the target. Prefer
  // the strongest semantic evidence (resource-id, accessibility id, or text)
  // that is also clickable. Some Android hierarchies mark only a generic
  // parent as clickable while exposing the useful text on a child; in that
  // case the observed semantic child is a better generator target. A generic
  // role is the final observed fallback. Coordinates are never invented here.
  return bestObservedActionNode(nodes);
}

/**
 * Selects a schema-safe semantic value observed in the live Android
 * hierarchy. The caller must retain the returned hierarchy hash as evidence;
 * this helper never invents a selector or falls back to coordinates.
 */
export function firstObservedSelector(xml, packageName) {
  const node = firstObservedNode(xml, packageName);
  if (!node) return undefined;
  return { strategy: node.strategy, value: node.value, score: node.score };
}

export function observedSelectors(xml, limit = 32, packageName) {
  const seen = new Set();
  return observedNodes(xml, packageName)
    .map((node) => ({ strategy: node.strategy, value: node.value, score: node.score }))
    .filter((selector) => {
      const key = `${selector.strategy}:${selector.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function firstObservedNodeWithBounds(xml, packageName) {
  const nodes = observedNodes(xml, packageName);
  return bestObservedActionNode(nodes);
}

export function firstObservedTextInput(xml, packageName) {
  const candidates = [...xml.matchAll(/<node\b([^>]*)>([\s\S]*?)<\/node>/gu)]
    .map((match) => ({ attributes: attributesForNode(match[1]), body: match[2] }))
    .filter(({ attributes }) =>
      (!packageName || attributes.package === packageName)
      && attributes.class?.includes('EditText')
      && attributes.enabled !== 'false',
    )
    .flatMap(({ attributes, body }) => {
      const observed = candidatesForNode(attributes);
      const descendantText = [...body.matchAll(/\btext="([^"]+)"/gu)]
        .map((match) => usefulValue(decodeXmlAttribute(match[1])))
        .find(Boolean);
      if (descendantText) observed.push({ strategy: 'text', value: descendantText, score: 72 });
      const selector = rankLocators(observed, 'android')[0];
      if (!selector) return [];
      return [{ selector, value: attributes.text ?? '' }];
    });
  return candidates[0];
}

export function appiumLocatorFor(selector) {
  if (!selector) return undefined;
  if (selector.strategy === 'resourceId' || selector.strategy === 'id') {
    return { strategy: 'id', value: selector.value };
  }
  if (selector.strategy === 'accessibilityId') {
    return { strategy: 'accessibility id', value: selector.value };
  }
  return {
    strategy: '-android uiautomator',
    value: `new UiSelector().text(${JSON.stringify(selector.value)})`,
  };
}
import { rankLocators } from '@automate-plus/selector-engine';
