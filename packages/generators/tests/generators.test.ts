import { describe, it, expect } from 'vitest';
import { GeneratorFactory } from '../src/factory.js';
import { SessionIR } from '@automate-plus/ir-schema';

describe('Polyglot Code Generators', () => {
  const sampleWebSession: SessionIR = {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    projectId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    name: 'Login_Flow',
    platform: 'web',
    targetConfig: {
      startUrl: 'https://example.com/login',
    },
    environmentVariables: {},
    steps: [
      {
        id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
        stepNumber: 1,
        platform: 'web',
        action: 'fill',
        locators: [{ strategy: 'testId', value: 'email-input', score: 100 }],
        value: 'admin@automateplus.io',
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
      {
        id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        stepNumber: 2,
        platform: 'web',
        action: 'click',
        locators: [{ strategy: 'testId', value: 'login-button', score: 95 }],
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
      {
        id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
        stepNumber: 3,
        platform: 'web',
        action: 'assertVisible',
        locators: [{ strategy: 'testId', value: 'dashboard-title', score: 100 }],
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const sampleAndroidSession: SessionIR = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    projectId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    name: 'AndroidLogin',
    platform: 'android',
    targetConfig: {
      appPackage: 'com.automateplus.demo',
      appActivity: 'MainActivity',
    },
    environmentVariables: {},
    steps: [
      {
        id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
        stepNumber: 1,
        platform: 'android',
        action: 'fill',
        locators: [{ strategy: 'resourceId', value: 'com.automateplus.demo:id/input_email', score: 100 }],
        value: 'tester@example.com',
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
      {
        id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
        stepNumber: 2,
        platform: 'android',
        action: 'tap',
        locators: [{ strategy: 'resourceId', value: 'com.automateplus.demo:id/btn_login', score: 100 }],
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
      {
        id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        stepNumber: 3,
        platform: 'android',
        action: 'assertVisible',
        locators: [{ strategy: 'resourceId', value: 'com.automateplus.demo:id/dashboard', score: 95 }],
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const sampleApiSession: SessionIR = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    projectId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    name: 'ApiStressTest',
    platform: 'api',
    targetConfig: {},
    environmentVariables: {},
    steps: [
      {
        id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
        stepNumber: 1,
        platform: 'api',
        action: 'httpRequest',
        apiPayload: {
          method: 'POST',
          url: 'https://api.example.com/v1/auth/login',
          headers: { 'Content-Type': 'application/json' },
          queryParams: {},
          bodyType: 'json',
          bodyContent: '{"email":"load@test.com","pass":"secret"}',
          extractedVariables: [{ variableName: 'token', jsonPath: '.data.token' }],
        },
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
      {
        id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
        stepNumber: 2,
        platform: 'api',
        action: 'assertStatusCode',
        expectedValue: '200',
        timeoutMs: 5000,
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // --- Web Generators ---
  it('should generate valid Playwright TypeScript test project', async () => {
    const generator = GeneratorFactory.getGenerator('playwright', 'typescript');
    const project = await generator.generateFullProject(sampleWebSession);

    expect(project.framework).toBe('playwright');
    expect(project.language).toBe('typescript');
    const code = project.files[0].content;
    expect(code).toContain(`import { test, expect } from '@playwright/test';`);
    expect(code).toContain(`await page.goto('https://example.com/login');`);
    expect(code).toContain(`await page.getByTestId('email-input').fill("admin@automateplus.io");`);
  });

  it('should generate valid Playwright JavaScript test project', async () => {
    const generator = GeneratorFactory.getGenerator('playwright', 'javascript');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('playwright');
    expect(project.language).toBe('javascript');
    expect(project.files[0].content).toContain(`const { test, expect } = require('@playwright/test');`);
  });

  it('should generate valid Playwright Python test project', async () => {
    const generator = GeneratorFactory.getGenerator('playwright', 'python');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('playwright');
    expect(project.language).toBe('python');
    const code = project.files[0].content;
    expect(code).toContain(`from playwright.sync_api import Page, expect`);
    expect(code).toContain(`page.goto("https://example.com/login")`);
  });

  it('should generate valid Playwright Java test project', async () => {
    const generator = GeneratorFactory.getGenerator('playwright', 'java');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('playwright');
    expect(project.language).toBe('java');
    expect(project.files[0].content).toContain(`import com.microsoft.playwright.*;`);
  });

  it('should generate valid Cypress TypeScript test project', async () => {
    const generator = GeneratorFactory.getGenerator('cypress', 'typescript');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('cypress');
    expect(project.language).toBe('typescript');
    const code = project.files[0].content;
    expect(code).toContain(`describe('Login_Flow', () => {`);
    expect(code).toContain(`cy.visit('https://example.com/login');`);
    expect(code).toContain(`cy.get('[data-testid="email-input"]').clear().type('admin@automateplus.io');`);
  });

  it('should generate valid Cypress JavaScript test project', async () => {
    const generator = GeneratorFactory.getGenerator('cypress', 'javascript');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('cypress');
    expect(project.language).toBe('javascript');
    expect(project.files[0].content).toContain(`describe('Login_Flow', () => {`);
  });

  it('should generate valid Puppeteer TypeScript test project', async () => {
    const generator = GeneratorFactory.getGenerator('puppeteer', 'typescript');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('puppeteer');
    expect(project.files[0].content).toContain(`import puppeteer`);
  });

  it('should generate valid Puppeteer JavaScript test project', async () => {
    const generator = GeneratorFactory.getGenerator('puppeteer', 'javascript');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('puppeteer');
    expect(project.files[0].content).toContain(`const puppeteer = require('puppeteer');`);
  });

  it('should generate valid Selenium WebDriver Python test project', async () => {
    const generator = GeneratorFactory.getGenerator('selenium', 'python');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('selenium');
    expect(project.language).toBe('python');
    expect(project.files[0].content).toContain(`from selenium import webdriver`);
  });

  it('should generate valid Selenium WebDriver TypeScript test project', async () => {
    const generator = GeneratorFactory.getGenerator('selenium', 'typescript');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('selenium');
    expect(project.files[0].content).toContain(`import { Builder, By, until, WebDriver, Key } from 'selenium-webdriver';`);
  });

  it('should generate valid Selenium WebDriver Java test project', async () => {
    const generator = GeneratorFactory.getGenerator('selenium', 'java');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('selenium');
    expect(project.files[0].content).toContain(`import org.openqa.selenium.*;`);
  });

  it('should generate valid Robot Framework test suite', async () => {
    const generator = GeneratorFactory.getGenerator('robot', 'robot');
    const project = await generator.generateFullProject(sampleWebSession);
    expect(project.framework).toBe('robot');
    expect(project.files[0].content).toContain(`*** Settings ***`);
    expect(project.files[0].content).toContain(`Library          SeleniumLibrary`);
    expect(project.files[0].content).toContain(`*** Test Cases ***`);
  });

  // --- Android Generators ---
  it('should generate valid Appium Java test project', async () => {
    const generator = GeneratorFactory.getGenerator('appium', 'java');
    const project = await generator.generateFullProject(sampleAndroidSession);
    expect(project.framework).toBe('appium');
    expect(project.files[0].content).toContain(`import io.appium.java_client.android.AndroidDriver;`);
  });

  it('should generate valid Appium Kotlin test project', async () => {
    const generator = GeneratorFactory.getGenerator('appium', 'kotlin');
    const project = await generator.generateFullProject(sampleAndroidSession);
    expect(project.framework).toBe('appium');
    expect(project.language).toBe('kotlin');
    expect(project.files[0].content).toContain(`import io.appium.java_client.android.AndroidDriver`);
  });

  it('should generate valid Appium TypeScript (WDIO) test project', async () => {
    const generator = GeneratorFactory.getGenerator('appium', 'typescript');
    const project = await generator.generateFullProject(sampleAndroidSession);
    expect(project.framework).toBe('appium');
    expect(project.files[0].content).toContain(`import { remote } from 'webdriverio';`);
  });

  it('should generate valid Espresso Kotlin test project', async () => {
    const generator = GeneratorFactory.getGenerator('espresso', 'kotlin');
    const project = await generator.generateFullProject(sampleAndroidSession);
    expect(project.framework).toBe('espresso');
    expect(project.files[0].content).toContain(`import androidx.test.espresso.Espresso.*`);
  });

  it('should generate valid Espresso Java test project', async () => {
    const generator = GeneratorFactory.getGenerator('espresso', 'java');
    const project = await generator.generateFullProject(sampleAndroidSession);
    expect(project.framework).toBe('espresso');
    expect(project.language).toBe('java');
    expect(project.files[0].content).toContain(`import static androidx.test.espresso.Espresso.*;`);
  });

  it('should generate valid Robolectric Kotlin test project', async () => {
    const generator = GeneratorFactory.getGenerator('robolectric', 'kotlin');
    const project = await generator.generateFullProject(sampleAndroidSession);
    expect(project.framework).toBe('robolectric');
    expect(project.files[0].content).toContain(`import org.robolectric.RobolectricTestRunner`);
  });

  it('should generate valid Robolectric Java test project', async () => {
    const generator = GeneratorFactory.getGenerator('robolectric', 'java');
    const project = await generator.generateFullProject(sampleAndroidSession);
    expect(project.framework).toBe('robolectric');
    expect(project.language).toBe('java');
    expect(project.files[0].content).toContain(`import org.robolectric.RobolectricTestRunner;`);
  });

  it('should generate valid Maestro YAML flow for Android', async () => {
    const generator = GeneratorFactory.getGenerator('maestro', 'yaml');
    const project = await generator.generateFullProject(sampleAndroidSession);

    expect(project.framework).toBe('maestro');
    expect(project.language).toBe('yaml');

    const code = project.files[0].content;
    expect(code).toContain('appId: com.automateplus.demo');
    expect(code).toContain('- launchApp');
    expect(code).toContain('id: "com.automateplus.demo:id/input_email"');
    expect(code).toContain('inputText: "tester@example.com"');
    expect(code).toContain('id: "com.automateplus.demo:id/btn_login"');
  });

  // --- API Generators ---
  it('should generate valid k6 load testing script for API', async () => {
    const generator = GeneratorFactory.getGenerator('k6', 'javascript');
    const project = await generator.generateFullProject(sampleApiSession);

    expect(project.framework).toBe('k6');
    const code = project.files[0].content;
    expect(code).toContain(`import http from 'k6/http';`);
    expect(code).toContain(`executor: 'constant-arrival-rate'`);
    expect(code).toContain(`https://api.example.com/v1/auth/login`);
  });

  it('should generate valid HTTP TypeScript test project', async () => {
    const generator = GeneratorFactory.getGenerator('http', 'typescript');
    const project = await generator.generateFullProject(sampleApiSession);
    expect(project.framework).toBe('http');
    expect(project.files[0].content).toContain(`import axios, { AxiosResponse } from 'axios';`);
  });

  it('should generate valid HTTP Python test project', async () => {
    const generator = GeneratorFactory.getGenerator('http', 'python');
    const project = await generator.generateFullProject(sampleApiSession);
    expect(project.framework).toBe('http');
    expect(project.files[0].content).toContain(`import requests`);
  });

  it('should generate valid HTTP Java test project', async () => {
    const generator = GeneratorFactory.getGenerator('http', 'java');
    const project = await generator.generateFullProject(sampleApiSession);
    expect(project.framework).toBe('http');
    expect(project.files[0].content).toContain(`import io.restassured.RestAssured;`);
  });

  it('should reject unsupported combination with CapabilityError', () => {
    expect(() => GeneratorFactory.getGenerator('cypress', 'python')).toThrow('CapabilityError');
    expect(() => GeneratorFactory.getGenerator('espresso', 'python')).toThrow('CapabilityError');
  });
});
