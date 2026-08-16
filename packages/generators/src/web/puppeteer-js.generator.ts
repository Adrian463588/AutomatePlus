import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class PuppeteerJsGenerator extends BaseCodeGenerator {
  public readonly framework = 'puppeteer';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `const puppeteer = require('puppeteer');`,
      ``,
      `describe('${session.name}', () => {`,
      `  let browser;`,
      `  let page;`,
      ``,
      `  beforeAll(async () => {`,
      `    browser = await puppeteer.launch({ headless: false });`,
      `    page = await browser.newPage();`,
      session.targetConfig.startUrl
        ? `    await page.goto('${session.targetConfig.startUrl}');`
        : '',
      `  });`,
      ``,
      `  afterAll(async () => {`,
      `    await browser.close();`,
      `  });`,
      ``,
      `  it('should execute recorded puppeteer test session', async () => {`,
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const selector = loc ? this.formatPuppeteerSelector(loc) : '';
    const val = this.getJsValue(action.value);
    const expected = this.getJsValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'navigate':
        return `    await page.goto(${val});`;

      case 'click':
        return `    await page.locator('${selector}').click();`;

      case 'doubleClick':
        return `    await page.locator('${selector}').click({ count: 2 });`;

      case 'rightClick':
        return `    await page.locator('${selector}').click({ button: 'right' });`;

      case 'hover':
        return `    await page.locator('${selector}').hover();`;

      case 'fill':
        return `    await page.locator('${selector}').fill(${val});`;

      case 'clear':
        return `    await page.$eval('${selector}', (el) => el.value = '');`;

      case 'pressKey':
        return `    await page.keyboard.press(${val || "'Enter'"});`;

      case 'scroll':
        return `    await page.mouse.wheel({ deltaX: ${action.scrollOffset?.deltaX ?? 0}, deltaY: ${action.scrollOffset?.deltaY ?? 0} });`;

      case 'waitFor':
        return `    await page.waitForSelector('${selector}', { visible: true });`;

      case 'sleep':
        return `    await new Promise((r) => setTimeout(r, ${action.timeoutMs ?? 1000}));`;

      case 'takeScreenshot':
        return `    await page.screenshot({ path: 'screenshots/' + ${val || "'screenshot.png'"} });`;

      case 'assertVisible':
        return `    const isVisible = await page.$eval('${selector}', (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));\n    expect(isVisible).toBe(true);`;

      case 'assertText':
        return `    const text = await page.$eval('${selector}', (el) => el.textContent);\n    expect(text).toContain(${expected});`;

      case 'assertValue':
        return `    const val = await page.$eval('${selector}', (el) => el.value);\n    expect(val).toBe(${expected});`;

      case 'assertUrl':
        return `    expect(page.url()).toContain(${expected});`;

      default:
        return `    // Action: ${action.action}`;
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `  });`,
      `});`,
    ].join('\n');
  }

  private formatPuppeteerSelector(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `[data-testid="${loc.value}"]`;
      case 'id':
        return `#${loc.value}`;
      case 'css':
      default:
        return loc.value;
    }
  }
}
