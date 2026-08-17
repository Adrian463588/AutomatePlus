import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class AppiumTsGenerator extends BaseCodeGenerator {
  public readonly framework = 'appium';
  public readonly language = 'typescript';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `import { remote } from 'webdriverio';`,
      ``,
      `describe('${session.name}', () => {`,
      `  let driver: WebdriverIO.Browser;`,
      ``,
      `  beforeAll(async () => {`,
      `    driver = await remote({`,
      `      hostname: '127.0.0.1',`,
      `      port: 4723,`,
      `      path: '/',`,
      `      capabilities: {`,
      `        platformName: 'Android',`,
      `        'appium:automationName': 'UiAutomator2',`,
      session.targetConfig.appPackage
        ? `        'appium:appPackage': '${session.targetConfig.appPackage}',`
        : '',
      session.targetConfig.appActivity
        ? `        'appium:appActivity': '${session.targetConfig.appActivity}',`
        : '',
      `      }`,
      `    });`,
      `  });`,
      ``,
      `  afterAll(async () => {`,
      `    if (driver) await driver.deleteSession();`,
      `  });`,
      ``,
      `  it('should execute recorded android test session', async () => {`,
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const selector = loc ? this.formatWdioSelector(loc) : '';
    const val = this.getJsValue(action.value);
    const expected = this.getJsValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'tap':
      case 'click':
        return `    await (await driver.$('${selector}')).click();`;

      case 'doubleTap':
      case 'doubleClick':
        return `    const el = await driver.$('${selector}');\n    await el.click();\n    await el.click();`;

      case 'longPress':
        return `    await driver.action('pointer')\n      .move({ origin: await driver.$('${selector}') })\n      .down()\n      .pause(1000)\n      .up()\n      .perform();`;

      case 'fill':
        return `    const el = await driver.$('${selector}');\n    await el.clearValue();\n    await el.setValue(${val});`;

      case 'clear':
        return `    await (await driver.$('${selector}')).clearValue();`;

      case 'swipe': {
        const vector = action.swipeVector;
        if (!vector) return this.unsupportedAction(action);
        const { startX: sx, startY: sy, endX: ex, endY: ey, durationMs } = vector;
        return `    await driver.action('pointer')\n      .move({ x: ${sx}, y: ${sy} })\n      .down()\n      .move({ x: ${ex}, y: ${ey}, duration: ${durationMs} })\n      .up()\n      .perform();`;
      }

      case 'drag':
      case 'dragAndDrop': {
        const targetSelector = this.formatWdioSelector(this.requireDragTarget(action));
        return `    const src = await driver.$('${selector}');\n    const dst = await driver.$('${targetSelector}');\n    await src.dragAndDrop(dst);`;
      }

      case 'back':
        return `    await driver.back();`;

      case 'home':
        return `    await driver.pressKeyCode(3);`;

      case 'enter':
        return `    await driver.pressKeyCode(66);`;

      case 'sleep':
        return `    await driver.pause(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot':
        return `    await driver.saveScreenshot('screenshots/' + ${val || "'screenshot.png'"});`;

      case 'assertVisible':
        return `    expect(await (await driver.$('${selector}')).isDisplayed()).toBe(true);`;

      case 'assertText':
        return `    expect(await (await driver.$('${selector}')).getText()).toContain(${expected});`;

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `  });`,
      `});`,
    ].join('\n');
  }

  private formatWdioSelector(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'accessibilityId':
        return `~${loc.value}`;
      case 'resourceId':
        return `android=new UiSelector().resourceId("${loc.value}")`;
      case 'text':
        return `android=new UiSelector().text("${loc.value}")`;
      case 'xpath':
        return loc.value;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
