import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class PlaywrightPythonGenerator extends BaseCodeGenerator {
  public readonly framework = 'playwright';
  public readonly language = 'python';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const fnName = session.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return [
      `import os`,
      `import pytest`,
      `from playwright.sync_api import Page, expect`,
      ``,
      `def test_${fnName}(page: Page):`,
      session.targetConfig.startUrl
        ? `    page.goto("${session.targetConfig.startUrl}")`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const locatorCode = loc ? this.formatPythonLocator(loc) : '';
    const val = this.getPythonValue(action.value);
    const expected = this.getPythonValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'navigate':
        return `    page.goto(${val})`;

      case 'click':
        return `    ${locatorCode}.click()`;

      case 'doubleClick':
        return `    ${locatorCode}.dblclick()`;

      case 'rightClick':
        return `    ${locatorCode}.click(button="right")`;

      case 'hover':
        return `    ${locatorCode}.hover()`;

      case 'fill':
        return `    ${locatorCode}.fill(${val})`;

      case 'clear':
        return `    ${locatorCode}.clear()`;

      case 'pressKey':
        return `    page.keyboard.press(${val || '"Enter"'})`;

      case 'dragAndDrop': {
        const targetLoc = action.dragTarget?.locators[0];
        const targetCode = targetLoc ? this.formatPythonLocator(targetLoc) : `page.locator("body")`;
        return `    ${locatorCode}.drag_to(${targetCode})`;
      }

      case 'scroll':
        return `    page.mouse.wheel(${action.scrollOffset?.deltaX ?? 0}, ${action.scrollOffset?.deltaY ?? 0})`;

      case 'waitFor':
        return `    ${locatorCode}.wait_for(state="visible")`;

      case 'sleep':
        return `    page.wait_for_timeout(${action.timeoutMs ?? 1000})`;

      case 'takeScreenshot':
        return `    page.screenshot(path="screenshots/" + ${val || '"screenshot.png"'})`;

      case 'assertVisible':
        return `    expect(${locatorCode}).to_be_visible()`;

      case 'assertHidden':
        return `    expect(${locatorCode}).to_be_hidden()`;

      case 'assertText':
        return `    expect(${locatorCode}).to_have_text(${expected})`;

      case 'assertValue':
        return `    expect(${locatorCode}).to_have_value(${expected})`;

      case 'assertUrl':
        return `    expect(page).to_have_url(${expected})`;

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return '';
  }

  private formatPythonLocator(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `page.get_by_test_id("${loc.value}")`;
      case 'role':
        return loc.name
          ? `page.get_by_role("${loc.role ?? 'button'}", name="${loc.name}")`
          : `page.get_by_role("${loc.role ?? 'button'}")`;
      case 'label':
        return `page.get_by_label("${loc.value}")`;
      case 'text':
        return `page.get_by_text("${loc.value}")`;
      case 'xpath':
        return `page.locator("xpath=${loc.value}")`;
      case 'css':
      case 'id':
        return `page.locator("${loc.value}")`;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
