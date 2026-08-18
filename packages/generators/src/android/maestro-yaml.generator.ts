import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class MaestroYamlGenerator extends BaseCodeGenerator {
  public readonly framework = 'maestro';
  public readonly language = 'yaml';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const appId = this.requireTargetField(session, 'appPackage');
    return [
      `appId: ${appId}`,
      `---`,
      `- launchApp`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const rawVal = this.getRawValue(action.value);
    const expected = this.getRawValue(action.expectedValue ?? action.value);

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
        return `- tapOn:\n    ${this.formatMaestroSelector(this.requireLocator(action))}\n- inputText: "${rawVal}"`;

      case 'clear':
        return `- tapOn:\n    ${this.formatMaestroSelector(this.requireLocator(action))}\n- eraseText`;

      case 'back':
        return `- back`;

      case 'scroll':
        return `- scroll`;

      case 'swipe':
        return this.unsupportedAction(action);

      case 'sleep':
        return `- delay: ${action.timeoutMs ?? 1000}`;

      case 'takeScreenshot':
        return `- takeScreenshot: ${rawVal || 'screenshot'}`;

      case 'assertVisible':
        return `- assertVisible:\n    ${this.formatMaestroSelector(this.requireLocator(action))}`;

      case 'assertText':
        return `- assertVisible:\n    ${this.formatMaestroSelector(this.requireLocator(action))}\n- assertVisible: "${expected}"`;

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
        return `id: "${loc.value}"`;
      case 'text':
        return `text: "${loc.value}"`;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
