import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class PlaywrightJavaGenerator extends BaseCodeGenerator {
  public readonly framework = 'playwright';
  public readonly language = 'java';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const className = this.toPascalCase(session.name) + 'Test';
    return [
      `package com.automateplus.tests;`,
      ``,
      `import com.microsoft.playwright.*;`,
      `import com.microsoft.playwright.options.*;`,
      `import org.junit.jupiter.api.*;`,
      `import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;`,
      ``,
      `public class ${className} {`,
      `    static Playwright playwright;`,
      `    static Browser browser;`,
      `    BrowserContext context;`,
      `    Page page;`,
      ``,
      `    @BeforeAll`,
      `    static void launchBrowser() {`,
      `        playwright = Playwright.create();`,
      `        browser = playwright.chromium().launch(new BrowserType.LaunchOptions().setHeadless(false));`,
      `    }`,
      ``,
      `    @AfterAll`,
      `    static void closeBrowser() {`,
      `        playwright.close();`,
      `    }`,
      ``,
      `    @BeforeEach`,
      `    void createContextAndPage() {`,
      `        context = browser.newContext();`,
      `        page = context.newPage();`,
      `    }`,
      ``,
      `    @AfterEach`,
      `    void closeContext() {`,
      `        context.close();`,
      `    }`,
      ``,
      `    @Test`,
      `    void testSession() throws java.io.IOException {`,
      `        java.nio.file.Files.createDirectories(java.nio.file.Path.of("screenshots"));`,
      session.targetConfig.startUrl && !this.hasExplicitNavigate(session)
        ? `        page.navigate(${this.getJavaValue(session.targetConfig.startUrl)});`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const locatorCode = loc ? this.formatJavaLocator(loc) : '';
    const val = this.getJavaValue(action.value);
    const expected = this.getJavaValue(this.getAssertionExpected(action));
    if (['assertText', 'assertValue', 'assertUrl'].includes(action.action)) this.requireAssertionOperator(action, ['equals']);

    switch (action.action) {
      case 'navigate':
        return `        page.navigate(${val});`;

      case 'click':
        return `        ${locatorCode}.click();`;

      case 'doubleClick':
        return `        ${locatorCode}.dblclick();`;

      case 'rightClick':
        return `        ${locatorCode}.click(new Locator.ClickOptions().setButton(MouseButton.RIGHT));`;

      case 'hover':
        return `        ${locatorCode}.hover();`;

      case 'fill':
        return `        ${locatorCode}.fill(${val});`;

      case 'clear':
        return `        ${locatorCode}.clear();`;

      case 'pressKey':
        return `        page.keyboard().press(${this.getJavaValue(this.getWebKeyValue(action.value))});`;

      case 'dragAndDrop': {
        const targetLoc = this.requireDragTarget(action);
        const targetCode = this.formatJavaLocator(targetLoc);
        return `        ${locatorCode}.dragTo(${targetCode});`;
      }

      case 'scroll':
        return `        page.mouse().wheel(${action.scrollOffset?.deltaX ?? 0}, ${action.scrollOffset?.deltaY ?? 0});`;

      case 'waitFor':
        return `        ${locatorCode}.waitFor();`;

      case 'sleep':
        return `        page.waitForTimeout(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot':
        return `        page.screenshot(new Page.ScreenshotOptions().setPath(java.nio.file.Path.of("screenshots", java.nio.file.Path.of(${action.value ? val : '"screenshot.png"'}).getFileName())));`;

      case 'assertVisible':
        return `        assertThat(${locatorCode}).isVisible();`;

      case 'assertHidden':
        return `        assertThat(${locatorCode}).isHidden();`;

      case 'assertText':
        return `        assertThat(${locatorCode}).hasText(${expected});`;

      case 'assertValue':
        return `        assertThat(${locatorCode}).hasValue(${expected});`;

      case 'assertUrl':
        return `        assertThat(page).hasURL(${expected});`;

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `    }`,
      `}`,
    ].join('\n');
  }

  private formatJavaLocator(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `page.getByTestId(${this.getJavaValue(loc.value)})`;
      case 'role':
        return loc.name
          ? `page.getByRole(${this.formatAriaRole(loc.role)}, new Page.GetByRoleOptions().setName(${this.getJavaValue(loc.name)}))`
          : `page.getByRole(${this.formatAriaRole(loc.role)})`;
      case 'label':
        return `page.getByLabel(${this.getJavaValue(loc.value)})`;
      case 'accessibilityId':
        return `page.locator(${this.getJavaValue(`[aria-label="${loc.value}"]`)})`;
      case 'resourceId':
        return `page.locator(${this.getJavaValue(`[id="${loc.value}"]`)})`;
      case 'name':
        return `page.locator(${this.getJavaValue(`[name="${loc.value}"]`)})`;
      case 'text':
        return `page.getByText(${this.getJavaValue(loc.value)})`;
      case 'xpath':
        return `page.locator(${this.getJavaValue(`xpath=${loc.value}`)})`;
      case 'css':
        return `page.locator(${this.getJavaValue(loc.value)})`;
      case 'id':
        return `page.locator(${this.getJavaValue(`#${loc.value}`)})`;
      default:
        return this.unsupportedLocator(loc);
    }
  }

  private formatAriaRole(role?: string): string {
    const normalized = (role ?? 'button').replace(/[^a-zA-Z0-9]/gu, '').toUpperCase();
    const aliases: Record<string, string> = {
      TEXTBOX: 'TEXTBOX',
      COMBOBOX: 'COMBOBOX',
      LISTBOX: 'LISTBOX',
      MENUITEM: 'MENUITEM',
      MENUITEMCHECKBOX: 'MENUITEMCHECKBOX',
      MENUITEMRADIO: 'MENUITEMRADIO',
      OPTION: 'OPTION',
      PROGRESSBAR: 'PROGRESSBAR',
      SCROLLBAR: 'SCROLLBAR',
      SEARCHBOX: 'SEARCHBOX',
      SPINBUTTON: 'SPINBUTTON',
      SWITCH: 'SWITCH',
      TAB: 'TAB',
      TABPANEL: 'TABPANEL',
      TREEITEM: 'TREEITEM',
      BUTTON: 'BUTTON',
      CHECKBOX: 'CHECKBOX',
      DIALOG: 'DIALOG',
      GRID: 'GRID',
      GRIDCELL: 'GRIDCELL',
      HEADING: 'HEADING',
      LINK: 'LINK',
      LIST: 'LIST',
      LOG: 'LOG',
      MARQUEE: 'MARQUEE',
      MATH: 'MATH',
      NOTE: 'NOTE',
      RADIO: 'RADIO',
      RADIOGROUP: 'RADIOGROUP',
      ROW: 'ROW',
      ROWGROUP: 'ROWGROUP',
      SEPARATOR: 'SEPARATOR',
      SLIDER: 'SLIDER',
      STATUS: 'STATUS',
      TABLE: 'TABLE',
      TREE: 'TREE',
      TOOLTIP: 'TOOLTIP',
    };
    const value = aliases[normalized];
    if (!value) {
      throw new Error(`Unsupported Playwright Java ARIA role '${role ?? ''}'.`);
    }
    return `AriaRole.${value}`;
  }

  private toPascalCase(str: string): string {
    const pascal = str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^[a-z]/, (c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '');
    return /^[A-Za-z]/u.test(pascal) ? pascal : `Generated${pascal || 'Session'}`;
  }
}
