import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class SeleniumJavaGenerator extends BaseCodeGenerator {
  public readonly framework = 'selenium';
  public readonly language = 'java';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const className = this.toPascalCase(session.name) + 'Test';
    return [
      `package com.automateplus.tests;`,
      ``,
      `import org.junit.jupiter.api.*;`,
      `import org.openqa.selenium.*;`,
      `import org.openqa.selenium.chrome.ChromeDriver;`,
      `import org.openqa.selenium.interactions.Actions;`,
      `import org.openqa.selenium.support.ui.ExpectedConditions;`,
      `import org.openqa.selenium.support.ui.WebDriverWait;`,
      `import java.time.Duration;`,
      `import static org.junit.jupiter.api.Assertions.*;`,
      ``,
      `public class ${className} {`,
      `    private WebDriver driver;`,
      `    private WebDriverWait wait;`,
      `    private Actions actions;`,
      ``,
      `    @BeforeEach`,
      `    public void setUp() {`,
      `        driver = new ChromeDriver();`,
      `        driver.manage().window().maximize();`,
      `        wait = new WebDriverWait(driver, Duration.ofSeconds(10));`,
      `        actions = new Actions(driver);`,
      session.targetConfig.startUrl
        ? `        driver.get("${session.targetConfig.startUrl}");`
        : '',
      `    }`,
      ``,
      `    @AfterEach`,
      `    public void tearDown() {`,
      `        if (driver != null) driver.quit();`,
      `    }`,
      ``,
      `    @Test`,
      `    public void testSession() {`,
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const byClause = loc ? this.formatSeleniumBy(loc) : '';
    const val = this.getJavaValue(action.value);
    const expected = this.getJavaValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'navigate':
        return `        driver.get(${val});`;

      case 'click':
        return `        wait.until(ExpectedConditions.elementToBeClickable(${byClause})).click();`;

      case 'doubleClick':
        return `        WebElement el = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        actions.doubleClick(el).perform();`;

      case 'rightClick':
        return `        WebElement el = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        actions.contextClick(el).perform();`;

      case 'hover':
        return `        WebElement el = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        actions.moveToElement(el).perform();`;

      case 'fill':
        return `        WebElement el = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        el.clear();\n        el.sendKeys(${val});`;

      case 'clear':
        return `        wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).clear();`;

      case 'pressKey':
        return `        actions.sendKeys(Keys.ENTER).perform();`;

      case 'dragAndDrop': {
        const targetLoc = action.dragTarget?.locators[0];
        const targetBy = targetLoc ? this.formatSeleniumBy(targetLoc) : `By.tagName("body")`;
        return `        WebElement src = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        WebElement dst = wait.until(ExpectedConditions.visibilityOfElementLocated(${targetBy}));\n        actions.dragAndDrop(src, dst).perform();`;
      }

      case 'scroll':
        return `        ((JavascriptExecutor) driver).executeScript("window.scrollBy(" + ${action.scrollOffset?.deltaX ?? 0} + "," + ${action.scrollOffset?.deltaY ?? 0} + ");");`;

      case 'sleep':
        return `        try { Thread.sleep(${action.timeoutMs ?? 1000}); } catch (InterruptedException ignored) {}`;

      case 'assertVisible':
        return `        assertTrue(wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).isDisplayed());`;

      case 'assertText':
        return `        assertEquals(${expected}, wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).getText());`;

      case 'assertValue':
        return `        assertEquals(${expected}, wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).getAttribute("value"));`;

      case 'assertUrl':
        return `        assertTrue(driver.getCurrentUrl().contains(${expected}));`;

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

  private formatSeleniumBy(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `By.cssSelector("[data-testid='${loc.value}']")`;
      case 'xpath':
        return `By.xpath("${loc.value}")`;
      case 'id':
        return `By.id("${loc.value}")`;
      case 'name':
        return `By.name("${loc.value}")`;
      case 'text':
        return `By.xpath("//*[text()='${loc.value}']")`;
      case 'css':
        return `By.cssSelector("${loc.value}")`;
      default:
        return this.unsupportedLocator(loc);
    }
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^[a-z]/, (c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '');
  }
}
