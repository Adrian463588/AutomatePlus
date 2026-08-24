import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class CypressJsGenerator extends BaseCodeGenerator {
  public readonly framework = 'cypress';
  public readonly language = 'javascript';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `describe(${JSON.stringify(session.name)}, () => {`,
      `  it('should execute recorded cypress test session', () => {`,
      session.targetConfig.startUrl && !this.hasExplicitNavigate(session)
        ? `    cy.visit(${this.getCypressValue(session.targetConfig.startUrl)});`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const locatorCode = loc ? this.formatCypressLocator(loc) : '';
    const value = this.getCypressValue(action.value);
    const expected = this.getCypressValue(this.getAssertionExpected(action));
    if (['assertText', 'assertValue', 'assertUrl'].includes(action.action)) this.requireAssertionOperator(action, ['equals']);

    switch (action.action) {
      case 'navigate':
        return `    cy.visit(${value});`;

      case 'click':
        return `    ${locatorCode}.click();`;

      case 'doubleClick':
        return `    ${locatorCode}.dblclick();`;

      case 'rightClick':
        return `    ${locatorCode}.rightclick();`;

      case 'hover':
        return `    ${locatorCode}.trigger('mouseover');`;

      case 'fill':
        return `    ${locatorCode}.clear().type(${value});`;

      case 'clear':
        return `    ${locatorCode}.clear();`;

      case 'pressKey':
        return `    ${(locatorCode || "cy.get('body')")}.type('{${this.getCypressKeyValue(action.value)}}');`;

      case 'dragAndDrop': {
        const targetLoc = this.requireDragTarget(action);
        const targetCode = this.formatCypressLocator(targetLoc);
        return `    ${locatorCode}.trigger('dragstart');\n    ${targetCode}.trigger('drop');`;
      }

      case 'scroll':
        return `    cy.scrollTo(0, ${action.scrollOffset?.deltaY ?? 100});`;

      case 'waitFor':
        return `    ${locatorCode}.should('be.visible');`;

      case 'sleep':
        return `    cy.wait(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot':
        return `    cy.screenshot(${action.value ? value : "'screenshot'"});`;

      case 'assertVisible':
        return `    ${locatorCode}.should('be.visible');`;

      case 'assertHidden':
        return `    ${locatorCode}.should('not.be.visible');`;

      case 'assertText':
        return `    ${locatorCode}.should('have.text', ${expected});`;

      case 'assertValue':
        return `    ${locatorCode}.should('have.value', ${expected});`;

      case 'assertUrl':
        return `    cy.url().should('eq', ${expected});`;

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

  private formatCypressLocator(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `cy.get(${JSON.stringify(`[data-testid="${loc.value}"]`)})`;
      case 'text':
        return `cy.contains(${JSON.stringify(loc.value)})`;
      case 'xpath':
        return this.unsupportedLocator(loc);
      case 'id':
        return `cy.get(${JSON.stringify(`#${loc.value}`)})`;
      case 'css':
        return `cy.get(${JSON.stringify(loc.value)})`;
      case 'role': {
        const selector = `[role="${loc.role ?? 'button'}"]`;
        return loc.name
          ? `cy.get(${JSON.stringify(selector)}).contains(${JSON.stringify(loc.name)})`
          : `cy.get(${JSON.stringify(selector)})`;
      }
      case 'label':
        return `cy.get(${JSON.stringify(`[aria-label="${loc.value}"]`)})`;
      case 'accessibilityId':
        return `cy.get(${JSON.stringify(`[aria-label="${loc.value}"]`)})`;
      case 'resourceId':
        return `cy.get(${JSON.stringify(`[id="${loc.value}"]`)})`;
      case 'name':
        return `cy.get(${JSON.stringify(`[name="${loc.value}"]`)})`;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
