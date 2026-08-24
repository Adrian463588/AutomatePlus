import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';
import { renderAppiumRuntimeContext } from './appium-runtime-context.js';

export class AppiumJavaGenerator extends BaseCodeGenerator {
  public readonly framework = 'appium';
  public readonly language = 'java';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, options?: GeneratorOptions): string {
    const className = `${this.generatedClassName(session.name)}Test`;
    const appPackage = this.requireAndroidPackage(session);
    const appActivity = session.targetConfig.appActivity;
    return [
      `package com.automateplus.tests;`,
      ``,
      `import io.appium.java_client.android.AndroidDriver;`,
      `import io.appium.java_client.android.options.UiAutomator2Options;`,
      `import io.appium.java_client.AppiumBy;`,
      `import org.openqa.selenium.By;`,
      `import org.openqa.selenium.OutputType;`,
      `import org.openqa.selenium.WebElement;`,
      `import org.openqa.selenium.support.ui.WebDriverWait;`,
      `import org.openqa.selenium.support.ui.ExpectedConditions;`,
      `import org.junit.jupiter.api.*;`,
      `import java.net.URL;`,
      `import java.time.Duration;`,
      `import static org.junit.jupiter.api.Assertions.*;`,
      ``,
      `public class ${className} {`,
      renderAppiumRuntimeContext(this.getRuntimeContext(options), 'java'),
      ``,
      `    private AndroidDriver driver;`,
      `    private WebDriverWait wait;`,
      ``,
      `    @BeforeEach`,
      `    public void setUp() throws Exception {`,
      `        UiAutomator2Options options = new UiAutomator2Options();`,
      `        options.setPlatformName("Android");`,
      `        options.setAutomationName("UiAutomator2");`,
      `        options.setAppPackage(${this.getJavaValue(appPackage)});`,
      appActivity ? `        options.setAppActivity(${this.getJavaValue(appActivity)});` : '',
      `        options.setUdid(requiredDeviceUdid());`,
      `        options.setSystemPort(requiredSystemPort());`,
      `        options.setMjpegServerPort(requiredMjpegServerPort());`,
      `        Integer chromedriverPort = optionalChromedriverPort();`,
      `        if (chromedriverPort != null) options.setChromedriverPort(chromedriverPort);`,
      `        driver = new AndroidDriver(requiredAppiumUrl(), options);`,
      `        wait = new WebDriverWait(driver, Duration.ofSeconds(10));`,
      `    }`,
      ``,
      `    @Test`,
      `    public void testRecordedSession() {`,
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const byClause = loc ? this.formatAppiumBy(loc) : '';
    const value = this.getJavaValue(action.value);
    const expected = this.getJavaValue(this.getAssertionExpected(action));
    const step = action.stepNumber;

    switch (action.action) {
      case 'tap':
      case 'click':
        return `        wait.until(ExpectedConditions.elementToBeClickable(${byClause})).click();`;

      case 'doubleTap':
      case 'doubleClick': {
        const element = `element${step}`;
        return [
          `        WebElement ${element} = wait.until(ExpectedConditions.elementToBeClickable(${byClause}));`,
          `        ${element}.click();`,
          `        ${element}.click();`,
        ].join('\n');
      }

      case 'longPress': {
        const element = `element${step}`;
        return [
          `        WebElement ${element} = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));`,
          `        driver.executeScript("mobile: longClickGesture", java.util.Map.of("elementId", ((org.openqa.selenium.remote.RemoteWebElement) ${element}).getId(), "duration", 1000));`,
        ].join('\n');
      }

      case 'fill': {
        const element = `element${step}`;
        return [
          `        WebElement ${element} = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));`,
          `        ${element}.clear();`,
          `        ${element}.sendKeys(${value});`,
        ].join('\n');
      }

      case 'clear':
        return `        wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).clear();`;

      case 'swipe': {
        const vector = action.swipeVector;
        if (!vector) return this.unsupportedAction(action);
        return `        driver.executeScript("mobile: swipeGesture", java.util.Map.of("startX", ${vector.startX}, "startY", ${vector.startY}, "endX", ${vector.endX}, "endY", ${vector.endY}, "duration", ${vector.durationMs}));`;
      }

      case 'drag':
      case 'dragAndDrop': {
        const source = `source${step}`;
        const target = `target${step}`;
        const targetBy = this.formatAppiumBy(this.requireDragTarget(action));
        return [
          `        WebElement ${source} = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));`,
          `        WebElement ${target} = wait.until(ExpectedConditions.visibilityOfElementLocated(${targetBy}));`,
          `        driver.executeScript("mobile: dragGesture", java.util.Map.of("elementId", ((org.openqa.selenium.remote.RemoteWebElement) ${source}).getId(), "endX", ${target}.getLocation().getX(), "endY", ${target}.getLocation().getY()));`,
        ].join('\n');
      }

      case 'back':
        return `        driver.navigate().back();`;

      case 'home':
        return `        driver.executeScript("mobile: pressKey", java.util.Map.of("keycode", 3));`;

      case 'enter':
        return `        driver.executeScript("mobile: pressKey", java.util.Map.of("keycode", 66));`;

      case 'sleep':
        return `        try { Thread.sleep(${action.timeoutMs ?? 1000}); } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new RuntimeException(error); }`;

      case 'takeScreenshot': {
        const name = `screenshotName${step}`;
        return [
          `        String raw${name} = String.valueOf(${value});`,
          `        String ${name} = raw${name}.replaceAll("[^A-Za-z0-9_-]", "_");`,
          `        if (${name}.isBlank()) ${name} = "screenshot";`,
          `        try {`,
          `            java.nio.file.Files.createDirectories(java.nio.file.Path.of("screenshots"));`,
          `            java.nio.file.Files.copy(driver.getScreenshotAs(OutputType.FILE).toPath(), java.nio.file.Path.of("screenshots", ${name} + ".png"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);`,
          `        } catch (java.io.IOException error) { throw new RuntimeException("Failed to save Android screenshot", error); }`,
        ].join('\n');
      }

      case 'assertVisible':
        return `        assertTrue(wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).isDisplayed());`;

      case 'assertHidden':
        return `        assertTrue(wait.until(ExpectedConditions.invisibilityOfElementLocated(${byClause})));`;

      case 'assertText':
        return `        assertEquals(${expected}, wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).getText());`;

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `    }`,
      ``,
      `    @AfterEach`,
      `    public void tearDown() {`,
      `        if (driver != null) driver.quit();`,
      `    }`,
      `}`,
    ].join('\n');
  }

  private formatAppiumBy(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'resourceId':
        return `By.id(${this.getJavaValue(loc.value)})`;
      case 'accessibilityId':
        return `AppiumBy.accessibilityId(${this.getJavaValue(loc.value)})`;
      case 'text': {
        const xpath = `//*[@text=${this.getXPathLiteral(loc.value)}]`;
        return `By.xpath(${this.getJavaValue(xpath)})`;
      }
      case 'role': {
        const selector = `new UiSelector().className(${JSON.stringify(loc.value)})`;
        return `AppiumBy.androidUIAutomator(${this.getJavaValue(selector)})`;
      }
      case 'xpath':
        return `By.xpath(${this.getJavaValue(loc.value)})`;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
