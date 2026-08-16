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
      `    void testSession() {`,
      session.targetConfig.startUrl
        ? `        page.navigate("${session.targetConfig.startUrl}");`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const locatorCode = loc ? this.formatJavaLocator(loc) : '';
    const val = this.getJavaValue(action.value);
    const expected = this.getJavaValue(action.expectedValue ?? action.value);

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
        return `        page.keyboard().press(${val});`;

      case 'dragAndDrop': {
        const targetLoc = action.dragTarget?.locators[0];
        const targetCode = targetLoc ? this.formatJavaLocator(targetLoc) : `page.locator("body")`;
        return `        ${locatorCode}.dragTo(${targetCode});`;
      }

      case 'scroll':
        return `        page.mouse().wheel(${action.scrollOffset?.deltaX ?? 0}, ${action.scrollOffset?.deltaY ?? 0});`;

      case 'waitFor':
        return `        ${locatorCode}.waitFor();`;

      case 'sleep':
        return `        page.waitForTimeout(${action.timeoutMs ?? 1000});`;

      case 'takeScreenshot':
        return `        page.screenshot(new Page.ScreenshotOptions().setPath(java.nio.file.Paths.get("screenshots/" + ${val})));`;

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
        return `        // Action: ${action.action}`;
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
        return `page.getByTestId("${loc.value}")`;
      case 'role':
        return `page.getByRole(AriaRole.BUTTON)`;
      case 'label':
        return `page.getByLabel("${loc.value}")`;
      case 'text':
        return `page.getByText("${loc.value}")`;
      case 'xpath':
        return `page.locator("xpath=${loc.value}")`;
      case 'css':
      case 'id':
      default:
        return `page.locator("${loc.value}")`;
    }
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^[a-z]/, (c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '');
  }
}
