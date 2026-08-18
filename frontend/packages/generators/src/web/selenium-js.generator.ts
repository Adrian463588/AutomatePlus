import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class SeleniumJsGenerator extends BaseCodeGenerator {
  public readonly framework = 'selenium';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `const { Builder, By, until, Key } = require('selenium-webdriver');`,
      `const fs = require('fs');`,
      ``,
      `describe('${session.name}', () => {`,
      `  let driver;`,
      ``,
      `  beforeAll(async () => {`,
      `    driver = await new Builder().forBrowser('chrome').build();`,
      `    await driver.manage().window().maximize();`,
      session.targetConfig.startUrl
        ? `    await driver.get('${session.targetConfig.startUrl}');`
        : '',
      `  });`,
      ``,
      `  afterAll(async () => {`,
      `    await driver.quit();`,
      `  });`,
      ``,
      `  it('should execute recorded selenium test session', async () => {`,
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const byClause = loc ? this.formatSeleniumBy(loc) : '';
    const val = this.getJsValue(action.value);
    const rawVal = this.getRawValue(action.value);
    const expected = this.getJsValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'navigate':
        return `    await driver.get(${val});`;

      case 'click':
        return `    await (await driver.wait(until.elementLocated(${byClause}), 10000)).click();`;

      case 'doubleClick':
        return `    const el = await driver.wait(until.elementLocated(${byClause}), 10000);\n    await driver.actions().doubleClick(el).perform();`;

      case 'rightClick':
        return `    const el = await driver.wait(until.elementLocated(${byClause}), 10000);\n    await driver.actions().contextClick(el).perform();`;

      case 'hover':
        return `    const el = await driver.wait(until.elementLocated(${byClause}), 10000);\n    await driver.actions().move({ origin: el }).perform();`;

      case 'fill':
        return `    const el = await driver.wait(until.elementLocated(${byClause}), 10000);\n    await el.clear();\n    await el.sendKeys(${val});`;

      case 'clear':
        return `    await (await driver.wait(until.elementLocated(${byClause}), 10000)).clear();`;

      case 'pressKey':
        return `    await driver.actions().sendKeys(Key.${rawVal.toUpperCase() || 'ENTER'}).perform();`;

      case 'dragAndDrop': {
        const targetLoc = action.dragTarget?.locators[0];
        const targetBy = targetLoc ? this.formatSeleniumBy(targetLoc) : `By.css('body')`;
        return `    const src = await driver.wait(until.elementLocated(${byClause}), 10000);\n    const dst = await driver.wait(until.elementLocated(${targetBy}), 10000);\n    await driver.actions().dragAndDrop(src, dst).perform();`;
      }

      case 'scroll':
        return `    await driver.executeScript('window.scrollBy(${action.scrollOffset?.deltaX ?? 0}, ${action.scrollOffset?.deltaY ?? 0});');`;

      case 'sleep':
        return `    await driver.sleep(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot':
        return `    const img = await driver.takeScreenshot();\n    fs.writeFileSync('screenshots/' + (${val} || 'screenshot.png'), img, 'base64');`;

      case 'assertVisible':
        return `    expect(await (await driver.wait(until.elementLocated(${byClause}), 10000)).isDisplayed()).toBe(true);`;

      case 'assertText':
        return `    expect(await (await driver.wait(until.elementLocated(${byClause}), 10000)).getText()).toContain(${expected});`;

      case 'assertValue':
        return `    expect(await (await driver.wait(until.elementLocated(${byClause}), 10000)).getAttribute('value')).toBe(${expected});`;

      case 'assertUrl':
        return `    expect(await driver.getCurrentUrl()).toContain(${expected});`;

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

  private formatSeleniumBy(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `By.css('[data-testid="${loc.value}"]')`;
      case 'xpath':
        return `By.xpath('${loc.value}')`;
      case 'id':
        return `By.id('${loc.value}')`;
      case 'name':
        return `By.name('${loc.value}')`;
      case 'text':
        return `By.xpath("//*[text()='${loc.value}']")`;
      case 'css':
        return `By.css('${loc.value}')`;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
