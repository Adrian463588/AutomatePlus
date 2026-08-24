import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';
import { renderAppiumRuntimeContext } from './appium-runtime-context.js';

export class AppiumJsGenerator extends BaseCodeGenerator {
  public readonly framework = 'appium';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, options?: GeneratorOptions): string {
    const appPackage = session.targetConfig.appPackage;
    const appActivity = session.targetConfig.appActivity;
    return [
      `import { mkdir } from 'node:fs/promises';`,
      `import { basename, join } from 'node:path';`,
      `import { remote } from 'webdriverio';`,
      `import { withAppiumLocatorHealing } from './automateplus-healing.js';`,
      ``,
      renderAppiumRuntimeContext(this.getRuntimeContext(options), 'javascript'),
      ``,
      `async function main() {`,
      `  await mkdir('screenshots', { recursive: true });`,
      `  const driver = await remote({`,
      `    hostname: runtimeContext.appiumUrl.hostname,`,
      `    port: Number(runtimeContext.appiumUrl.port),`,
      `    path: runtimeContext.appiumUrl.pathname || '/',`,
      `    protocol: runtimeContext.appiumUrl.protocol.replace(':', ''),`,
      `    capabilities: {`,
      `      platformName: 'Android',`,
      `      'appium:automationName': 'UiAutomator2',`,
      `      'appium:udid': runtimeContext.udid,`,
      `      'appium:systemPort': runtimeContext.systemPort,`,
      `      'appium:mjpegServerPort': runtimeContext.mjpegServerPort,`,
      `      ...(runtimeContext.chromedriverPort === undefined ? {} : { 'appium:chromedriverPort': runtimeContext.chromedriverPort }),`,
      appPackage ? `      'appium:appPackage': ${this.getJsValue(appPackage)},` : '',
      appActivity ? `      'appium:appActivity': ${this.getJsValue(appActivity)},` : '',
      `    },`,
      `  });`,
      `  try {`,
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const value = this.getJsValue(action.value);
    const expected = this.getJsValue(this.getAssertionExpected(action));
    const step = action.stepNumber;

    switch (action.action) {
      case 'tap':
      case 'click':
        return `    await ${this.formatElementAction(action, (element) => `${element}.click()`)};`;

      case 'doubleTap':
      case 'doubleClick': {
        return `    await ${this.formatElementAction(action, (candidate) => `(async () => { await ${candidate}.click(); await ${candidate}.click(); })()`)}`;
      }

      case 'longPress': {
        return `    await ${this.formatElementAction(action, (candidate) => `(async () => { await driver.action('pointer').move({ origin: ${candidate} }).down().pause(1000).up().perform(); })()`)}`;
      }

      case 'fill': {
        return `    await ${this.formatElementAction(action, (candidate) => `(async () => { await ${candidate}.clearValue(); await ${candidate}.setValue(${value}); })()`)}`;
      }

      case 'clear':
        return `    await ${this.formatElementAction(action, (element) => `${element}.clearValue()`)};`;

      case 'swipe': {
        const vector = action.swipeVector;
        if (!vector) return this.unsupportedAction(action);
        const { startX: sx, startY: sy, endX: ex, endY: ey, durationMs } = vector;
        return [
          `    await driver.action('pointer')`,
          `      .move({ x: ${sx}, y: ${sy} })`,
          `      .down()`,
          `      .move({ x: ${ex}, y: ${ey}, duration: ${durationMs} })`,
          `      .up()`,
          `      .perform();`,
        ].join('\n');
      }

      case 'drag':
      case 'dragAndDrop': {
        const target = `target${step}`;
        const targetSelector = this.getJsValue(this.formatWdioSelector(this.requireDragTarget(action)));
        return `    await ${this.formatElementAction(action, (sourceElement) => `(async () => { const ${target} = await driver.$(${targetSelector}); const targetLocation${step} = await ${target}.getLocation(); await driver.execute('mobile: dragGesture', { elementId: ${sourceElement}.elementId, endX: targetLocation${step}.x, endY: targetLocation${step}.y }); })()`)}`;
      }

      case 'back':
        return `    await driver.back();`;

      case 'home':
        return `    await driver.pressKeyCode(3);`;

      case 'enter':
        return `    await driver.pressKeyCode(66);`;

      case 'sleep':
        return `    await driver.pause(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot': {
        const name = `screenshotName${step}`;
        return [
          `    const raw${name} = basename(String(${value} || 'screenshot'));`,
          `    const ${name} = raw${name}.replace(/[^A-Za-z0-9_-]/gu, '_') || 'screenshot';`,
          `    await driver.saveScreenshot(join('screenshots', ${name} + '.png'));`,
        ].join('\n');
      }

      case 'assertVisible': {
        return `    await ${this.formatElementAction(action, (element) => `(async () => { if (!(await ${element}.isDisplayed())) throw new Error('Android visibility assertion failed'); })()`)}`;
      }

      case 'assertHidden': {
        return `    await ${this.formatElementAction(action, (element) => `(async () => { if (await ${element}.isDisplayed()) throw new Error('Android hidden assertion failed'); })()`)}`;
      }

      case 'assertText': {
        return `    await ${this.formatElementAction(action, (element) => `(async () => { const actualText = await ${element}.getText(); if (!actualText.includes(String(${expected}))) throw new Error('Android text assertion failed'); })()`)}`;
      }

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `  } finally {`,
      `    await driver.deleteSession();`,
      `  }`,
      `}`,
      ``,
      `main().catch((error) => {`,
      `  console.error(error);`,
      `  process.exitCode = 1;`,
      `});`,
    ].join('\n');
  }

  private formatElementAction(action: ActionIR, operation: (element: string) => string): string {
    const candidates = this.getGeneratedLocatorCandidates(action);
    if (candidates.length === 0) this.requireLocator(action);
    const selectors = candidates.map((candidate) => this.getJsValue(this.formatWdioSelector(candidate))).join(', ');
    return `withAppiumLocatorHealing(driver, ${JSON.stringify(action.id)}, [${selectors}], async (element) => ${operation('element')})`;
  }

  private formatWdioSelector(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'accessibilityId':
        return `~${loc.value}`;
      case 'resourceId':
        return `android=new UiSelector().resourceId(${JSON.stringify(loc.value)})`;
      case 'text':
        return `android=new UiSelector().text(${JSON.stringify(loc.value)})`;
      case 'role':
        return `android=new UiSelector().className(${JSON.stringify(loc.value)})`;
      case 'xpath':
        return loc.value;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
