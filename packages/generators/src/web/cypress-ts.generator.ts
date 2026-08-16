import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class CypressTsGenerator extends BaseCodeGenerator {
  public readonly framework = 'cypress';
  public readonly language = 'typescript';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `describe('${session.name}', () => {`,
      `  it('should execute recorded cypress test session', () => {`,
      session.targetConfig.startUrl
        ? `    cy.visit('${session.targetConfig.startUrl}');`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const locatorCode = loc ? this.formatCypressLocator(loc) : '';
    const rawVal = this.getRawValue(action.value);
    const expected = this.getRawValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'navigate':
        return `    cy.visit('${rawVal}');`;

      case 'click':
        return `    ${locatorCode}.click();`;

      case 'doubleClick':
        return `    ${locatorCode}.dblclick();`;

      case 'rightClick':
        return `    ${locatorCode}.rightclick();`;

      case 'hover':
        return `    ${locatorCode}.trigger('mouseover');`;

      case 'fill':
        return `    ${locatorCode}.clear().type('${rawVal}');`;

      case 'clear':
        return `    ${locatorCode}.clear();`;

      case 'pressKey':
        return `    ${locatorCode}.type('{${rawVal.toLowerCase() || 'enter'}}');`;

      case 'dragAndDrop': {
        const targetLoc = action.dragTarget?.locators[0];
        const targetCode = targetLoc ? this.formatCypressLocator(targetLoc) : `cy.get('body')`;
        return `    ${locatorCode}.trigger('dragstart');\n    ${targetCode}.trigger('drop');`;
      }

      case 'scroll':
        return `    cy.scrollTo(0, ${action.scrollOffset?.deltaY ?? 100});`;

      case 'waitFor':
        return `    ${locatorCode}.should('be.visible');`;

      case 'sleep':
        return `    cy.wait(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot':
        return `    cy.screenshot('${rawVal || 'screenshot'}');`;

      case 'assertVisible':
        return `    ${locatorCode}.should('be.visible');`;

      case 'assertHidden':
        return `    ${locatorCode}.should('not.be.visible');`;

      case 'assertText':
        return `    ${locatorCode}.should('have.text', '${expected}');`;

      case 'assertValue':
        return `    ${locatorCode}.should('have.value', '${expected}');`;

      case 'assertUrl':
        return `    cy.url().should('include', '${expected}');`;

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

  private formatCypressLocator(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `cy.get('[data-testid="${loc.value}"]')`;
      case 'text':
        return `cy.contains('${loc.value}')`;
      case 'xpath':
        return `cy.xpath('${loc.value}')`;
      case 'id':
        return `cy.get('#${loc.value}')`;
      case 'css':
      default:
        return `cy.get('${loc.value}')`;
    }
  }
}
