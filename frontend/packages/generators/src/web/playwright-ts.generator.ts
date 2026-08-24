import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class PlaywrightTsGenerator extends BaseCodeGenerator {
  public readonly framework = 'playwright';
  public readonly language = 'typescript';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const healingImport = session.steps.some((step) => this.getGeneratedLocatorCandidates(step).length > 1)
      ? `import { withLocatorHealing } from './automateplus-healing.js';`
      : '';
    return [
      `import { test, expect } from '@playwright/test';`,
      `import { mkdir } from 'node:fs/promises';`,
      `import { basename } from 'node:path';`,
      healingImport,
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
    const val = this.getJsValue(action.value);
    const expected = this.getJsValue(this.getAssertionExpected(action));
    if (['assertText', 'assertValue', 'assertUrl'].includes(action.action)) this.requireAssertionOperator(action, ['equals']);

    switch (action.action) {
      case 'navigate':
        return `    await page.goto(${val});`;

      case 'click':
        return `    await ${this.formatLocatorAction(action, (locator) => `${locator}.click()`)};`;

      case 'doubleClick':
        return `    await ${this.formatLocatorAction(action, (locator) => `${locator}.dblclick()`)};`;

      case 'rightClick':
        return `    await ${this.formatLocatorAction(action, (locator) => `${locator}.click({ button: 'right' })`)};`;

      case 'hover':
        return `    await ${this.formatLocatorAction(action, (locator) => `${locator}.hover()`)};`;

      case 'fill':
        return `    await ${this.formatLocatorAction(action, (locator) => `${locator}.fill(${val})`)};`;

      case 'clear':
        return `    await ${this.formatLocatorAction(action, (locator) => `${locator}.clear()`)};`;

      case 'pressKey':
        return `    await page.keyboard.press(${JSON.stringify(this.getWebKeyValue(action.value))});`;

      case 'dragAndDrop': {
        const targetLoc = this.requireDragTarget(action);
        const targetCode = this.formatPlaywrightLocator(targetLoc);
        return `    await ${this.formatLocatorAction(action, (locator) => `${locator}.dragTo(${targetCode})`)};`;
      }

      case 'scroll':
        return `    await page.mouse.wheel(${action.scrollOffset?.deltaX ?? 0}, ${action.scrollOffset?.deltaY ?? 0});`;

      case 'waitFor':
        return `    await ${this.formatLocatorAction(action, (locator) => `${locator}.waitFor({ state: 'visible' })`)};`;

      case 'sleep':
        return `    await page.waitForTimeout(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot':
        return `    await page.screenshot({ path: 'screenshots/' + basename(${action.value ? val : "'screenshot.png'"}) });`;

      case 'assertVisible':
        return `    await ${this.formatLocatorAction(action, (locator) => `expect(${locator}).toBeVisible()`)};`;

      case 'assertHidden':
        return `    await ${this.formatLocatorAction(action, (locator) => `expect(${locator}).toBeHidden()`)};`;

      case 'assertText':
        return `    await ${this.formatLocatorAction(action, (locator) => `expect(${locator}).toHaveText(${expected})`)};`;

      case 'assertValue':
        return `    await ${this.formatLocatorAction(action, (locator) => `expect(${locator}).toHaveValue(${expected})`)};`;

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

  private formatLocatorAction(action: ActionIR, operation: (locator: string) => string): string {
    const candidates = this.getGeneratedLocatorCandidates(action);
    if (candidates.length <= 1) return operation(this.formatPlaywrightLocator(candidates[0] ?? this.requireLocator(action)));
    const factories = candidates.map((candidate) => `() => ${this.formatPlaywrightLocator(candidate)}`).join(', ');
    return `withLocatorHealing(${JSON.stringify(action.id)}, [${factories}], async (locator) => ${operation('locator')})`;
  }

  private formatPlaywrightLocator(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `page.getByTestId(${JSON.stringify(loc.value)})`;
      case 'role':
        return loc.name
          ? `page.getByRole(${JSON.stringify(loc.role ?? 'button')} as any, { name: ${JSON.stringify(loc.name)} })`
          : `page.getByRole(${JSON.stringify(loc.role ?? 'button')} as any)`;
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
