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
    const loc = this.getPrimaryLocator(action);
    const selector = loc ? this.formatWdioSelector(loc) : '';
    const selectorValue = this.getJsValue(selector);
    const value = this.getJsValue(action.value);
    const expected = this.getJsValue(this.getAssertionExpected(action));
    const step = action.stepNumber;

    switch (action.action) {
      case 'tap':
      case 'click':
        return `    await (await driver.$(${selectorValue})).click();`;

      case 'doubleTap':
      case 'doubleClick': {
        const element = `element${step}`;
        return [
          `    const ${element} = await driver.$(${selectorValue});`,
          `    await ${element}.click();`,
          `    await ${element}.click();`,
        ].join('\n');
      }

      case 'longPress': {
        const element = `element${step}`;
        return [
          `    const ${element} = await driver.$(${selectorValue});`,
          `    await driver.action('pointer')`,
          `      .move({ origin: ${element} })`,
          `      .down()`,
          `      .pause(1000)`,
          `      .up()`,
          `      .perform();`,
        ].join('\n');
      }

      case 'fill': {
        const element = `element${step}`;
        return [
          `    const ${element} = await driver.$(${selectorValue});`,
          `    await ${element}.clearValue();`,
          `    await ${element}.setValue(${value});`,
        ].join('\n');
      }

      case 'clear':
        return `    await (await driver.$(${selectorValue})).clearValue();`;

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
        const source = `source${step}`;
        const target = `target${step}`;
        const targetSelector = this.getJsValue(this.formatWdioSelector(this.requireDragTarget(action)));
        return [
          `    const ${source} = await driver.$(${selectorValue});`,
          `    const ${target} = await driver.$(${targetSelector});`,
          `    const targetLocation${step} = await ${target}.getLocation();`,
          `    await driver.execute('mobile: dragGesture', {`,
          `      elementId: ${source}.elementId,`,
          `      endX: targetLocation${step}.x,`,
          `      endY: targetLocation${step}.y,`,
          `    });`,
        ].join('\n');
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
        const element = `element${step}`;
        return [
          `    const ${element} = await driver.$(${selectorValue});`,
          `    if (!(await ${element}.isDisplayed())) throw new Error('Android visibility assertion failed');`,
        ].join('\n');
      }

      case 'assertHidden': {
        const element = `element${step}`;
        return [
          `    const ${element} = await driver.$(${selectorValue});`,
          `    if (await ${element}.isDisplayed()) throw new Error('Android hidden assertion failed');`,
        ].join('\n');
      }

      case 'assertText': {
        const element = `element${step}`;
        return [
          `    const ${element} = await driver.$(${selectorValue});`,
          `    const actualText${step} = await ${element}.getText();`,
          `    if (!actualText${step}.includes(String(${expected}))) throw new Error('Android text assertion failed');`,
        ].join('\n');
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
