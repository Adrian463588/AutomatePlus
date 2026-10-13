import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Globe,
  Lock,
  Play,
  RotateCw,
  Search,
  ShoppingCart,
  User,
} from 'lucide-react';
import { type ActionIR } from '@automate-plus/ir-schema';
import { useAppStore } from '../../store/appStore.js';
import { ORANGEHRM_TEMPLATE_STEPS, SAUCEDEMO_TEMPLATE_STEPS } from './VisualCanvas.js';

type SaucePage = 'login' | 'inventory' | 'cart' | 'checkout-step-one' | 'checkout-step-two' | 'checkout-complete';
type OrangeHrmPage = 'login' | 'dashboard';

export const WebDriverCanvas: React.FC = () => {
  const { activeSession, addStep, runTest, isRunning, loadTemplateSteps, updateTargetConfig } = useAppStore();

  const [currentUrl, setCurrentUrl] = useState<string>('https://www.saucedemo.com/');
  const [addressInput, setAddressInput] = useState<string>('https://www.saucedemo.com/');
  const [saucePage, setSaucePage] = useState<SaucePage>('login');
  const [sauceUsername, setSauceUsername] = useState('standard_user');
  const [saucePassword, setSaucePassword] = useState('secret_sauce');
  const [cartItems, setCartItems] = useState<string[]>([]);
  const [firstName, setFirstName] = useState('John');
  const [lastName, setLastName] = useState('Doe');
  const [postalCode, setPostalCode] = useState('94043');

  const [orangePage, setOrangePage] = useState<OrangeHrmPage>('login');
  const [orangeUsername, setOrangeUsername] = useState('Admin');
  const [orangePassword, setOrangePassword] = useState('admin123');

  const [genericQuery, setGenericQuery] = useState('AutomatePlus Search');

  const isSauceDemo = currentUrl.includes('saucedemo.com');
  const isOrangeHrm = currentUrl.includes('orangehrmlive.com');

  useEffect(() => {
    const startUrl = activeSession?.ir.targetConfig.startUrl;
    if (startUrl && startUrl.trim()) {
      setCurrentUrl(startUrl.trim());
      setAddressInput(startUrl.trim());
      if (startUrl.includes('orangehrmlive.com')) {
        setOrangePage('login');
      } else if (startUrl.includes('saucedemo.com')) {
        if (startUrl.includes('inventory')) setSaucePage('inventory');
        else if (startUrl.includes('cart')) setSaucePage('cart');
        else setSaucePage('login');
      }
    }
  }, [activeSession?.id, activeSession?.ir.targetConfig.startUrl]);

  const ensureWebSession = async (defaultName = 'SauceDemo Web Flow') => {
    const store = useAppStore.getState();
    if (store.activeSession && store.activeSession.platform === 'web') {
      return store.activeSession;
    }
    if (!store.activeProject && store.projects.length === 0) {
      await store.createProject('Default Workspace', 'D:\\SEMESTER12\\ProjectKode\\AutomatePlus');
    }
    await store.createSession(defaultName, 'web');
    return useAppStore.getState().activeSession;
  };

  const handleNavigateTo = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setCurrentUrl(trimmed);
    setAddressInput(trimmed);
    if (trimmed.includes('orangehrmlive.com')) {
      setOrangePage('login');
    } else if (trimmed.includes('saucedemo.com')) {
      if (trimmed.includes('inventory')) setSaucePage('inventory');
      else if (trimmed.includes('cart')) setSaucePage('cart');
      else setSaucePage('login');
    }

    const session = activeSession ?? (await ensureWebSession(trimmed.includes('orangehrm') ? 'OrangeHRM Web Flow' : 'SauceDemo Web Flow'));
    if (session) {
      await updateTargetConfig({ ...session.ir.targetConfig, startUrl: trimmed });
      const nextStepNum = session.ir.steps.length + 1;
      await addStep({
        id: crypto.randomUUID(),
        schemaVersion: 2,
        stepNumber: nextStepNum,
        platform: 'web',
        action: 'navigate',
        value: trimmed,
        timeoutMs: 5000,
        timestamp: Date.now(),
        optional: false,
      });
    }
  };

  const handleSauceLogin = async () => {
    if (!activeSession) return;
    const now = Date.now();
    const currentSteps = activeSession.ir.steps;
    const hasNav = currentSteps.some((s) => s.action === 'navigate' && typeof s.value === 'string' && s.value.includes('saucedemo.com'));

    const stepsToAdd: ActionIR[] = [];
    let stepNum = currentSteps.length + 1;

    if (!hasNav) {
      stepsToAdd.push({
        id: crypto.randomUUID(),
        schemaVersion: 2,
        stepNumber: stepNum++,
        platform: 'web',
        action: 'navigate',
        value: 'https://www.saucedemo.com/',
        timeoutMs: 5000,
        timestamp: now,
        optional: false,
      });
    }

    stepsToAdd.push(
      {
        id: crypto.randomUUID(),
        schemaVersion: 2,
        stepNumber: stepNum++,
        platform: 'web',
        action: 'fill',
        value: sauceUsername,
        locators: [
          { strategy: 'testId', value: 'username', score: 100 },
          { strategy: 'css', value: '#user-name', score: 80 },
        ],
        timeoutMs: 5000,
        timestamp: now + 50,
        optional: false,
      },
      {
        id: crypto.randomUUID(),
        schemaVersion: 2,
        stepNumber: stepNum++,
        platform: 'web',
        action: 'fill',
        value: saucePassword,
        locators: [
          { strategy: 'testId', value: 'password', score: 100 },
          { strategy: 'css', value: '#password', score: 80 },
        ],
        timeoutMs: 5000,
        timestamp: now + 100,
        optional: false,
      },
      {
        id: crypto.randomUUID(),
        schemaVersion: 2,
        stepNumber: stepNum++,
        platform: 'web',
        action: 'click',
        locators: [
          { strategy: 'testId', value: 'login-button', score: 100 },
          { strategy: 'css', value: '#login-button', score: 80 },
        ],
        timeoutMs: 5000,
        timestamp: now + 150,
        optional: false,
      },
      {
        id: crypto.randomUUID(),
        schemaVersion: 2,
        stepNumber: stepNum++,
        platform: 'web',
        action: 'assertUrl',
        expectedValue: 'https://www.saucedemo.com/inventory.html',
        timeoutMs: 5000,
        timestamp: now + 200,
        optional: false,
      },
      {
        id: crypto.randomUUID(),
        schemaVersion: 2,
        stepNumber: stepNum++,
        platform: 'web',
        action: 'assertVisible',
        locators: [
          { strategy: 'testId', value: 'inventory-container', score: 100 },
          { strategy: 'css', value: '.inventory_list', score: 80 },
        ],
        timeoutMs: 5000,
        timestamp: now + 250,
        optional: false,
      }
    );

    for (const step of stepsToAdd) {
      await addStep(step);
    }

    setSaucePage('inventory');
    setCurrentUrl('https://www.saucedemo.com/inventory.html');
    setAddressInput('https://www.saucedemo.com/inventory.html');
  };

  const handleAddToCart = async (itemKey: string, testId: string) => {
    if (!activeSession) return;
    const now = Date.now();
    const nextStepNum = activeSession.ir.steps.length + 1;

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: nextStepNum,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: testId, score: 100 },
        { strategy: 'css', value: `#${testId}`, score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: now,
      optional: false,
    });

    if (!cartItems.includes(itemKey)) {
      setCartItems([...cartItems, itemKey]);
    }
  };

  const handleGoToCart = async () => {
    if (!activeSession) return;
    const now = Date.now();
    const nextStepNum = activeSession.ir.steps.length + 1;

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: nextStepNum,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'shopping-cart-link', score: 100 },
        { strategy: 'css', value: '.shopping_cart_link', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: now,
      optional: false,
    });

    setSaucePage('cart');
    setCurrentUrl('https://www.saucedemo.com/cart.html');
    setAddressInput('https://www.saucedemo.com/cart.html');
  };

  const handleGoToCheckout = async () => {
    if (!activeSession) return;
    const now = Date.now();
    const nextStepNum = activeSession.ir.steps.length + 1;

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: nextStepNum,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'testId', value: 'checkout', score: 100 },
        { strategy: 'css', value: '#checkout', score: 85 },
      ],
      timeoutMs: 5000,
      timestamp: now,
      optional: false,
    });

    setSaucePage('checkout-step-one');
    setCurrentUrl('https://www.saucedemo.com/checkout-step-one.html');
    setAddressInput('https://www.saucedemo.com/checkout-step-one.html');
  };

  const handleContinueCheckout = async () => {
    if (!activeSession) return;
    const now = Date.now();
    let stepNum = activeSession.ir.steps.length + 1;

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'fill',
      value: firstName,
      locators: [{ strategy: 'testId', value: 'firstName', score: 100 }, { strategy: 'css', value: '#first-name', score: 80 }],
      timeoutMs: 5000,
      timestamp: now,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'fill',
      value: lastName,
      locators: [{ strategy: 'testId', value: 'lastName', score: 100 }, { strategy: 'css', value: '#last-name', score: 80 }],
      timeoutMs: 5000,
      timestamp: now + 50,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'fill',
      value: postalCode,
      locators: [{ strategy: 'testId', value: 'postalCode', score: 100 }, { strategy: 'css', value: '#postal-code', score: 80 }],
      timeoutMs: 5000,
      timestamp: now + 100,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'click',
      locators: [{ strategy: 'testId', value: 'continue', score: 100 }, { strategy: 'css', value: '#continue', score: 80 }],
      timeoutMs: 5000,
      timestamp: now + 150,
      optional: false,
    });

    setSaucePage('checkout-step-two');
    setCurrentUrl('https://www.saucedemo.com/checkout-step-two.html');
    setAddressInput('https://www.saucedemo.com/checkout-step-two.html');
  };

  const handleFinishCheckout = async () => {
    if (!activeSession) return;
    const now = Date.now();
    let stepNum = activeSession.ir.steps.length + 1;

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'click',
      locators: [{ strategy: 'testId', value: 'finish', score: 100 }, { strategy: 'css', value: '#finish', score: 80 }],
      timeoutMs: 5000,
      timestamp: now,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'assertText',
      expectedValue: 'Thank you for your order!',
      locators: [{ strategy: 'testId', value: 'complete-header', score: 100 }, { strategy: 'css', value: '.complete-header', score: 80 }],
      timeoutMs: 5000,
      timestamp: now + 50,
      optional: false,
    });

    setSaucePage('checkout-complete');
    setCurrentUrl('https://www.saucedemo.com/checkout-complete.html');
    setAddressInput('https://www.saucedemo.com/checkout-complete.html');
  };

  const handleOrangeLogin = async () => {
    if (!activeSession) return;
    const now = Date.now();
    let stepNum = activeSession.ir.steps.length + 1;

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'navigate',
      value: 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login',
      timeoutMs: 5000,
      timestamp: now,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'fill',
      value: orangeUsername,
      locators: [
        { strategy: 'css', value: 'input[name="username"]', score: 95 },
        { strategy: 'testId', value: 'username', score: 90 },
      ],
      timeoutMs: 5000,
      timestamp: now + 50,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'fill',
      value: orangePassword,
      locators: [
        { strategy: 'css', value: 'input[name="password"]', score: 95 },
        { strategy: 'testId', value: 'password', score: 90 },
      ],
      timeoutMs: 5000,
      timestamp: now + 100,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'click',
      locators: [
        { strategy: 'css', value: 'button[type="submit"]', score: 95 },
        { strategy: 'role', value: 'button[name="Login"]', score: 90 },
      ],
      timeoutMs: 5000,
      timestamp: now + 150,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'assertUrl',
      expectedValue: 'https://opensource-demo.orangehrmlive.com/web/index.php/dashboard/index',
      timeoutMs: 5000,
      timestamp: now + 200,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'assertVisible',
      locators: [{ strategy: 'css', value: '.oxd-topbar-header-breadcrumb', score: 95 }],
      timeoutMs: 5000,
      timestamp: now + 250,
      optional: false,
    });

    setOrangePage('dashboard');
    setCurrentUrl('https://opensource-demo.orangehrmlive.com/web/index.php/dashboard/index');
    setAddressInput('https://opensource-demo.orangehrmlive.com/web/index.php/dashboard/index');
  };

  const handleGenericAction = async () => {
    if (!activeSession) return;
    const now = Date.now();
    let stepNum = activeSession.ir.steps.length + 1;

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'fill',
      value: genericQuery,
      locators: [{ strategy: 'css', value: '#search-input', score: 90 }],
      timeoutMs: 5000,
      timestamp: now,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'click',
      locators: [{ strategy: 'css', value: '#search-button', score: 90 }],
      timeoutMs: 5000,
      timestamp: now + 50,
      optional: false,
    });

    await addStep({
      id: crypto.randomUUID(),
      schemaVersion: 2,
      stepNumber: stepNum++,
      platform: 'web',
      action: 'assertVisible',
      locators: [{ strategy: 'css', value: '#search-results', score: 90 }],
      timeoutMs: 5000,
      timestamp: now + 100,
      optional: false,
    });
  };

  const canGoBack = isSauceDemo
    ? (saucePage === 'inventory' || saucePage === 'cart' || saucePage === 'checkout-step-one' || saucePage === 'checkout-step-two' || saucePage === 'checkout-complete')
    : isOrangeHrm
      ? (orangePage === 'dashboard')
      : false;

  const canGoForward = isSauceDemo
    ? (saucePage === 'login' || saucePage === 'inventory' || saucePage === 'cart' || saucePage === 'checkout-step-one')
    : isOrangeHrm
      ? (orangePage === 'login')
      : false;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-950 border-b border-slate-800 text-xs">
      {/* WebDriver Chrome Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 flex-wrap">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={!canGoBack}
            onClick={() => {
              if (saucePage === 'inventory') setSaucePage('login');
              else if (saucePage === 'cart') setSaucePage('inventory');
              else if (saucePage === 'checkout-step-one') setSaucePage('cart');
              else if (saucePage === 'checkout-step-two') setSaucePage('checkout-step-one');
              else if (saucePage === 'checkout-complete') setSaucePage('inventory');
              else if (orangePage === 'dashboard') setOrangePage('login');
            }}
            title={canGoBack ? 'WebDriver Back' : 'No previous history in simulated session'}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed tactile-active min-h-8 min-w-8 flex items-center justify-center"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canGoForward}
            onClick={() => {
              if (saucePage === 'login') setSaucePage('inventory');
              else if (saucePage === 'inventory') setSaucePage('cart');
              else if (saucePage === 'cart') setSaucePage('checkout-step-one');
              else if (saucePage === 'checkout-step-one') setSaucePage('checkout-step-two');
              else if (orangePage === 'login') setOrangePage('dashboard');
            }}
            title={canGoForward ? 'WebDriver Forward' : 'No forward history in simulated session'}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed tactile-active min-h-8 min-w-8 flex items-center justify-center"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleNavigateTo(currentUrl)}
            title="Reload WebDriver Viewport"
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 tactile-active min-h-8 min-w-8 flex items-center justify-center"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Address Input */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-xl">
          <div className="flex items-center flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200">
            <Globe className="w-3.5 h-3.5 text-cyan-400 mr-1.5 shrink-0" />
            <input
              id="webdriver-address-bar"
              type="url"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleNavigateTo(addressInput);
              }}
              className="bg-transparent text-xs font-mono w-full focus:outline-none text-slate-100"
              aria-label="WebDriver simulated target URL"
            />
          </div>
          <button
            type="button"
            id="webdriver-navigate-btn"
            onClick={() => void handleNavigateTo(addressInput)}
            title="Navigate to address in WebDriver"
            className="button-small bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-800/60 tactile-active"
          >
            Go
          </button>
        </div>

        {/* Presets and In-app Run */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            id="load-saucedemo-flow"
            onClick={async () => {
              await ensureWebSession('SauceDemo Web Flow');
              await handleNavigateTo('https://www.saucedemo.com/');
              await loadTemplateSteps(SAUCEDEMO_TEMPLATE_STEPS, 'https://www.saucedemo.com/');
              setSaucePage('login');
            }}
            title="Load SauceDemo flow (15 steps)"
            className="px-2 py-1 rounded text-[11px] font-semibold bg-sky-950 hover:bg-sky-900 text-sky-200 border border-sky-700/70 tactile-active"
          >
            SauceDemo (15 steps)
          </button>
          <button
            type="button"
            id="load-orangehrm-flow"
            onClick={async () => {
              await ensureWebSession('OrangeHRM Web Flow');
              await handleNavigateTo('https://opensource-demo.orangehrmlive.com/');
              await loadTemplateSteps(ORANGEHRM_TEMPLATE_STEPS, 'https://opensource-demo.orangehrmlive.com/');
              setOrangePage('login');
            }}
            title="Load OrangeHRM flow (6 steps)"
            className="px-2 py-1 rounded text-[11px] font-semibold bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-700/70 tactile-active"
          >
            OrangeHRM (6 steps)
          </button>
          <button
            type="button"
            id="webdriver-run-in-app"
            disabled={isRunning || !activeSession || activeSession.ir.steps.length === 0}
            onClick={() => void runTest('interactive')}
            title={isRunning ? 'Execution in progress' : 'Run recorded steps in WebDriver runner'}
            className="button-small bg-emerald-800 hover:bg-emerald-700 text-white font-medium disabled:opacity-40 tactile-active"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run in WebDriver</span>
          </button>
        </div>
      </div>

      {/* WebDriver Status Sub-bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900/60 border-b border-slate-800/80 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded bg-emerald-400 animate-pulse" />
            WebDriver Active
          </span>
          <span className="text-slate-600">|</span>
          <span>Viewport: 1280×800 (Headed Simulation)</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Recorded Steps: {activeSession?.ir.steps.length ?? 0}</span>
        </div>
      </div>

      {/* Simulated Web DOM Viewport */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-start bg-slate-950/60">
        {/* Case 1: SauceDemo */}
        {isSauceDemo && (
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
            {/* Swag Labs Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-wider text-sky-400 font-mono">SWAG LABS</span>
                <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-800 px-1.5 py-0.5 rounded font-mono">
                  {saucePage.toUpperCase()}
                </span>
              </div>
              <button
                type="button"
                id="shopping-cart-link"
                disabled={saucePage === 'login'}
                onClick={() => void handleGoToCart()}
                title={saucePage === 'login' ? 'Please log in first to view shopping cart' : 'View Shopping Cart'}
                className="relative p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="w-4 h-4 text-cyan-400" />
                {cartItems.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                    {cartItems.length}
                  </span>
                )}
              </button>
            </div>

            {/* Sauce Demo Sub-pages */}
            {saucePage === 'login' && (
              <div className="space-y-4 py-2">
                <div className="text-center space-y-1">
                  <h3 className="text-sm font-bold text-slate-200">Accepted Credentials</h3>
                  <p className="text-[11px] text-slate-400">Username: <code className="text-cyan-300">standard_user</code> | Password: <code className="text-cyan-300">secret_sauce</code></p>
                </div>

                <div className="space-y-3 max-w-sm mx-auto">
                  <div className="space-y-1">
                    <label htmlFor="user-name" className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" /> Username
                    </label>
                    <input
                      id="user-name"
                      data-test="username"
                      type="text"
                      value={sauceUsername}
                      onChange={(e) => setSauceUsername(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="password" className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-400" /> Password
                    </label>
                    <input
                      id="password"
                      data-test="password"
                      type="password"
                      value={saucePassword}
                      onChange={(e) => setSaucePassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    id="login-button"
                    data-test="login-button"
                    onClick={() => void handleSauceLogin()}
                    title="Click Login and Record ActionIR Steps"
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded text-xs flex items-center justify-center gap-2"
                  >
                    <span>Login & Record Steps</span>
                  </button>
                </div>
              </div>
            )}

            {saucePage === 'inventory' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-sm">Products</span>
                  <span className="text-[11px] text-slate-400">Click &apos;Add to cart&apos; to record click actions</span>
                </div>

                <div className="space-y-2">
                  {/* Item 1 */}
                  <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-md">
                    <div>
                      <div className="font-bold text-slate-200">Sauce Labs Backpack</div>
                      <div className="text-[11px] text-slate-400">$29.99 · Carry all your gear in style</div>
                    </div>
                    <button
                      type="button"
                      id="add-to-cart-sauce-labs-backpack"
                      data-test="add-to-cart-sauce-labs-backpack"
                      onClick={() => void handleAddToCart('backpack', 'add-to-cart-sauce-labs-backpack')}
                      title="Add Sauce Labs Backpack to cart"
                      className="button-small bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-800"
                    >
                      {cartItems.includes('backpack') ? 'Added' : 'Add to cart'}
                    </button>
                  </div>

                  {/* Item 2 */}
                  <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-md">
                    <div>
                      <div className="font-bold text-slate-200">Sauce Labs Bike Light</div>
                      <div className="text-[11px] text-slate-400">$9.99 · Water-resistant LED light</div>
                    </div>
                    <button
                      type="button"
                      id="add-to-cart-sauce-labs-bike-light"
                      data-test="add-to-cart-sauce-labs-bike-light"
                      onClick={() => void handleAddToCart('bike-light', 'add-to-cart-sauce-labs-bike-light')}
                      title="Add Sauce Labs Bike Light to cart"
                      className="button-small bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-800"
                    >
                      {cartItems.includes('bike-light') ? 'Added' : 'Add to cart'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => void handleGoToCart()}
                    title="Proceed to Cart"
                    className="button-small bg-sky-800 hover:bg-sky-700 text-white font-medium"
                  >
                    <span>View Cart ({cartItems.length})</span>
                  </button>
                </div>
              </div>
            )}

            {saucePage === 'cart' && (
              <div className="space-y-3">
                <span className="font-bold text-slate-200 text-sm">Your Cart</span>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-md space-y-1">
                  <div className="font-bold text-slate-200">Sauce Labs Backpack</div>
                  <div className="text-[11px] text-slate-400">Qty: 1 · $29.99</div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSaucePage('inventory')}
                    title="Continue Shopping"
                    className="button-small bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Continue Shopping
                  </button>
                  <button
                    type="button"
                    id="checkout"
                    data-test="checkout"
                    onClick={() => void handleGoToCheckout()}
                    title="Click Checkout"
                    className="button-small bg-emerald-700 hover:bg-emerald-600 text-white font-semibold"
                  >
                    Checkout
                  </button>
                </div>
              </div>
            )}

            {saucePage === 'checkout-step-one' && (
              <div className="space-y-3 max-w-sm mx-auto">
                <span className="font-bold text-slate-200 text-sm">Checkout: Your Information</span>
                <div className="space-y-2">
                  <input
                    id="first-name"
                    data-test="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    aria-label="First Name"
                  />
                  <input
                    id="last-name"
                    data-test="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    aria-label="Last Name"
                  />
                  <input
                    id="postal-code"
                    data-test="postalCode"
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    aria-label="Postal Code"
                  />
                </div>
                <button
                  type="button"
                  id="continue"
                  data-test="continue"
                  onClick={() => void handleContinueCheckout()}
                  title="Continue to Overview"
                  className="w-full py-2 bg-sky-700 hover:bg-sky-600 text-white font-bold rounded text-xs"
                >
                  Continue
                </button>
              </div>
            )}

            {saucePage === 'checkout-step-two' && (
              <div className="space-y-3">
                <span className="font-bold text-slate-200 text-sm">Checkout: Overview</span>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-md space-y-1">
                  <div className="font-bold text-slate-200">Payment: SauceCard #31337</div>
                  <div className="text-[11px] text-slate-400">Total: $32.39</div>
                </div>
                <button
                  type="button"
                  id="finish"
                  data-test="finish"
                  onClick={() => void handleFinishCheckout()}
                  title="Finish Purchase Order"
                  className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded text-xs"
                >
                  Finish
                </button>
              </div>
            )}

            {saucePage === 'checkout-complete' && (
              <div className="text-center space-y-3 py-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 id="complete-header" data-test="complete-header" className="text-base font-bold text-slate-100">
                  Thank you for your order!
                </h3>
                <p className="text-xs text-slate-400">Your order has been dispatched and will arrive just as fast as the pony can get there!</p>
                <button
                  type="button"
                  id="back-to-products"
                  onClick={() => setSaucePage('inventory')}
                  title="Back to inventory"
                  className="button-small bg-slate-800 hover:bg-slate-700 text-slate-200 mx-auto"
                >
                  Back Home
                </button>
              </div>
            )}
          </div>
        )}

        {/* Case 2: OrangeHRM */}
        {isOrangeHrm && (
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-amber-400 font-mono">OrangeHRM OS</span>
                <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded font-mono">
                  {orangePage.toUpperCase()}
                </span>
              </div>
            </div>

            {orangePage === 'login' ? (
              <div className="space-y-4 max-w-sm mx-auto py-2">
                <div className="text-center space-y-1">
                  <h3 className="text-sm font-bold text-slate-200">Login to Dashboard</h3>
                  <p className="text-[11px] text-slate-400">Username: <code className="text-amber-300">Admin</code> | Password: <code className="text-amber-300">admin123</code></p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="orangehrm-username" className="text-[11px] text-slate-300">Username</label>
                    <input
                      id="orangehrm-username"
                      name="username"
                      type="text"
                      value={orangeUsername}
                      onChange={(e) => setOrangeUsername(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="orangehrm-password" className="text-[11px] text-slate-300">Password</label>
                    <input
                      id="orangehrm-password"
                      name="password"
                      type="password"
                      value={orangePassword}
                      onChange={(e) => setOrangePassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    id="orangehrm-login-button"
                    onClick={() => void handleOrangeLogin()}
                    title="Login to OrangeHRM & record steps"
                    className="w-full py-2 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded text-xs"
                  >
                    Login
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="oxd-topbar-header-breadcrumb text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">
                  Dashboard
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded">
                    <div className="font-semibold text-slate-300">Time at Work</div>
                    <div className="text-[11px] text-emerald-400 mt-1">Punched In · 07h 45m</div>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded">
                    <div className="font-semibold text-slate-300">My Actions</div>
                    <div className="text-[11px] text-sky-400 mt-1">1 Pending Leave Request</div>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOrangePage('login')}
                    title="Log out of OrangeHRM"
                    className="button-small bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Case 3: Generic Web Target */}
        {!isSauceDemo && !isOrangeHrm && (
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" />
                Generic Target WebDriver Canvas
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">{currentUrl}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  id="search-input"
                  type="text"
                  value={genericQuery}
                  onChange={(e) => setGenericQuery(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                  aria-label="Generic Search input"
                />
                <button
                  type="button"
                  id="search-button"
                  onClick={() => void handleGenericAction()}
                  title="Search & Record Actions"
                  className="button-small bg-cyan-800 hover:bg-cyan-700 text-white font-medium"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Execute</span>
                </button>
              </div>

              <div id="search-results" className="p-3 bg-slate-950 border border-slate-800 rounded text-xs space-y-1">
                <div className="font-bold text-slate-300">Ready for Visual Interaction</div>
                <div className="text-[11px] text-slate-400">
                  Target is rendered in the WebDriver canvas. Interact with elements above or use preset flows to generate cross-framework test scripts.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
