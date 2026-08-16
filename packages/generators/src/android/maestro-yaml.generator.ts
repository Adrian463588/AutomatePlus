import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class MaestroYamlGenerator extends BaseCodeGenerator {
  public readonly framework = 'maestro';
  public readonly language = 'yaml';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const appId = session.targetConfig.appPackage ?? 'com.example.app';
    return [
      `appId: ${appId}`,
      `---`,
      `- launchApp`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const rawVal = this.getRawValue(action.value);
    const expected = this.getRawValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'tap':
      case 'click':
        return loc ? `- tapOn:\n    ${this.formatMaestroSelector(loc)}` : `- tapOn: { point: "50%,50%" }`;

      case 'doubleTap':
      case 'doubleClick':
        return loc ? `- doubleTapOn:\n    ${this.formatMaestroSelector(loc)}` : `- tapOn: { point: "50%,50%" }`;

      case 'longPress':
        return loc ? `- longPressOn:\n    ${this.formatMaestroSelector(loc)}` : `- longPressOn: { point: "50%,50%" }`;

      case 'fill':
        return loc
          ? `- tapOn:\n    ${this.formatMaestroSelector(loc)}\n- inputText: "${rawVal}"`
          : `- inputText: "${rawVal}"`;

      case 'clear':
        return `- eraseText`;

      case 'back':
        return `- back`;

      case 'scroll':
        return `- scroll`;

      case 'swipe':
        return `- swipe:\n    direction: UP`;

      case 'sleep':
        return `- delay: ${action.timeoutMs ?? 1000}`;

      case 'takeScreenshot':
        return `- takeScreenshot: ${rawVal || 'screenshot'}`;

      case 'assertVisible':
        return loc ? `- assertVisible:\n    ${this.formatMaestroSelector(loc)}` : `- assertVisible: "true"`;

      case 'assertText':
        return `- assertVisible: "${expected}"`;

      default:
        return `# Action: ${action.action}`;
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
        return `text: "${loc.value}"`;
    }
  }
}
