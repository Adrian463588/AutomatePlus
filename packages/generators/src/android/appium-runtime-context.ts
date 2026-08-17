import {
  CapabilityError,
  RuntimeContextKey,
  RuntimeContextSpec,
} from '@automate-plus/contracts';

type AppiumGeneratedLanguage = 'typescript' | 'javascript' | 'java' | 'kotlin';

interface RuntimeContextNames {
  appiumUrl: string;
  udid: string;
  systemPort: string;
  mjpegServerPort: string;
  chromedriverPort: string;
}

function getVariableName(context: RuntimeContextSpec, key: RuntimeContextKey, required: boolean): string {
  const variable = context.variables.find((candidate) => candidate.key === key);
  if (!variable || (required && !variable.required)) {
    throw new CapabilityError(`Runtime context is missing required variable '${key}'.`, { key });
  }
  return variable.name;
}

function getRuntimeContextNames(context: RuntimeContextSpec): RuntimeContextNames {
  if (context.source !== 'environment') {
    throw new CapabilityError('Appium generators require an environment runtime context.', { source: context.source });
  }
  if (context.schemaVersion !== 1) {
    throw new CapabilityError('Unsupported Appium runtime context version.', { schemaVersion: context.schemaVersion });
  }
  return {
    appiumUrl: getVariableName(context, 'appiumUrl', true),
    udid: getVariableName(context, 'udid', true),
    systemPort: getVariableName(context, 'systemPort', true),
    mjpegServerPort: getVariableName(context, 'mjpegServerPort', true),
    chromedriverPort: getVariableName(context, 'chromedriverPort', false),
  };
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function renderJavaRuntimeContext(names: RuntimeContextNames): string {
  return [
    `    private static String requiredRuntimeValue(String name) {`,
    `        String value = System.getenv(name);`,
    `        if (value == null || value.isBlank()) {`,
    `            throw new IllegalStateException("Missing required AutomatePlus runtime context: " + name);`,
    `        }`,
    `        return value;`,
    `    }`,
    ``,
    `    private static int requiredRuntimePort(String name) {`,
    `        try {`,
    `            int port = Integer.parseInt(requiredRuntimeValue(name));`,
    `            if (port < 1 || port > 65535) throw new NumberFormatException();`,
    `            return port;`,
    `        } catch (NumberFormatException error) {`,
    `            throw new IllegalStateException("Invalid AutomatePlus runtime context port: " + name, error);`,
    `        }`,
    `    }`,
    ``,
    `    private static Integer optionalRuntimePort(String name) {`,
    `        if (System.getenv(name) == null) return null;`,
    `        return requiredRuntimePort(name);`,
    `    }`,
    ``,
    `    private static URL requiredAppiumUrl() throws Exception {`,
    `        URL url = new URL(requiredRuntimeValue(${quote(names.appiumUrl)}));`,
    `        if (url.getPort() < 1 || url.getPort() > 65535) {`,
    `            throw new IllegalStateException("Appium runtime context URL must include an explicit port");`,
    `        }`,
    `        return url;`,
    `    }`,
    ``,
    `    private static String requiredDeviceUdid() {`,
    `        return requiredRuntimeValue(${quote(names.udid)});`,
    `    }`,
    ``,
    `    private static int requiredSystemPort() {`,
    `        return requiredRuntimePort(${quote(names.systemPort)});`,
    `    }`,
    ``,
    `    private static int requiredMjpegServerPort() {`,
    `        return requiredRuntimePort(${quote(names.mjpegServerPort)});`,
    `    }`,
    ``,
    `    private static Integer optionalChromedriverPort() {`,
    `        return optionalRuntimePort(${quote(names.chromedriverPort)});`,
    `    }`,
  ].join('\n');
}

function renderKotlinRuntimeContext(names: RuntimeContextNames): string {
  return [
    `    private object AutomatePlusRuntime {`,
    `        private fun required(name: String): String {`,
    `            val value = System.getenv(name)`,
    `            require(!value.isNullOrBlank()) { "Missing required AutomatePlus runtime context: $name" }`,
    `            return value`,
    `        }`,
    ``,
    `        private fun requiredPort(name: String, value: String = required(name)): Int {`,
    `            val port = value.toIntOrNull()`,
    `            require(port != null && port in 1..65535) { "Invalid AutomatePlus runtime context port: $name" }`,
    `            return port`,
    `        }`,
    ``,
    `        fun appiumUrl(): URL {`,
    `            val url = URL(required(${quote(names.appiumUrl)}))`,
    `            require(url.port in 1..65535) { "Appium runtime context URL must include an explicit port" }`,
    `            return url`,
    `        }`,
    ``,
    `        fun udid(): String = required(${quote(names.udid)})`,
    `        fun systemPort(): Int = requiredPort(${quote(names.systemPort)})`,
    `        fun mjpegServerPort(): Int = requiredPort(${quote(names.mjpegServerPort)})`,
    `        fun chromedriverPort(): Int? {`,
    `            val value = System.getenv(${quote(names.chromedriverPort)}) ?: return null`,
    `            return requiredPort(${quote(names.chromedriverPort)}, value)`,
    `        }`,
    `    }`,
  ].join('\n');
}

function renderJavascriptRuntimeContext(names: RuntimeContextNames, typed: boolean): string {
  const typeAnnotation = typed ? ': string' : '';
  const portType = typed ? ': number' : '';
  const optionalPortType = typed ? ': number | undefined' : '';
  const runtimeValue = typed
    ? `const requiredRuntimeValue = (name${typeAnnotation})${typeAnnotation} => {`
    : `const requiredRuntimeValue = (name) => {`;
  const runtimePort = typed
    ? `const requiredRuntimePort = (name${typeAnnotation})${portType} => {`
    : `const requiredRuntimePort = (name) => {`;
  const optionalPort = typed
    ? `const optionalRuntimePort = (name${typeAnnotation})${optionalPortType} => {`
    : `const optionalRuntimePort = (name) => {`;

  return [
    runtimeValue,
    `  const value = process.env[name];`,
    `  if (value === undefined || value.length === 0) {`,
    `    throw new Error(\`Missing required AutomatePlus runtime context: \${name}\`);`,
    `  }`,
    `  return value;`,
    `};`,
    ``,
    runtimePort,
    `  const port = Number(requiredRuntimeValue(name));`,
    `  if (!Number.isInteger(port) || port < 1 || port > 65535) {`,
    `    throw new Error(\`Invalid AutomatePlus runtime context port: \${name}\`);`,
    `  }`,
    `  return port;`,
    `};`,
    ``,
    optionalPort,
    `  const raw = process.env[name];`,
    `  if (raw === undefined) return undefined;`,
    `  const port = Number(raw);`,
    `  if (!Number.isInteger(port) || port < 1 || port > 65535) {`,
    `    throw new Error(\`Invalid AutomatePlus runtime context port: \${name}\`);`,
    `  }`,
    `  return port;`,
    `};`,
    ``,
    `const appiumUrl = new URL(requiredRuntimeValue(${quote(names.appiumUrl)}));`,
    `if (!appiumUrl.port || Number(appiumUrl.port) < 1 || Number(appiumUrl.port) > 65535) {`,
    `  throw new Error('Appium runtime context URL must include an explicit port');`,
    `}`,
    `const runtimeContext = {`,
    `  appiumUrl,`,
    `  udid: requiredRuntimeValue(${quote(names.udid)}),`,
    `  systemPort: requiredRuntimePort(${quote(names.systemPort)}),`,
    `  mjpegServerPort: requiredRuntimePort(${quote(names.mjpegServerPort)}),`,
    `  chromedriverPort: optionalRuntimePort(${quote(names.chromedriverPort)}),`,
    `};`,
  ].join('\n');
}

export function renderAppiumRuntimeContext(
  context: RuntimeContextSpec,
  language: AppiumGeneratedLanguage,
): string {
  const names = getRuntimeContextNames(context);
  if (language === 'java') return renderJavaRuntimeContext(names);
  if (language === 'kotlin') return renderKotlinRuntimeContext(names);
  return renderJavascriptRuntimeContext(names, language === 'typescript');
}
