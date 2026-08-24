import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class PlaywrightJsGenerator extends BaseCodeGenerator {
  public readonly framework = 'playwright';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `import { test, expect } from '@playwright/test';`,
      `import { mkdir } from 'node:fs/promises';`,
      `import { basename } from 'node:path';`,
      ``,
      `test.describe(${JSON.stringify(session.name)}, () => {`,
      `  test('should execute recorded test session', async ({ page }) => {`,
      `    test.setTimeout(60000);`,
      `    await mkdir('screenshots', { recursive: true });`,
      session.targetConfig.startUrl && !this.hasExplicitNavigate(session)
        ? `    await page.goto(${JSON.stringify(session.targetConfig.startUrl)});`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const locatorCode = loc ? this.formatPlaywrightLocator(loc) : '';
    const val = this.getJsValue(action.value);
    const expected = this.getJsValue(this.getAssertionExpected(action));
    if (['assertText', 'assertValue', 'assertUrl'].includes(action.action)) this.requireAssertionOperator(action, ['equals']);

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
        return `    await page.keyboard.press(${JSON.stringify(this.getWebKeyValue(action.value))});`;

      case 'dragAndDrop': {
        const targetLoc = this.requireDragTarget(action);
        const targetCode = this.formatPlaywrightLocator(targetLoc);
        return `    await ${locatorCode}.dragTo(${targetCode});`;
      }

      case 'scroll':
        return `    await page.mouse.wheel(${action.scrollOffset?.deltaX ?? 0}, ${action.scrollOffset?.deltaY ?? 0});`;

      case 'waitFor':
        return `    await ${locatorCode}.waitFor({ state: 'visible' });`;

      case 'sleep':
        return `    await page.waitForTimeout(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot':
        return `    await page.screenshot({ path: 'screenshots/' + basename(${action.value ? val : "'screenshot.png'"}) });`;

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
        return this.unsupportedAction(action);
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
        return `page.getByTestId(${JSON.stringify(loc.value)})`;
      case 'role':
        return loc.name
          ? `page.getByRole(${JSON.stringify(loc.role ?? 'button')}, { name: ${JSON.stringify(loc.name)} })`
          : `page.getByRole(${JSON.stringify(loc.role ?? 'button')})`;
      case 'label':
        return `page.getByLabel(${JSON.stringify(loc.value)})`;
      case 'accessibilityId':
        return `page.locator(${JSON.stringify(`[aria-label="${loc.value}"]`)})`;
      case 'resourceId':
        return `page.locator(${JSON.stringify(`[id="${loc.value}"]`)})`;
      case 'name':
        return `page.locator(${JSON.stringify(`[name="${loc.value}"]`)})`;
      case 'text':
        return `page.getByText(${JSON.stringify(loc.value)})`;
      case 'xpath':
        return `page.locator(${JSON.stringify(`xpath=${loc.value}`)})`;
      case 'css':
        return `page.locator(${JSON.stringify(loc.value)})`;
      case 'id':
        return `page.locator(${JSON.stringify(`#${loc.value}`)})`;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
