import { ActionIR, LocatorCandidate, SessionIR } from '@automate-plus/ir-schema';
import { GeneratorOptions } from '@automate-plus/contracts';
import { BaseCodeGenerator } from '../base.generator.js';

export class EspressoJavaGenerator extends BaseCodeGenerator {
  public readonly framework = 'espresso';
  public readonly language = 'java';
  public readonly supportedPlatforms = ['android'] as const;

  public generateHeader(session: SessionIR, _options?: GeneratorOptions): string {
    const className = `${this.generatedClassName(session.name)}Test`;
    const activityName = this.requireJavaActivityClass(session);
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

  public generateStep(action: ActionIR, session: SessionIR, _options?: GeneratorOptions): string {
    const loc = this.getPrimaryLocator(action);
    const matcher = loc ? this.formatEspressoMatcher(loc, session) : '';
    const value = this.getJavaValue(action.value);
    const expected = this.getJavaValue(this.getAssertionExpected(action));

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
        return `        onView(${matcher}).perform(clearText(), typeText(${value}), closeSoftKeyboard());`;

      case 'clear':
        return `        onView(${matcher}).perform(clearText());`;

      case 'swipe': {
        const vector = action.swipeVector;
        if (!vector) return this.unsupportedAction(action);
        return `        onView(withId(android.R.id.content)).perform(${this.espressoSwipeAction(vector)});`;
      }

      case 'back':
        return `        pressBack();`;

      case 'enter':
        if (!matcher) return this.unsupportedAction(action);
        return `        onView(${matcher}).perform(pressImeActionButton());`;

      case 'sleep':
        return `        try { Thread.sleep(${action.timeoutMs ?? 1000}); } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new RuntimeException(error); }`;

      case 'assertVisible':
        return `        onView(${matcher}).check(matches(isDisplayed()));`;

      case 'assertText':
        return `        onView(${matcher}).check(matches(withText(${expected})));`;

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

  private espressoSwipeAction(vector: NonNullable<ActionIR['swipeVector']>): string {
    const deltaX = vector.endX - vector.startX;
    const deltaY = vector.endY - vector.startY;
    if (Math.abs(deltaX) >= Math.abs(deltaY)) return deltaX >= 0 ? 'swipeRight()' : 'swipeLeft()';
    return deltaY >= 0 ? 'swipeDown()' : 'swipeUp()';
  }
}
