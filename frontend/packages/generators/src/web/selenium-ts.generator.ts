import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class SeleniumTsGenerator extends BaseCodeGenerator {
  public readonly framework = 'selenium';
  public readonly language = 'typescript';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `import { Builder, By, until, WebDriver, Key } from 'selenium-webdriver';`,
      `import chrome from 'selenium-webdriver/chrome.js';`,
      `import { mkdir, writeFile } from 'node:fs/promises';`,
      `import { basename } from 'node:path';`,
      ``,
      `async function main(): Promise<void> {`,
      `  const browserExecutable = process.env.AUTOMATEPLUS_BROWSER_EXECUTABLE;`,
      `  const driverExecutable = process.env.AUTOMATEPLUS_DRIVER_EXECUTABLE;`,
      `  if (!browserExecutable || !driverExecutable) throw new Error('AutomatePlus requires AUTOMATEPLUS_BROWSER_EXECUTABLE and AUTOMATEPLUS_DRIVER_EXECUTABLE for offline Selenium execution.');`,
      `  const chromeOptions = new chrome.Options().setChromeBinaryPath(browserExecutable);`,
      `  const chromeService = new chrome.ServiceBuilder(driverExecutable);`,
      `  const driver: WebDriver = await new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).setChromeService(chromeService).build();`,
      `  await mkdir('screenshots', { recursive: true });`,
      `  try {`,
      `    await driver.manage().window().maximize();`,
      session.targetConfig.startUrl && !this.hasExplicitNavigate(session)
        ? `    await driver.get(${this.getJsValue(session.targetConfig.startUrl)});`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const byClause = loc ? this.formatSeleniumBy(loc) : '';
    const val = this.getJsValue(action.value);
    const expected = this.getJsValue(this.getAssertionExpected(action));
    if (['assertText', 'assertValue', 'assertUrl'].includes(action.action)) this.requireAssertionOperator(action, ['equals']);

    switch (action.action) {
      case 'navigate':
        return `    await driver.get(${val});`;

      case 'click':
        return `    await (await driver.wait(until.elementLocated(${byClause}), 10000)).click();`;

      case 'doubleClick':
        return `    const element${action.stepNumber} = await driver.wait(until.elementLocated(${byClause}), 10000);\n    await driver.actions().doubleClick(element${action.stepNumber}).perform();`;

      case 'rightClick':
        return `    const element${action.stepNumber} = await driver.wait(until.elementLocated(${byClause}), 10000);\n    await driver.actions().contextClick(element${action.stepNumber}).perform();`;

      case 'hover':
        return `    const element${action.stepNumber} = await driver.wait(until.elementLocated(${byClause}), 10000);\n    await driver.actions().move({ origin: element${action.stepNumber} }).perform();`;

      case 'fill':
        return `    const element${action.stepNumber} = await driver.wait(until.elementLocated(${byClause}), 10000);\n    await element${action.stepNumber}.clear();\n    await element${action.stepNumber}.sendKeys(${val});`;

      case 'clear':
        return `    await (await driver.wait(until.elementLocated(${byClause}), 10000)).clear();`;

      case 'pressKey':
        {
          const key = this.getSeleniumKeyValue(action.value);
          const keyCode = key.length === 1 ? JSON.stringify(key) : `Key.${key}`;
          return `    await driver.actions().sendKeys(${keyCode}).perform();`;
        }

      case 'dragAndDrop': {
        const targetLoc = this.requireDragTarget(action);
        const targetBy = this.formatSeleniumBy(targetLoc);
        return `    const sourceElement${action.stepNumber} = await driver.wait(until.elementLocated(${byClause}), 10000);\n    const targetElement${action.stepNumber} = await driver.wait(until.elementLocated(${targetBy}), 10000);\n    await driver.actions().dragAndDrop(sourceElement${action.stepNumber}, targetElement${action.stepNumber}).perform();`;
      }

      case 'scroll':
        return `    await driver.executeScript('window.scrollBy(${action.scrollOffset?.deltaX ?? 0}, ${action.scrollOffset?.deltaY ?? 0});');`;

      case 'sleep':
        return `    await driver.sleep(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot':
        return `    const image${action.stepNumber} = await driver.takeScreenshot();\n    await writeFile('screenshots/' + basename(${action.value ? val : "'screenshot.png'"}), image${action.stepNumber}, 'base64');`;

      case 'assertVisible':
        return `    if (!await (await driver.wait(until.elementLocated(${byClause}), 10000)).isDisplayed()) throw new Error('Expected element to be visible.');`;

      case 'assertHidden':
        return `    if (!await driver.wait(async () => { const elements = await driver.findElements(${byClause}); return elements.length === 0 || !(await elements[0].isDisplayed()); }, 10000)) throw new Error('Expected element to be hidden.');`;

      case 'assertText':
        return `    if ((await driver.wait(until.elementLocated(${byClause}), 10000)).getText() !== ${expected}) throw new Error('Expected element text to equal the requested value.');`;

      case 'assertValue':
        return `    if (await (await driver.wait(until.elementLocated(${byClause}), 10000)).getAttribute('value') !== ${expected}) throw new Error('Expected element value to match the requested value.');`;

      case 'assertUrl':
        return `    if ((await driver.getCurrentUrl()) !== ${expected}) throw new Error('Expected URL to equal the requested value.');`;

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `  } finally {`,
      `    await driver.quit();`,
      `  }`,
      `}`,
      ``,
      `await main();`,
    ].join('\n');
  }

  private formatSeleniumBy(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `By.css(${JSON.stringify(`[data-testid="${loc.value}"]`)})`;
      case 'xpath':
        return `By.xpath(${JSON.stringify(loc.value)})`;
      case 'id':
        return `By.id(${JSON.stringify(loc.value)})`;
      case 'name':
        return `By.name(${JSON.stringify(loc.value)})`;
      case 'text':
        return `By.xpath(${JSON.stringify(`//*[normalize-space(.)=${JSON.stringify(loc.value)}]`)})`;
      case 'css':
        return `By.css(${JSON.stringify(loc.value)})`;
      case 'role':
        return `By.css(${JSON.stringify(`[role="${loc.role ?? 'button'}"]`)})`;
      case 'label':
        return `By.css(${JSON.stringify(`[aria-label="${loc.value}"]`)})`;
      case 'accessibilityId':
        return `By.css(${JSON.stringify(`[aria-label="${loc.value}"]`)})`;
      case 'resourceId':
        return `By.css(${JSON.stringify(`[id="${loc.value}"]`)})`;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
