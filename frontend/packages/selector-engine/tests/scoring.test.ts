import { describe, it, expect } from 'vitest';
import { rankLocators } from '../src/scoring.js';
import { findNextResilientLocator } from '../src/self-healer.js';
import { ActionIR, LocatorCandidate } from '@automate-plus/ir-schema';

describe('Selector Engine Scoring & Ranking', () => {
  it('should rank testId highest for web platform', () => {
    const candidates: LocatorCandidate[] = [
      { strategy: 'xpath', value: '/html/body/div[1]/form/div[2]/button', score: 0 },
      { strategy: 'css', value: '.btn-primary', score: 0 },
      { strategy: 'testId', value: 'submit-login-button', score: 0 },
      { strategy: 'role', role: 'button', name: 'Submit', value: 'Submit', score: 0 },
    ];

    const ranked = rankLocators(candidates, 'web');

    expect(ranked[0].strategy).toBe('testId');
    expect(ranked[1].strategy).toBe('role');
    expect(ranked[ranked.length - 1].strategy).toBe('xpath');
  });

  it('should penalize dynamic generated IDs with random hash digits', () => {
    const candidates: LocatorCandidate[] = [
      { strategy: 'id', value: 'btn-92847192837', score: 0 },
      { strategy: 'text', value: 'Submit Order', score: 0 },
    ];

    const ranked = rankLocators(candidates, 'web');
    // Dynamic id with >5 digits should receive penalty and be ranked lower than clean text
    expect(ranked[0].strategy).toBe('text');
  });

  it('should heal and select next best locator when primary locator fails', () => {
    const action: ActionIR = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      stepNumber: 1,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'stale-id', score: 100 },
        { strategy: 'role', role: 'button', name: 'Submit', value: 'Submit', score: 90 },
        { strategy: 'css', value: '#submit', score: 50 },
      ],
      timeoutMs: 5000,
      timestamp: Date.now(),
    };

    const healingResult = findNextResilientLocator(action, 'stale-id');

    expect(healingResult.healed).toBe(true);
    expect(healingResult.chosenCandidate?.strategy).toBe('role');
    expect(healingResult.chosenCandidate?.value).toBe('Submit');
    expect(healingResult.remainingCandidates.length).toBe(1);
  });
});
