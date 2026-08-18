import { LocatorCandidate } from '@automate-plus/ir-schema';
import { rankLocators } from '@automate-plus/selector-engine';

export interface BrowserElementSnapshot {
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
}

export function extractElementLocators(element: BrowserElementSnapshot): LocatorCandidate[] {
  const candidates: LocatorCandidate[] = [];

  if (element.testId) {
    candidates.push({ strategy: 'testId', value: element.testId, score: 100 });
  }

  if (element.role) {
    candidates.push({
      strategy: 'role',
      role: element.role,
      name: element.ariaLabel || element.innerText?.trim().slice(0, 30),
      value: element.role,
      score: 90,
    });
  }

  if (element.labelText) {
    candidates.push({ strategy: 'label', value: element.labelText.trim(), score: 80 });
  }

  if (element.id) {
    candidates.push({ strategy: 'id', value: element.id, score: 75 });
  }

  if (element.name) {
    candidates.push({ strategy: 'name', value: element.name, score: 70 });
  }

  if (element.innerText && element.innerText.trim().length > 0 && element.innerText.trim().length < 40) {
    candidates.push({ strategy: 'text', value: element.innerText.trim(), score: 65 });
  }

  if (element.id) {
    candidates.push({ strategy: 'css', value: `#${element.id}`, score: 50 });
  } else if (element.className) {
    const firstClass = element.className.split(' ').filter(Boolean)[0];
    if (firstClass) {
      candidates.push({ strategy: 'css', value: `${element.tagName.toLowerCase()}.${firstClass}`, score: 45 });
    }
  }

  if (element.xpath) {
    candidates.push({ strategy: 'xpath', value: element.xpath, score: 20 });
  }

  return rankLocators(candidates, 'web');
}

export const ELEMENT_SNAPSHOT_SCRIPT = `
(element => {
  if (!element) return undefined;
  const labels = element.labels ? Array.from(element.labels).map(label => label.innerText).filter(Boolean) : [];
  return {
    tagName: element.tagName,
    id: element.id || undefined,
    name: element.getAttribute('name') || undefined,
    testId: element.getAttribute('data-testid') || element.getAttribute('data-test') || element.getAttribute('data-qa') || undefined,
    role: element.getAttribute('role') || undefined,
    ariaLabel: element.getAttribute('aria-label') || undefined,
    labelText: labels.join(' ').trim() || undefined,
    innerText: typeof element.innerText === 'string' ? element.innerText : undefined,
    className: typeof element.className === 'string' ? element.className : undefined,
    xpath: (() => {
      if (element.id) return '//*[@id="' + element.id + '"]';
      if (element === document.body) return '/html/body';
      let index = 0;
      let sibling = element;
      while (sibling && sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        if (sibling.tagName === element.tagName) index += 1;
      }
      return element.parentElement
        ? element.parentElement.tagName.toLowerCase() + '/' + element.tagName.toLowerCase() + '[' + (index + 1) + ']'
        : undefined;
    })()
  };
})
`;

export const INJECTED_RECORDING_SCRIPT = `
(function() {
  if (window.__automatePlusInjected) return;
  window.__automatePlusInjected = true;

  const lastValues = new WeakMap();
  let pendingClick;
  let dragSource;

  function getXPath(element) {
    if (!element) return undefined;
    if (element.id) return '//*[@id="' + element.id + '"]';
    if (element === document.body) return '/html/body';
    let index = 0;
    let sibling = element;
    while (sibling && sibling.previousElementSibling) {
      sibling = sibling.previousElementSibling;
      if (sibling.tagName === element.tagName) index += 1;
    }
    return element.parentElement
      ? element.parentElement.tagName.toLowerCase() + '/' + element.tagName.toLowerCase() + '[' + (index + 1) + ']'
      : undefined;
  }

  function snapshot(element) {
    if (!element || !element.tagName) return undefined;
    const labels = element.labels ? Array.from(element.labels).map(label => label.innerText).filter(Boolean) : [];
    return {
      tagName: element.tagName,
      id: element.id || undefined,
      name: element.getAttribute('name') || undefined,
      testId: element.getAttribute('data-testid') || element.getAttribute('data-test') || element.getAttribute('data-qa') || undefined,
      role: element.getAttribute('role') || undefined,
      ariaLabel: element.getAttribute('aria-label') || undefined,
      labelText: labels.join(' ').trim() || undefined,
      innerText: typeof element.innerText === 'string' ? element.innerText : undefined,
      className: typeof element.className === 'string' ? element.className : undefined,
      xpath: getXPath(element)
    };
  }

  function reportAction(actionType, element, value, extra) {
    const data = Object.assign({
      actionType,
      value,
      element: snapshot(element),
      timestamp: Date.now()
    }, extra || {});
    const report = window.__automatePlusReportAction || window.onAutomatePlusAction;
    if (typeof report === 'function') {
      report(JSON.stringify(data));
    }
  }

  function isTextField(element) {
    if (!element) return false;
    if (element.tagName === 'TEXTAREA') return true;
    if (element.tagName !== 'INPUT') return false;
    return !['checkbox', 'radio', 'file', 'button', 'submit', 'reset'].includes((element.type || '').toLowerCase());
  }

  document.addEventListener('click', function(event) {
    const target = event.target;
    if (!target) return;
    clearTimeout(pendingClick);
    if (event.detail > 1) return;
    pendingClick = setTimeout(function() {
      reportAction('click', target);
    }, 250);
  }, true);

  document.addEventListener('dblclick', function(event) {
    const target = event.target;
    if (!target) return;
    clearTimeout(pendingClick);
    reportAction('doubleClick', target);
  }, true);

  document.addEventListener('contextmenu', function(event) {
    if (event.target) reportAction('rightClick', event.target);
  }, true);

  document.addEventListener('mouseover', function(event) {
    const target = event.target;
    if (!target || (event.relatedTarget && target.contains && target.contains(event.relatedTarget))) return;
    reportAction('hover', target);
  }, true);

  document.addEventListener('input', function(event) {
    const target = event.target;
    if (!target) return;
    const value = target.value !== undefined ? String(target.value) : '';
    const previous = lastValues.get(target);
    lastValues.set(target, value);
    if (isTextField(target)) {
      reportAction(value === '' && previous ? 'clear' : 'fill', target, value);
    }
  }, true);

  document.addEventListener('change', function(event) {
    const target = event.target;
    if (!target) return;
    const tagName = target.tagName;
    const type = (target.type || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      reportAction('check', target, target.checked ? 'checked' : 'unchecked');
      return;
    }
    if (type === 'file') {
      const files = target.files ? Array.from(target.files).map(file => file.name) : [];
      reportAction('fileChooser', target, files.join('\\n'), { filePaths: files });
      return;
    }
    if (tagName === 'SELECT') {
      const selected = Array.from(target.selectedOptions || []).map(option => option.value || option.text).join(',');
      reportAction('select', target, selected);
    }
  }, true);

  document.addEventListener('keydown', function(event) {
    if (event.target) reportAction('keyboard', event.target, event.key);
  }, true);

  document.addEventListener('wheel', function(event) {
    reportAction('scroll', event.target, undefined, {
      deltaX: event.deltaX,
      deltaY: event.deltaY
    });
  }, { capture: true, passive: true });

  document.addEventListener('dragstart', function(event) {
    dragSource = event.target;
  }, true);

  document.addEventListener('drop', function(event) {
    if (!dragSource || !event.target) return;
    reportAction('dragAndDrop', dragSource, undefined, {
      dragTarget: {
        element: snapshot(event.target),
        coordinates: { x: event.clientX, y: event.clientY }
      }
    });
    dragSource = undefined;
  }, true);

  window.__automatePlusRecordAssertion = function(assertion) {
    const data = assertion || {};
    reportAction('assertion', data.element, data.expected || data.expectedValue, {
      assertion: {
        type: data.type || data.kind || 'text',
        expected: data.expected || data.expectedValue,
        attributeName: data.attributeName
      }
    });
  };
})();
`;
