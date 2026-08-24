import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { CapabilityError, GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class MaestroYamlGenerator extends BaseCodeGenerator {
  public readonly framework = 'maestro';
  public readonly language = 'yaml';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const appId = this.requireAndroidPackage(session);
    return [
      `appId: ${this.yamlString(appId)}`,
      `---`,
      `- launchApp`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const rawValue = this.getRawValue(action.value);
    const expected = this.getRawValue(this.getAssertionExpected(action));

    switch (action.action) {
      case 'tap':
      case 'click':
        return `- tapOn:\n    ${this.formatMaestroSelector(this.requireLocator(action))}`;

      case 'doubleTap':
      case 'doubleClick':
        return `- doubleTapOn:\n    ${this.formatMaestroSelector(this.requireLocator(action))}`;

      case 'longPress':
        return `- longPressOn:\n    ${this.formatMaestroSelector(this.requireLocator(action))}`;

      case 'fill':
        return `- tapOn:\n    ${this.formatMaestroSelector(this.requireLocator(action))}\n- inputText: ${this.yamlString(rawValue)}`;

      case 'clear':
        return `- tapOn:\n    ${this.formatMaestroSelector(this.requireLocator(action))}\n- eraseText`;

      case 'back':
        return `- back`;

      case 'scroll':
        return `- scroll`;

      case 'swipe': {
        const vector = action.swipeVector;
        if (!vector) return this.unsupportedAction(action);
        return [
          `- swipe:`,
          `    start: ${vector.startX}, ${vector.startY}`,
          `    end: ${vector.endX}, ${vector.endY}`,
          `    duration: ${vector.durationMs}`,
        ].join('\n');
      }

      case 'sleep':
        return `- waitForAnimationToEnd:\n    timeout: ${action.timeoutMs ?? 1000}`;

      case 'takeScreenshot': {
        const name = rawValue.replace(/[^A-Za-z0-9_-]/gu, '_') || 'screenshot';
        if (rawValue.includes('${')) {
          throw new CapabilityError('Maestro screenshot names must be concrete file names, not secret references.', {
            framework: this.framework,
            language: this.language,
            action: action.action,
          });
        }
        return `- takeScreenshot: ${this.yamlString(name)}`;
      }

      case 'assertVisible':
        return `- assertVisible:\n    ${this.formatMaestroSelector(this.requireLocator(action))}`;

      case 'assertText':
        return `- assertVisible:\n    ${this.formatMaestroTextAssertion(this.requireLocator(action), expected)}`;

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return '';
  }

  private formatMaestroSelector(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'resourceId':
        return `id: ${this.yamlString(loc.value)}`;
      case 'accessibilityId':
      case 'text':
        return `text: ${this.yamlString(loc.value)}`;
      default:
        return this.unsupportedLocator(loc);
    }
  }

  private formatMaestroTextAssertion(loc: LocatorCandidate, expected: string): string {
    const exactText = `^${expected.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`;
    if (loc.strategy === 'resourceId') {
      return `id: ${this.yamlString(loc.value)}\n    text: ${this.yamlString(exactText)}`;
    }
    if (loc.strategy === 'text' || loc.strategy === 'accessibilityId') {
      return `text: ${this.yamlString(exactText)}`;
    }
    return this.unsupportedLocator(loc);
  }

  private yamlString(value: string): string {
    return JSON.stringify(value);
  }
}
