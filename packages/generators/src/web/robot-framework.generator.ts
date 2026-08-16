import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class RobotFrameworkGenerator extends BaseCodeGenerator {
  public readonly framework = 'robot';
  public readonly language = 'robot';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const startUrl = session.targetConfig.startUrl || 'about:blank';
    return [
      `*** Settings ***`,
      `Documentation    Auto-generated test suite for ${session.name}`,
      `Library          SeleniumLibrary`,
      `Test Setup       Open Browser    ${startUrl}    chrome`,
      `Test Teardown    Close Browser`,
      ``,
      `*** Test Cases ***`,
      `${session.name || 'Execute Session'}`,
      `    [Documentation]    Execute recorded web steps`,
      `    Maximize Browser Window`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const locatorCode = loc ? this.formatRobotLocator(loc) : '';
    const rawVal = this.getRawValue(action.value);
    const expected = this.getRawValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'navigate':
        return `    Go To    ${rawVal}`;

      case 'click':
        return `    Click Element    ${locatorCode}`;

      case 'doubleClick':
        return `    Double Click Element    ${locatorCode}`;

      case 'rightClick':
        return `    Open Context Menu    ${locatorCode}`;

      case 'hover':
        return `    Mouse Over    ${locatorCode}`;

      case 'fill':
        return `    Input Text    ${locatorCode}    ${rawVal}`;

      case 'clear':
        return `    Clear Element Text    ${locatorCode}`;

      case 'pressKey':
        return `    Press Keys    ${locatorCode || 'None'}    ${rawVal.toUpperCase() || 'RETURN'}`;

      case 'dragAndDrop': {
        const targetLoc = action.dragTarget?.locators[0];
        const targetCode = targetLoc ? this.formatRobotLocator(targetLoc) : 'css=body';
        return `    Drag And Drop    ${locatorCode}    ${targetCode}`;
      }

      case 'scroll':
        return `    Execute Javascript    window.scrollBy(${action.scrollOffset?.deltaX ?? 0}, ${action.scrollOffset?.deltaY ?? 0});`;

      case 'sleep':
        return `    Sleep    ${(action.timeoutMs ?? 1000) / 1000}s`;

      case 'takeScreenshot':
        return `    Capture Page Screenshot    ${rawVal || 'screenshot.png'}`;

      case 'assertVisible':
        return `    Element Should Be Visible    ${locatorCode}`;

      case 'assertHidden':
        return `    Element Should Not Be Visible    ${locatorCode}`;

      case 'assertText':
        return `    Element Text Should Be    ${locatorCode}    ${expected}`;

      case 'assertValue':
        return `    Element Attribute Value Should Be    ${locatorCode}    value    ${expected}`;

      case 'assertUrl':
        return `    Location Should Contain    ${expected}`;

      default:
        return `    # Action: ${action.action}`;
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return '';
  }

  private formatRobotLocator(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `css=[data-testid="${loc.value}"]`;
      case 'xpath':
        return `xpath=${loc.value}`;
      case 'id':
        return `id=${loc.value}`;
      case 'name':
        return `name=${loc.value}`;
      case 'text':
        return `xpath=//*[text()='${loc.value}']`;
      case 'css':
      default:
        return `css=${loc.value}`;
    }
  }
}
