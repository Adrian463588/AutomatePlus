import { createHash } from 'node:crypto';
import { DeviceObservation, DeviceObservationStatus } from '@automate-plus/contracts';
import { ActionIR, LocatorCandidate } from '@automate-plus/ir-schema';
import { AndroidBridgeError } from './android-errors.js';
import { AndroidUiNode, parseUiHierarchy } from './hierarchy-parser.js';

export interface FollowerObservationContext {
  recordingId: string;
  deviceId: string;
  adbSerialSnapshot?: string;
}

export interface FollowerHierarchyBridge {
  dumpUiHierarchy(deviceId: string): Promise<string>;
}

/**
 * Resolves semantic locators on each follower's own hierarchy. Coordinates
 * are intentionally never used as a fallback: a missing semantic locator is
 * evidence for review, not a successful replay.
 */
export class AndroidFollowerLocatorObserver {
  public constructor(private readonly bridge: FollowerHierarchyBridge) {}

  public async observe(
    action: ActionIR,
    context: FollowerObservationContext,
  ): Promise<DeviceObservation> {
    const hierarchy = await this.bridge.dumpUiHierarchy(context.deviceId);
    const hierarchyHash = createHash('sha256').update(hierarchy, 'utf8').digest('hex');
    const nodes = parseUiHierarchy(hierarchy);
    const semanticLocators = (action.locators ?? []).filter((locator) => locator.strategy !== 'bounds');

    if (semanticLocators.length === 0) {
      return this.observation(action, context, 'SEMANTIC_SELECTOR_MISSING', hierarchyHash, 0, false,
        'The action has no semantic locator that can be resolved on a follower.');
    }

    for (const locator of semanticLocators) {
      const matches = nodes.filter((node) => matchesLocator(node, locator));
      if (matches.length === 1) {
        return this.observation(action, context, 'MATCHED', hierarchyHash, 1, false, undefined, locator);
      }
      if (matches.length > 1) {
        return this.observation(action, context, 'NEEDS_REVIEW', hierarchyHash, matches.length, false,
          `Semantic locator '${locator.strategy}' matched ${matches.length} nodes.`, locator);
      }
    }

    return this.observation(action, context, 'DEVICE_VARIANT_MISMATCH', hierarchyHash, 0, false,
      'No semantic locator matched the follower hierarchy.');
  }

  private observation(
    action: ActionIR,
    context: FollowerObservationContext,
    status: DeviceObservationStatus,
    hierarchyHash: string,
    matchCount: number,
    fallbackUsed: boolean,
    errorMessage?: string,
    resolvedLocator?: LocatorCandidate,
  ): DeviceObservation {
    return {
      schemaVersion: 1,
      recordingId: context.recordingId,
      actionId: action.id,
      deviceId: context.deviceId,
      adbSerialSnapshot: context.adbSerialSnapshot ?? context.deviceId,
      status,
      resolvedLocator,
      matchCount,
      fallbackUsed,
      hierarchyHash,
      timestamp: Date.now(),
      errorMessage,
    };
  }
}

function matchesLocator(node: AndroidUiNode, locator: LocatorCandidate): boolean {
  switch (locator.strategy) {
    case 'resourceId':
      return node.resourceId === locator.value;
    case 'accessibilityId':
      return node.contentDesc === locator.value;
    case 'text':
      return node.text === locator.value;
    case 'role':
      return node.className === locator.value;
    default:
      return false;
  }
}

export function isFollowerObservationBlocked(error: unknown): boolean {
  return error instanceof AndroidBridgeError && error.blocked === true;
}
