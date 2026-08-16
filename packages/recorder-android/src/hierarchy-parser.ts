import { LocatorCandidate } from '@automate-plus/ir-schema';
import { rankLocators } from '@automate-plus/selector-engine';

export interface AndroidUiNode {
  resourceId?: string;
  contentDesc?: string;
  text?: string;
  className?: string;
  packageName?: string;
  bounds: { left: number; top: number; right: number; bottom: number };
}

export function parseUiHierarchy(xml: string): AndroidUiNode[] {
  const nodes: AndroidUiNode[] = [];
  const nodePattern = /<node\b([^>]*?)(?:\/>|>)/g;

  for (const nodeMatch of xml.matchAll(nodePattern)) {
    const attributes = parseXmlAttributes(nodeMatch[1]);
    const bounds = attributes.bounds ? parseBounds(attributes.bounds) : undefined;
    if (!bounds) continue;

    nodes.push({
      resourceId: attributes['resource-id'],
      contentDesc: attributes['content-desc'],
      text: attributes.text,
      className: attributes.class,
      packageName: attributes.package,
      bounds,
    });
  }

  return nodes;
}

export function parseBounds(boundsStr: string): { left: number; top: number; right: number; bottom: number } | undefined {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return undefined;
  return {
    left: parseInt(match[1], 10),
    top: parseInt(match[2], 10),
    right: parseInt(match[3], 10),
    bottom: parseInt(match[4], 10),
  };
}

export function findNodeByCoordinates(
  nodes: AndroidUiNode[],
  x: number,
  y: number
): AndroidUiNode | undefined {
  // Find deepest/smallest matching element containing (x, y)
  const matches = nodes.filter((node) => {
    const { left, top, right, bottom } = node.bounds;
    return x >= left && x <= right && y >= top && y <= bottom;
  });

  if (matches.length === 0) return undefined;

  // Sort by smallest area (most specific leaf element)
  return matches.sort((a, b) => {
    const areaA = (a.bounds.right - a.bounds.left) * (a.bounds.bottom - a.bounds.top);
    const areaB = (b.bounds.right - b.bounds.left) * (b.bounds.bottom - b.bounds.top);
    return areaA - areaB;
  })[0];
}

export function extractAndroidLocators(node?: AndroidUiNode): LocatorCandidate[] {
  if (!node) {
    return [];
  }

  const candidates: LocatorCandidate[] = [];

  // 1. resource-id
  if (node.resourceId && node.resourceId.length > 0) {
    candidates.push({ strategy: 'resourceId', value: node.resourceId, score: 100 });
  }

  // 2. content-desc / accessibility id
  if (node.contentDesc && node.contentDesc.length > 0) {
    candidates.push({ strategy: 'accessibilityId', value: node.contentDesc, score: 95 });
  }

  // 3. text
  if (node.text && node.text.trim().length > 0) {
    candidates.push({ strategy: 'text', value: node.text.trim(), score: 65 });
  }

  // 4. class name
  if (node.className && node.className.length > 0) {
    candidates.push({ strategy: 'role', value: node.className, score: 40 });
  }

  // 5. bounds
  candidates.push({
    strategy: 'bounds',
    value: `[${node.bounds.left},${node.bounds.top}][${node.bounds.right},${node.bounds.bottom}]`,
    score: 30,
  });

  return rankLocators(candidates, 'android');
}

function parseXmlAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g;
  for (const match of source.matchAll(attributePattern)) {
    attributes[match[1]] = decodeXmlAttribute(match[2]);
  }
  return attributes;
}

function decodeXmlAttribute(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}
