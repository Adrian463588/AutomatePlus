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
      `import org.openqa.selenium.chrome.ChromeDriverService;`,
      `import org.openqa.selenium.chrome.ChromeOptions;`,
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
      `        String browserExecutable = System.getenv("AUTOMATEPLUS_BROWSER_EXECUTABLE");`,
      `        String driverExecutable = System.getenv("AUTOMATEPLUS_DRIVER_EXECUTABLE");`,
      `        if (browserExecutable == null || driverExecutable == null) throw new IllegalStateException("AutomatePlus requires AUTOMATEPLUS_BROWSER_EXECUTABLE and AUTOMATEPLUS_DRIVER_EXECUTABLE for offline Selenium execution.");`,
      `        ChromeOptions options = new ChromeOptions().setBinary(browserExecutable);`,
      `        ChromeDriverService service = new ChromeDriverService.Builder().usingDriverExecutable(new java.io.File(driverExecutable)).build();`,
      `        driver = new ChromeDriver(service, options);`,
      `        driver.manage().window().maximize();`,
      `        wait = new WebDriverWait(driver, Duration.ofSeconds(10));`,
      `        actions = new Actions(driver);`,
      session.targetConfig.startUrl && !this.hasExplicitNavigate(session)
        ? `        driver.get(${this.getJavaValue(session.targetConfig.startUrl)});`
        : '',
      `    }`,
      ``,
      `    @AfterEach`,
      `    public void tearDown() {`,
      `        if (driver != null) driver.quit();`,
      `    }`,
      ``,
      `    @Test`,
      `    public void testSession() throws java.io.IOException {`,
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const byClause = loc ? this.formatSeleniumBy(loc) : '';
    const val = this.getJavaValue(action.value);
    const expected = this.getJavaValue(this.getAssertionExpected(action));
    if (['assertText', 'assertValue', 'assertUrl'].includes(action.action)) this.requireAssertionOperator(action, ['equals']);
    const stepSuffix = action.stepNumber;

    switch (action.action) {
      case 'navigate':
        return `        driver.get(${val});`;

      case 'click':
        return `        wait.until(ExpectedConditions.elementToBeClickable(${byClause})).click();`;

      case 'doubleClick':
        return `        WebElement element${stepSuffix} = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        actions.doubleClick(element${stepSuffix}).perform();`;

      case 'rightClick':
        return `        WebElement element${stepSuffix} = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        actions.contextClick(element${stepSuffix}).perform();`;

      case 'hover':
        return `        WebElement element${stepSuffix} = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        actions.moveToElement(element${stepSuffix}).perform();`;

      case 'fill':
        return `        WebElement element${stepSuffix} = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        element${stepSuffix}.clear();\n        element${stepSuffix}.sendKeys(${val});`;

      case 'clear':
        return `        wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).clear();`;

      case 'pressKey':
        {
          const key = this.getSeleniumKeyValue(action.value);
          const keyCode = key.length === 1 ? JSON.stringify(key) : `Keys.${key}`;
          return `        actions.sendKeys(${keyCode}).perform();`;
        }

      case 'dragAndDrop': {
        const targetLoc = this.requireDragTarget(action);
        const targetBy = this.formatSeleniumBy(targetLoc);
        return `        WebElement sourceElement${stepSuffix} = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        WebElement targetElement${stepSuffix} = wait.until(ExpectedConditions.visibilityOfElementLocated(${targetBy}));\n        actions.dragAndDrop(sourceElement${stepSuffix}, targetElement${stepSuffix}).perform();`;
      }

      case 'scroll':
        return `        ((JavascriptExecutor) driver).executeScript("window.scrollBy(" + ${action.scrollOffset?.deltaX ?? 0} + "," + ${action.scrollOffset?.deltaY ?? 0} + ");");`;

      case 'sleep':
        return `        try { Thread.sleep(${action.timeoutMs ?? 1000}); } catch (InterruptedException ignored) {}`;

      case 'takeScreenshot': {
        const screenshotPath = action.value ? val : '"screenshot.png"';
        return `        java.nio.file.Files.createDirectories(java.nio.file.Path.of("screenshots"));\n        java.nio.file.Files.write(java.nio.file.Path.of("screenshots", java.nio.file.Path.of(${screenshotPath}).getFileName()), ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES));`;
      }

      case 'assertVisible':
        return `        assertTrue(wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).isDisplayed());`;

      case 'assertHidden':
        return `        assertTrue(wait.until(ExpectedConditions.invisibilityOfElementLocated(${byClause})));`;

      case 'assertText':
        return `        assertEquals(${expected}, wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).getText());`;

      case 'assertValue':
        return `        assertEquals(${expected}, wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).getAttribute("value"));`;

      case 'assertUrl':
        return `        assertEquals(${expected}, driver.getCurrentUrl());`;

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
        return `By.cssSelector(${JSON.stringify(`[data-testid="${loc.value}"]`)})`;
      case 'xpath':
        return `By.xpath(${JSON.stringify(loc.value)})`;
      case 'id':
        return `By.id(${JSON.stringify(loc.value)})`;
      case 'name':
        return `By.name(${JSON.stringify(loc.value)})`;
      case 'text':
        return `By.xpath(${JSON.stringify(`//*[normalize-space(.)=${JSON.stringify(loc.value)}]`)})`;
      case 'css':
        return `By.cssSelector(${JSON.stringify(loc.value)})`;
      case 'role':
        return `By.cssSelector(${JSON.stringify(`[role="${loc.role ?? 'button'}"]`)})`;
      case 'label':
        return `By.cssSelector(${JSON.stringify(`[aria-label="${loc.value}"]`)})`;
      case 'accessibilityId':
        return `By.cssSelector(${JSON.stringify(`[aria-label="${loc.value}"]`)})`;
      case 'resourceId':
        return `By.cssSelector(${JSON.stringify(`[id="${loc.value}"]`)})`;
      default:
        return this.unsupportedLocator(loc);
    }
  }

  private toPascalCase(str: string): string {
    const pascal = str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^[a-z]/, (c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '');
    return /^[A-Za-z]/u.test(pascal) ? pascal : `Generated${pascal || 'Session'}`;
  }
}
