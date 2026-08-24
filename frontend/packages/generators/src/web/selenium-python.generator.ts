import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class SeleniumPythonGenerator extends BaseCodeGenerator {
  public readonly framework = 'selenium';
  public readonly language = 'python';
  public readonly supportedPlatforms = ['web'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const fnName = session.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return [
      `import os`,
      `import time`,
      `import pytest`,
      `from selenium import webdriver`,
      `from selenium.webdriver.common.by import By`,
      `from selenium.webdriver.chrome.options import Options`,
      `from selenium.webdriver.chrome.service import Service`,
      `from selenium.webdriver.support.ui import WebDriverWait`,
      `from selenium.webdriver.support import expected_conditions as EC`,
      `from selenium.webdriver.common.action_chains import ActionChains`,
      `from selenium.webdriver.common.keys import Keys`,
      ``,
      `@pytest.fixture`,
      `def driver():`,
      `    browser_executable = os.environ.get("AUTOMATEPLUS_BROWSER_EXECUTABLE")`,
      `    driver_executable = os.environ.get("AUTOMATEPLUS_DRIVER_EXECUTABLE")`,
      `    if not browser_executable or not driver_executable:`,
      `        raise RuntimeError("AutomatePlus requires AUTOMATEPLUS_BROWSER_EXECUTABLE and AUTOMATEPLUS_DRIVER_EXECUTABLE for offline Selenium execution.")`,
      `    options = Options()`,
      `    options.binary_location = browser_executable`,
      `    driver = webdriver.Chrome(service=Service(driver_executable), options=options)`,
      `    driver.maximize_window()`,
      `    os.makedirs("screenshots", exist_ok=True)`,
      `    yield driver`,
      `    driver.quit()`,
      ``,
      `def test_${fnName}(driver):`,
      `    wait = WebDriverWait(driver, 10)`,
      `    actions = ActionChains(driver)`,
      session.targetConfig.startUrl && !this.hasExplicitNavigate(session)
        ? `    driver.get(${JSON.stringify(session.targetConfig.startUrl)})`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const byClause = loc ? this.formatSeleniumBy(loc) : '';
    const val = this.getPythonValue(action.value);
    const expected = this.getPythonValue(this.getAssertionExpected(action));
    if (['assertText', 'assertValue', 'assertUrl'].includes(action.action)) this.requireAssertionOperator(action, ['equals']);

    switch (action.action) {
      case 'navigate':
        return `    driver.get(${val})`;

      case 'click':
        return `    wait.until(EC.element_to_be_clickable((${byClause}))).click()`;

      case 'doubleClick':
        return `    elem = wait.until(EC.visibility_of_element_located((${byClause})))\n    actions.double_click(elem).perform()`;

      case 'rightClick':
        return `    elem = wait.until(EC.visibility_of_element_located((${byClause})))\n    actions.context_click(elem).perform()`;

      case 'hover':
        return `    elem = wait.until(EC.visibility_of_element_located((${byClause})))\n    actions.move_to_element(elem).perform()`;

      case 'fill':
        return `    elem = wait.until(EC.visibility_of_element_located((${byClause})))\n    elem.clear()\n    elem.send_keys(${val})`;

      case 'clear':
        return `    wait.until(EC.visibility_of_element_located((${byClause}))).clear()`;

      case 'pressKey':
        {
          const key = this.getSeleniumKeyValue(action.value);
          const keyCode = key.length === 1 ? JSON.stringify(key) : `Keys.${key}`;
          return `    actions.send_keys(${keyCode}).perform()`;
        }

      case 'dragAndDrop': {
        const targetLoc = this.requireDragTarget(action);
        const targetBy = this.formatSeleniumBy(targetLoc);
        return `    source_el = wait.until(EC.visibility_of_element_located((${byClause})))\n    target_el = wait.until(EC.visibility_of_element_located((${targetBy})))\n    actions.drag_and_drop(source_el, target_el).perform()`;
      }

      case 'scroll':
        return `    driver.execute_script("window.scrollBy(${action.scrollOffset?.deltaX ?? 0}, ${action.scrollOffset?.deltaY ?? 0});")`;

      case 'sleep':
        return `    time.sleep(${(action.timeoutMs ?? 1000) / 1000})`;

      case 'takeScreenshot':
        return `    driver.save_screenshot(os.path.join("screenshots", os.path.basename(${action.value ? val : '"screenshot.png"'})))`;

      case 'assertVisible':
        return `    assert wait.until(EC.visibility_of_element_located((${byClause}))).is_displayed()`;

      case 'assertHidden':
        return `    assert wait.until(EC.invisibility_of_element_located((${byClause})))`;

      case 'assertText':
        return `    elem = wait.until(EC.visibility_of_element_located((${byClause})))\n    assert elem.text == ${expected}`;

      case 'assertValue':
        return `    elem = wait.until(EC.visibility_of_element_located((${byClause})))\n    assert elem.get_attribute("value") == ${expected}`;

      case 'assertUrl':
        return `    assert driver.current_url == ${expected}`;

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return '';
  }

  private formatSeleniumBy(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'testId':
        return `By.CSS_SELECTOR, ${JSON.stringify(`[data-testid="${loc.value}"]`)}`;
      case 'xpath':
        return `By.XPATH, ${JSON.stringify(loc.value)}`;
      case 'id':
        return `By.ID, ${JSON.stringify(loc.value)}`;
      case 'name':
        return `By.NAME, ${JSON.stringify(loc.value)}`;
      case 'text':
        return `By.XPATH, ${JSON.stringify(`//*[normalize-space(.)=${JSON.stringify(loc.value)}]`)}`;
      case 'css':
        return `By.CSS_SELECTOR, ${JSON.stringify(loc.value)}`;
      case 'role':
        return `By.CSS_SELECTOR, ${JSON.stringify(`[role="${loc.role ?? 'button'}"]`)}`;
      case 'label':
        return `By.CSS_SELECTOR, ${JSON.stringify(`[aria-label="${loc.value}"]`)}`;
      case 'accessibilityId':
        return `By.CSS_SELECTOR, ${JSON.stringify(`[aria-label="${loc.value}"]`)}`;
      case 'resourceId':
        return `By.CSS_SELECTOR, ${JSON.stringify(`[id="${loc.value}"]`)}`;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
