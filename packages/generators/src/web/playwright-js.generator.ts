import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class PlaywrightJsGenerator extends BaseCodeGenerator {
  public readonly framework = 'playwright';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `const { test, expect } = require('@playwright/test');`,
      ``,
      `test.describe('${session.name}', () => {`,
      `  test('should execute recorded test session', async ({ page }) => {`,
      `    test.setTimeout(60000);`,
      session.targetConfig.startUrl
        ? `    await page.goto('${session.targetConfig.startUrl}');`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const locatorCode = loc ? this.formatPlaywrightLocator(loc) : '';
    const val = this.getJsValue(action.value);
    const expected = this.getJsValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'navigate':
        return `    await page.goto(${val});`;

      case 'click':
        return `    await ${locatorCode}.click();`;

      case 'doubleClick':
        return `    await ${locatorCode}.dblclick();`;

      case 'rightClick':
        return `    await ${locatorCode}.click({ button: 'right' });`;

      case 'hover':
        return `    await ${locatorCode}.hover();`;

      case 'fill':
        return `    await ${locatorCode}.fill(${val});`;

      case 'clear':
        return `    await ${locatorCode}.clear();`;

      case 'pressKey':
        return `    await page.keyboard.press(${val || "'Enter'"});`;

      case 'dragAndDrop': {
        const targetLoc = action.dragTarget?.locators[0];
        const targetCode = targetLoc ? this.formatPlaywrightLocator(targetLoc) : `page.locator('body')`;
        return `    await ${locatorCode}.dragTo(${targetCode});`;
      }

      case 'scroll':
        return `    await page.mouse.wheel(${action.scrollOffset?.deltaX ?? 0}, ${action.scrollOffset?.deltaY ?? 0});`;

      case 'waitFor':
        return `    await ${locatorCode}.waitFor({ state: 'visible' });`;

      case 'sleep':
        return `    await page.waitForTimeout(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot':
        return `    await page.screenshot({ path: 'screenshots/' + ${val || "'screenshot.png'"} });`;

      case 'assertVisible':
        return `    await expect(${locatorCode}).toBeVisible();`;

      case 'assertHidden':
        return `    await expect(${locatorCode}).toBeHidden();`;

      case 'assertText':
        return `    await expect(${locatorCode}).toHaveText(${expected});`;

      case 'assertValue':
        return `    await expect(${locatorCode}).toHaveValue(${expected});`;

      case 'assertUrl':
        return `    await expect(page).toHaveURL(${expected});`;

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

  private formatPlaywrightLocator(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `page.getByTestId('${loc.value}')`;
      case 'role':
        return loc.name
          ? `page.getByRole('${loc.role ?? 'button'}', { name: '${loc.name}' })`
          : `page.getByRole('${loc.role ?? 'button'}')`;
      case 'label':
        return `page.getByLabel('${loc.value}')`;
      case 'text':
        return `page.getByText('${loc.value}')`;
      case 'xpath':
        return `page.locator('xpath=${loc.value}')`;
      case 'css':
      case 'id':
      default:
        return `page.locator('${loc.value}')`;
    }
  }
}
