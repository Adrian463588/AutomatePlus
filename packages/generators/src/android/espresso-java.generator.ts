import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class EspressoJavaGenerator extends BaseCodeGenerator {
  public readonly framework = 'espresso';
  public readonly language = 'java';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const className = this.toPascalCase(session.name) + 'Test';
    const activityName = session.targetConfig.appActivity ?? 'MainActivity';
    return [
      `package com.automateplus.tests;`,
      ``,
      `import androidx.test.ext.junit.rules.ActivityScenarioRule;`,
      `import androidx.test.ext.junit.runners.AndroidJUnit4;`,
      `import org.junit.Rule;`,
      `import org.junit.Test;`,
      `import org.junit.runner.RunWith;`,
      `import static androidx.test.espresso.Espresso.*;`,
      `import static androidx.test.espresso.action.ViewActions.*;`,
      `import static androidx.test.espresso.assertion.ViewAssertions.matches;`,
      `import static androidx.test.espresso.matcher.ViewMatchers.*;`,
      ``,
      `@RunWith(AndroidJUnit4.class)`,
      `public class ${className} {`,
      ``,
      `    @Rule`,
      `    public ActivityScenarioRule<${activityName}> activityRule = new ActivityScenarioRule<>(${activityName}.class);`,
      ``,
      `    @Test`,
      `    public void testRecordedSession() {`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, _session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const matcher = loc ? this.formatEspressoMatcher(loc) : 'isRoot()';
    const val = this.getJavaValue(action.value);
    const expected = this.getJavaValue(action.expectedValue ?? action.value);

    switch (action.action) {
      case 'tap':
      case 'click':
        return `        onView(${matcher}).perform(click());`;

      case 'doubleTap':
      case 'doubleClick':
        return `        onView(${matcher}).perform(doubleClick());`;

      case 'longPress':
        return `        onView(${matcher}).perform(longClick());`;

      case 'fill':
        return `        onView(${matcher}).perform(clearText(), typeText(${val}), closeSoftKeyboard());`;

      case 'clear':
        return `        onView(${matcher}).perform(clearText());`;

      case 'swipe':
        return `        onView(${matcher}).perform(swipeUp());`;

      case 'back':
        return `        pressBack();`;

      case 'enter':
        return `        onView(${matcher}).perform(pressImeActionButton());`;

      case 'sleep':
        return `        try { Thread.sleep(${action.timeoutMs ?? 1000}); } catch (InterruptedException ignored) {}`;

      case 'assertVisible':
        return `        onView(${matcher}).check(matches(isDisplayed()));`;

      case 'assertText':
        return `        onView(${matcher}).check(matches(withText(${expected})));`;

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

  private formatEspressoMatcher(loc: LocatorCandidate): string {
    switch (loc.strategy) {
      case 'resourceId':
        return `withId(R.id.${loc.value.split('/').pop()})`;
      case 'accessibilityId':
        return `withContentDescription("${loc.value}")`;
      case 'text':
        return `withText("${loc.value}")`;
      default:
        return `withText("${loc.value}")`;
    }
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^[a-z]/, (c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '');
  }
}
