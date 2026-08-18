import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';
import { renderAppiumRuntimeContext } from './appium-runtime-context.js';

export class AppiumJavaGenerator extends BaseCodeGenerator {
  public readonly framework = 'appium';
  public readonly language = 'java';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, options?: GeneratorOptions): string {
    const className = this.toPascalCase(session.name) + 'Test';
    return [
      `package com.automateplus.tests;`,
      ``,
      `import io.appium.java_client.android.AndroidDriver;`,
      `import io.appium.java_client.android.options.UiAutomator2Options;`,
      `import io.appium.java_client.AppiumBy;`,
      `import org.openqa.selenium.By;`,
      `import org.openqa.selenium.WebElement;`,
      `import org.openqa.selenium.interactions.PointerInput;`,
      `import org.openqa.selenium.interactions.Sequence;`,
      `import org.openqa.selenium.support.ui.WebDriverWait;`,
      `import org.openqa.selenium.support.ui.ExpectedConditions;`,
      `import org.junit.jupiter.api.*;`,
      `import java.net.URL;`,
      `import java.time.Duration;`,
      `import java.util.Collections;`,
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
      session.targetConfig.appPackage
        ? `        options.setAppPackage("${session.targetConfig.appPackage}");`
        : '',
      session.targetConfig.appActivity
        ? `        options.setAppActivity("${session.targetConfig.appActivity}");`
        : '',
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
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const byClause = loc ? this.formatAppiumBy(loc) : '';
    const val = this.getJavaValue(action.value);
    const expected = this.getJavaValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'tap':
      case 'click':
        return `        wait.until(ExpectedConditions.elementToBeClickable(${byClause})).click();`;

      case 'doubleTap':
      case 'doubleClick':
        return `        WebElement el = wait.until(ExpectedConditions.elementToBeClickable(${byClause}));\n        el.click();\n        el.click();`;

      case 'longPress':
        return `        WebElement el = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        // perform long press gesture on element\n        driver.executeScript("mobile: longClickGesture", java.util.Map.of("elementId", ((org.openqa.selenium.remote.RemoteWebElement) el).getId(), "duration", 1000));`;

      case 'fill':
        return `        WebElement elem = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        elem.clear();\n        elem.sendKeys(${val});`;

      case 'clear':
        return `        wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).clear();`;

      case 'swipe': {
        const vector = action.swipeVector;
        if (!vector) return this.unsupportedAction(action);
        return `        driver.executeScript("mobile: swipeGesture", java.util.Map.of("startX", ${vector.startX}, "startY", ${vector.startY}, "endX", ${vector.endX}, "endY", ${vector.endY}, "duration", ${vector.durationMs}));`;
      }

      case 'drag':
      case 'dragAndDrop': {
        const targetBy = this.formatAppiumBy(this.requireDragTarget(action));
        return `        WebElement src = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}));\n        WebElement dst = wait.until(ExpectedConditions.visibilityOfElementLocated(${targetBy}));\n        driver.executeScript("mobile: dragGesture", java.util.Map.of("elementId", ((org.openqa.selenium.remote.RemoteWebElement) src).getId(), "endX", dst.getLocation().getX(), "endY", dst.getLocation().getY()));`;
      }

      case 'back':
        return `        driver.navigate().back();`;

      case 'home':
        return `        driver.executeScript("mobile: pressKey", java.util.Map.of("keycode", 3));`;

      case 'enter':
        return `        driver.executeScript("mobile: pressKey", java.util.Map.of("keycode", 66));`;

      case 'sleep':
        return `        try { Thread.sleep(${action.timeoutMs ?? 1000}); } catch (InterruptedException ignored) {}`;

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
        return `By.id("${loc.value}")`;
      case 'accessibilityId':
        return `AppiumBy.accessibilityId("${loc.value}")`;
      case 'text':
        return `By.xpath("//*[@text='${loc.value}']")`;
      case 'xpath':
        return `By.xpath("${loc.value}")`;
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
