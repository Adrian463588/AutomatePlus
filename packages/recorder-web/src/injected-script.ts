import { LocatorCandidate } from '@automate-plus/ir-schema';
import { rankLocators } from '@automate-plus/selector-engine';

export function extractElementLocators(element: {
  tagName: string;
  id?: string;
  name?: string;
  testId?: string;
  role?: string;
  ariaLabel?: string;
  labelText?: string;
  innerText?: string;
  className?: string;
  xpath?: string;
}): LocatorCandidate[] {
  const candidates: LocatorCandidate[] = [];

  // 1. data-testid
  if (element.testId) {
    candidates.push({ strategy: 'testId', value: element.testId, score: 100 });
  }

  // 2. ARIA role & accessible name
  if (element.role) {
    candidates.push({
      strategy: 'role',
      role: element.role,
      name: element.ariaLabel || element.innerText?.trim().slice(0, 30),
      value: element.role,
      score: 90,
    });
  }

  // 3. Label text
  if (element.labelText) {
    candidates.push({ strategy: 'label', value: element.labelText.trim(), score: 80 });
  }

  // 4. ID
  if (element.id) {
    candidates.push({ strategy: 'id', value: element.id, score: 75 });
  }

  // 5. Name
  if (element.name) {
    candidates.push({ strategy: 'name', value: element.name, score: 70 });
  }

  // 6. Visible inner text
  if (element.innerText && element.innerText.trim().length > 0 && element.innerText.trim().length < 40) {
    candidates.push({ strategy: 'text', value: element.innerText.trim(), score: 65 });
  }

  // 7. CSS Selector
  if (element.id) {
    candidates.push({ strategy: 'css', value: `#${element.id}`, score: 50 });
  } else if (element.className) {
    const firstClass = element.className.split(' ').filter(Boolean)[0];
    if (firstClass) {
      candidates.push({ strategy: 'css', value: `${element.tagName.toLowerCase()}.${firstClass}`, score: 45 });
    }
  }

  // 8. XPath Fallback
  if (element.xpath) {
    candidates.push({ strategy: 'xpath', value: element.xpath, score: 20 });
  }

  return rankLocators(candidates, 'web');
}

export const INJECTED_RECORDING_SCRIPT = `
(function() {
  if (window.__automatePlusInjected) return;
  window.__automatePlusInjected = true;

  function getXPath(element) {
    if (element.id !== '') return '//*[@id="' + element.id + '"]';
    if (element === document.body) return '/html/body';
    let ix = 0;
    const siblings = element.parentNode ? element.parentNode.childNodes : [];
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
      }
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
    }
    return '';
  }

  function reportAction(actionType, target, value) {
    const data = {
      actionType,
      value,
      element: {
        tagName: target.tagName,
        id: target.id,
        name: target.getAttribute('name'),
        testId: target.getAttribute('data-testid') || target.getAttribute('data-test') || target.getAttribute('data-qa'),
        role: target.getAttribute('role'),
        ariaLabel: target.getAttribute('aria-label'),
        innerText: target.innerText,
        className: target.className,
        xpath: getXPath(target)
      }
    };
    if (window.onAutomatePlusAction) {
      window.onAutomatePlusAction(JSON.stringify(data));
    }
  }

  document.addEventListener('click', function(e) {
    if (!e.target) return;
    reportAction('click', e.target);
  }, true);

  document.addEventListener('change', function(e) {
    if (!e.target) return;
    const val = e.target.value !== undefined ? String(e.target.value) : '';
    reportAction('fill', e.target, val);
  }, true);
})();
`;
