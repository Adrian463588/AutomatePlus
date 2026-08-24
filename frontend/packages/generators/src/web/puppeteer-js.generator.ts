import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class PuppeteerJsGenerator extends BaseCodeGenerator {
  public readonly framework = 'puppeteer';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `import puppeteer from 'puppeteer';`,
      `import { mkdir } from 'node:fs/promises';`,
      `import { basename } from 'node:path';`,
      ``,
      `async function main() {`,
      `  const launchOptions = {`,
      `    headless: process.env.AUTOMATEPLUS_HEADLESS !== '0',`,
      `    ...(process.env.AUTOMATEPLUS_BROWSER_EXECUTABLE ? { executablePath: process.env.AUTOMATEPLUS_BROWSER_EXECUTABLE } : {}),`,
      `  };`,
      `  const browser = await puppeteer.launch(launchOptions);`,
      `  const page = await browser.newPage();`,
      `  await mkdir('screenshots', { recursive: true });`,
      `  try {`,
      session.targetConfig.startUrl && !this.hasExplicitNavigate(session)
        ? `    await page.goto(${this.getJsValue(session.targetConfig.startUrl)});`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const selector = loc ? this.formatPuppeteerSelector(loc) : '';
    const val = this.getJsValue(action.value);
    const expected = this.getJsValue(this.getAssertionExpected(action));
    if (['assertText', 'assertValue', 'assertUrl'].includes(action.action)) this.requireAssertionOperator(action, ['equals']);

    switch (action.action) {
      case 'navigate':
        return `    await page.goto(${val});`;

      case 'click':
        return `    await page.locator(${selector}).click();`;

      case 'doubleClick':
        return `    await page.locator(${selector}).click({ count: 2 });`;

      case 'rightClick':
        return `    await page.locator(${selector}).click({ button: 'right' });`;

      case 'hover':
        return `    await page.locator(${selector}).hover();`;

      case 'fill':
        return `    await page.locator(${selector}).fill(${val});`;

      case 'clear':
        return `    await page.locator(${selector}).fill('');`;

      case 'pressKey':
        return `    await page.keyboard.press(${JSON.stringify(this.getWebKeyValue(action.value))});`;

      case 'scroll':
        return `    await page.mouse.wheel({ deltaX: ${action.scrollOffset?.deltaX ?? 0}, deltaY: ${action.scrollOffset?.deltaY ?? 0} });`;

      case 'waitFor':
        return `    await page.waitForSelector(${selector}, { visible: true });`;

      case 'sleep':
        return `    await new Promise((r) => setTimeout(r, ${action.timeoutMs ?? 1000}));`;

      case 'takeScreenshot':
        return `    await page.screenshot({ path: 'screenshots/' + basename(${action.value ? val : "'screenshot.png'"}) });`;

      case 'assertVisible':
        return `    const isVisible = await page.$eval(${selector}, (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));\n    if (!isVisible) throw new Error('Expected element to be visible.');`;

      case 'assertText':
        return `    const text = await page.$eval(${selector}, (el) => el.textContent ?? '');\n    if (text !== ${expected}) throw new Error('Expected element text to equal the requested value.');`;

      case 'assertValue':
        return `    const value = await page.$eval(${selector}, (el) => el.value);\n    if (value !== ${expected}) throw new Error('Expected element value to match the requested value.');`;

      case 'assertUrl':
        return `    if (page.url() !== ${expected}) throw new Error('Expected URL to equal the requested value.');`;

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `  } finally {`,
      `    await browser.close();`,
      `  }`,
      `}`,
      ``,
      `await main();`,
    ].join('\n');
  }

  private formatPuppeteerSelector(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return JSON.stringify(`[data-testid="${loc.value}"]`);
      case 'id':
        return JSON.stringify(`#${loc.value}`);
      case 'css':
        return JSON.stringify(loc.value);
      case 'text':
        return JSON.stringify(`::-p-text(${JSON.stringify(loc.value)})`);
      case 'role': {
        const selector = loc.name
          ? `::-p-aria([name=${JSON.stringify(loc.name)}][role=${JSON.stringify(loc.role ?? 'button')}])`
          : `::-p-aria([role=${JSON.stringify(loc.role ?? 'button')}])`;
        return JSON.stringify(selector);
      }
      case 'label':
        return JSON.stringify(`::-p-aria(${JSON.stringify(loc.value)})`);
      case 'accessibilityId':
        return JSON.stringify(`[aria-label="${loc.value}"]`);
      case 'resourceId':
        return JSON.stringify(`[id="${loc.value}"]`);
      case 'name':
        return JSON.stringify(`[name="${loc.value}"]`);
      case 'xpath':
        return JSON.stringify(`xpath/${loc.value}`);
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
