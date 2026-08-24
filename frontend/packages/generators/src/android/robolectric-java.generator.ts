import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class RobolectricJavaGenerator extends BaseCodeGenerator {
  public readonly framework = 'robolectric';
  public readonly language = 'java';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const className = `${this.generatedClassName(session.name)}Test`;
    const activityName = this.requireJavaActivityClass(session);
    return [
      `package com.automateplus.tests;`,
      ``,
      `import android.os.Build;`,
      `import androidx.test.core.app.ActivityScenario;`,
      `import org.junit.Test;`,
      `import org.junit.runner.RunWith;`,
      `import org.robolectric.RobolectricTestRunner;`,
      `import org.robolectric.annotation.Config;`,
      `import static androidx.test.espresso.Espresso.onView;`,
      `import static androidx.test.espresso.action.ViewActions.*;`,
      `import static androidx.test.espresso.assertion.ViewAssertions.matches;`,
      `import static androidx.test.espresso.matcher.ViewMatchers.*;`,
      ``,
      `@RunWith(RobolectricTestRunner.class)`,
      `@Config(sdk = {Build.VERSION_CODES.TIRAMISU})`,
      `public class ${className} {`,
      ``,
      `    @Test`,
      `    public void testRecordedSession() {`,
      `        try (ActivityScenario<${activityName}> scenario = ActivityScenario.launch(${activityName}.class)) {`,
    ].join('\n');
  }

  public generateStep(action: ActionIR, session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const matcher = loc ? this.formatEspressoMatcher(loc, session) : this.unsupportedAction(action);
    const value = this.getJavaValue(action.value);
    const expected = this.getJavaValue(this.getAssertionExpected(action));

    switch (action.action) {
      case 'tap':
      case 'click':
        return `            onView(${matcher}).perform(click());`;

      case 'doubleTap':
      case 'doubleClick':
        return `            onView(${matcher}).perform(doubleClick());`;

      case 'fill':
        return `            onView(${matcher}).perform(clearText(), typeText(${value}), closeSoftKeyboard());`;

      case 'clear':
        return `            onView(${matcher}).perform(clearText());`;

      case 'assertVisible':
        return `            onView(${matcher}).check(matches(isDisplayed()));`;

      case 'assertText':
        return `            onView(${matcher}).check(matches(withText(${expected})));`;

      default:
        return this.unsupportedAction(action);
    }
  }

  public generateFooter(_session: SessionIR, _options?: GeneratorOptions): string {
    return [
      `        }`,
      `    }`,
      `}`,
    ].join('\n');
  }

  private formatEspressoMatcher(loc: LocatorCandidate, session: SessionIR): string {
    switch (loc.strategy) {
      case 'resourceId':
        return `withId(${this.getAndroidResourceReference(session, loc)})`;
      case 'accessibilityId':
        return `withContentDescription(${this.getJavaValue(loc.value)})`;
      case 'text':
        return `withText(${this.getJavaValue(loc.value)})`;
      case 'role':
        return `withClassName(org.hamcrest.Matchers.is(${this.getJavaValue(loc.value)}))`;
      default:
        return this.unsupportedLocator(loc);
    }
  }
}
