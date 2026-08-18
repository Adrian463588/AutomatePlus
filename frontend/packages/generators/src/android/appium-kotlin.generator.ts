import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';
import { renderAppiumRuntimeContext } from './appium-runtime-context.js';

export class AppiumKotlinGenerator extends BaseCodeGenerator {
  public readonly framework = 'appium';
  public readonly language = 'kotlin';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, options?: GeneratorOptions): string {
    const className = this.toPascalCase(session.name) + 'Test';
    return [
      `package com.automateplus.tests`,
      ``,
      `import io.appium.java_client.android.AndroidDriver`,
      `import io.appium.java_client.android.options.UiAutomator2Options`,
      `import io.appium.java_client.AppiumBy`,
      `import org.openqa.selenium.By`,
      `import org.openqa.selenium.WebElement`,
      `import org.openqa.selenium.support.ui.WebDriverWait`,
      `import org.openqa.selenium.support.ui.ExpectedConditions`,
      `import org.junit.jupiter.api.*`,
      `import org.junit.jupiter.api.Assertions.*`,
      `import java.net.URL`,
      `import java.time.Duration`,
      ``,
      `class ${className} {`,
      renderAppiumRuntimeContext(this.getRuntimeContext(options), 'kotlin'),
      ``,
      `    private lateinit var driver: AndroidDriver`,
      `    private lateinit var wait: WebDriverWait`,
      ``,
      `    @BeforeEach`,
      `    fun setUp() {`,
      `        val options = UiAutomator2Options().apply {`,
      `            setPlatformName("Android")`,
      `            setAutomationName("UiAutomator2")`,
      session.targetConfig.appPackage
        ? `            setAppPackage("${session.targetConfig.appPackage}")`
        : '',
      session.targetConfig.appActivity
        ? `            setAppActivity("${session.targetConfig.appActivity}")`
        : '',
      `            setUdid(AutomatePlusRuntime.udid())`,
      `            setSystemPort(AutomatePlusRuntime.systemPort())`,
      `            setMjpegServerPort(AutomatePlusRuntime.mjpegServerPort())`,
      `            AutomatePlusRuntime.chromedriverPort()?.let { setChromedriverPort(it) }`,
      `        }`,
      `        driver = AndroidDriver(AutomatePlusRuntime.appiumUrl(), options)`,
      `        wait = WebDriverWait(driver, Duration.ofSeconds(10))`,
      `    }`,
      ``,
      `    @Test`,
      `    fun testRecordedSession() {`,
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
        return `        wait.until(ExpectedConditions.elementToBeClickable(${byClause})).click()`;

      case 'doubleTap':
      case 'doubleClick':
        return `        val el = wait.until(ExpectedConditions.elementToBeClickable(${byClause}))\n        el.click()\n        el.click()`;

      case 'longPress':
        return `        val el = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}))\n        driver.executeScript("mobile: longClickGesture", mapOf("elementId" to (el as org.openqa.selenium.remote.RemoteWebElement).id, "duration" to 1000))`;

      case 'fill':
        return `        val elem = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}))\n        elem.clear()\n        elem.sendKeys(${val})`;

      case 'clear':
        return `        wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).clear()`;

      case 'swipe': {
        const vector = action.swipeVector;
        if (!vector) return this.unsupportedAction(action);
        return `        driver.executeScript("mobile: swipeGesture", mapOf("startX" to ${vector.startX}, "startY" to ${vector.startY}, "endX" to ${vector.endX}, "endY" to ${vector.endY}, "duration" to ${vector.durationMs}))`;
      }

      case 'drag':
      case 'dragAndDrop': {
        const targetBy = this.formatAppiumBy(this.requireDragTarget(action));
        return `        val src = wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause}))\n        val dst = wait.until(ExpectedConditions.visibilityOfElementLocated(${targetBy}))\n        driver.executeScript("mobile: dragGesture", mapOf("elementId" to (src as org.openqa.selenium.remote.RemoteWebElement).id, "endX" to dst.location.x, "endY" to dst.location.y))`;
      }

      case 'back':
        return `        driver.navigate().back()`;

      case 'home':
        return `        driver.executeScript("mobile: pressKey", mapOf("keycode" to 3))`;

      case 'enter':
        return `        driver.executeScript("mobile: pressKey", mapOf("keycode" to 66))`;

      case 'sleep':
        return `        Thread.sleep(${action.timeoutMs ?? 1000})`;

      case 'assertVisible':
        return `        assertTrue(wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).isDisplayed)`;

      case 'assertHidden':
        return `        assertTrue(wait.until(ExpectedConditions.invisibilityOfElementLocated(${byClause})))`;

      case 'assertText':
        return `        assertEquals(${expected}, wait.until(ExpectedConditions.visibilityOfElementLocated(${byClause})).text)`;

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `    }`,
      ``,
      `    @AfterEach`,
      `    fun tearDown() {`,
      `        driver.quit()`,
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
