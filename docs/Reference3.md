# Rekomendasi arsitektur **Automate Plus**

**Target:** aplikasi desktop Windows yang bekerja lokal/offline, dapat merekam aksi web dan Android, menghasilkan kode lintas-framework, menjalankan pengujian E2E, serta melakukan functional looping dan load/RPS testing.

## Rekomendasi utama

Bangun Automate Plus dengan prinsip berikut:

> **Recorder tidak langsung menulis kode framework. Recorder menghasilkan Automation Intermediate Representation atau Automation IR. Kode Playwright, Cypress, Selenium, Appium, Espresso, dan framework lain dihasilkan dari IR melalui adapter terpisah.**

Tanpa IR, setiap fitur recorder harus dibuat ulang untuk setiap kombinasi framework dan bahasa. Dengan IR, satu hasil rekaman dapat digunakan untuk menghasilkan beberapa proyek automation berbeda.

Stack inti yang saya rekomendasikan:

* **Desktop:** Electron + React + TypeScript.
* **Core orchestrator:** Node.js/TypeScript dalam Electron utility process.
* **Web recording:** Playwright + Chrome DevTools Protocol.
* **Android recording:** ADB + Appium UiAutomator2 + scrcpy untuk mirroring.
* **Penyimpanan:** SQLite untuk metadata dan file system untuk source code serta artefak.
* **Code editor:** Monaco Editor.
* **Terminal/log viewer:** xterm.js.
* **Load/RPS engine:** k6 lokal.
* **Arsitektur:** Hexagonal Architecture / Ports and Adapters.
* **Distribusi offline:** modular runtime packs dengan versi dan checksum yang dikunci.

Electron cocok untuk proyek ini karena menggabungkan Chromium dan Node.js, memiliki model multi-process, serta menyediakan utility process untuk menjalankan pekerjaan Node di luar renderer. Tauri tetap merupakan alternatif yang lebih ringan, tetapi pada Windows ia menggunakan WebView2 dan memerlukan sidecar untuk Node, Python, Java, Appium, dan framework lain. Karena Automate Plus memang membutuhkan banyak runtime tersebut, Electron memberikan integrasi yang lebih sederhana. ([Electron][1])

---

# 1. Matriks framework dan bahasa yang realistis

Tidak semua framework mendukung semua bahasa. Antarmuka Automate Plus harus menonaktifkan kombinasi yang tidak valid daripada menghasilkan kode palsu atau wrapper yang tidak dapat dijalankan.

## Web automation

| Framework          | TypeScript | JavaScript | Python | Java | Catatan                                                                      |
| ------------------ | ---------: | ---------: | -----: | ---: | ---------------------------------------------------------------------------- |
| Playwright         |          ✅ |          ✅ |      ✅ |    ✅ | Pilihan utama untuk recorder web                                             |
| Cypress            |          ✅ |          ✅ |      ❌ |    ❌ | Test resmi hanya JS/TS                                                       |
| Puppeteer          |          ✅ |          ✅ |      ❌ |    ❌ | Library resmi berbasis JS; TS dikompilasi ke JS                              |
| Selenium WebDriver |         ✅* |          ✅ |      ✅ |    ✅ | TS memakai JavaScript binding                                                |
| Robot Framework    |          ❌ |          ❌ |     ⚠️ |    ❌ | Output utama adalah file `.robot`; Python dapat dipakai untuk custom library |

Playwright menyediakan binding resmi untuk JavaScript/TypeScript, Python, Java, dan .NET serta mempunyai Codegen yang dapat merekam interaksi dan menghasilkan locator. Cypress secara resmi menulis test menggunakan JavaScript atau TypeScript. Puppeteer merupakan library JavaScript untuk mengontrol Chrome atau Firefox. Selenium memiliki binding resmi untuk Java, Python, dan JavaScript, sedangkan TypeScript dapat menggunakan binding JavaScript melalui proses kompilasi. Robot Framework menggunakan format keyword-driven `.robot`; SeleniumLibrary-nya berjalan di lingkungan Python. ([Playwright][2])

## Android automation

| Framework             | Kotlin | Java | TypeScript | JavaScript | Output sebenarnya                           |
| --------------------- | -----: | ---: | ---------: | ---------: | ------------------------------------------- |
| Appium + UiAutomator2 |     ⚠️ |    ✅ |          ✅ |          ✅ | Kotlin menggunakan Appium Java Client       |
| Espresso              |      ✅ |    ✅ |          ❌ |          ❌ | Instrumented test Android                   |
| Robolectric           |      ✅ |    ✅ |          ❌ |          ❌ | Local JVM test, bukan device E2E            |
| Maestro               |      ❌ |    ❌ |         ❌* |         ⚠️ | YAML Flow; JS hanya untuk expression/script |

Appium menyediakan Java Client resmi dan merekomendasikan WebdriverIO untuk JavaScript/TypeScript. Karena Kotlin interoperable dengan Java di JVM, Appium Java Client dapat digunakan dari Kotlin, tetapi tidak ada Kotlin client terpisah. Espresso memang ditujukan untuk Android UI test dalam Kotlin atau Java. Robolectric menjalankan Android test di JVM tanpa emulator atau perangkat sehingga tidak boleh diposisikan sebagai framework device E2E. Maestro menggunakan YAML sebagai format utama dan JavaScript hanya untuk logika tambahan. ([Appium][3])

## Implikasi pada desain aplikasi

Automate Plus harus mempunyai dua jenis capability:

```text
LanguageCapability
ActionCapability
```

Contoh:

```text
Cypress + Python               = tidak didukung
Espresso + TypeScript          = tidak didukung
Robolectric + physical device  = tidak didukung
Maestro + Kotlin output        = tidak didukung
Appium + custom multi-touch    = dukungan terbatas
```

Ketika satu aksi tidak dapat diterjemahkan dengan aman, generator harus berhenti dengan pesan:

```text
Action "multiPointerGesture" is not supported by CypressGenerator.
Manual implementation is required.
```

Jangan menghasilkan komentar `TODO` lalu menyatakan proyek berhasil.

---

# 2. Stack teknis yang direkomendasikan

| Layer                     | Stack                                          |
| ------------------------- | ---------------------------------------------- |
| Desktop shell             | Electron                                       |
| UI                        | React + TypeScript + Vite                      |
| Component system          | Radix UI atau komponen internal sederhana      |
| State lokal UI            | Zustand                                        |
| Validation                | Zod                                            |
| Code editor               | Monaco Editor                                  |
| Terminal/log              | xterm.js                                       |
| IPC                       | Electron `contextBridge` + typed IPC           |
| Orchestrator              | TypeScript dalam Electron utility process      |
| Database                  | SQLite                                         |
| Workspace                 | File system biasa agar dapat dibuka di VS Code |
| Web controller            | Playwright Chromium                            |
| Web recording             | Playwright + injected event collector + CDP    |
| Android discovery         | ADB                                            |
| Android automation        | Appium + UiAutomator2                          |
| Android mirror            | scrcpy                                         |
| Android native generation | KotlinPoet dan JavaPoet                        |
| TS/JS generation          | TypeScript AST atau ts-morph                   |
| Python generation         | Template terstruktur + Ruff                    |
| Robot/Maestro generation  | Structured serializer                          |
| Load testing              | k6 lokal                                       |
| Unit testing              | Vitest                                         |
| Desktop integration test  | Playwright Electron testing                    |
| Packaging                 | Electron Forge, installer Windows offline      |
| Runtimes                  | Modular offline packs                          |

## Mengapa core memakai TypeScript

TypeScript cocok sebagai bahasa domain utama karena:

1. Electron dan sebagian besar automation web berada di ekosistem Node.
2. Cypress, Playwright Node, Puppeteer, WebdriverIO, Monaco, dan Electron dapat berbagi tipe.
3. IR, capability contract, IPC, generator, dan runner events dapat menggunakan schema yang sama.
4. Python, Java, Kotlin, Robot, dan Maestro tetap dijalankan melalui adapter proses terpisah.

---

# 3. Arsitektur aplikasi

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron Renderer                                           │
│ React UI, Monaco, Timeline, Reports, Runtime Manager         │
└─────────────────────────┬───────────────────────────────────┘
                          │ Typed IPC melalui preload
┌─────────────────────────▼───────────────────────────────────┐
│ Electron Main Process                                       │
│ Window, permission, file dialog, process lifecycle           │
└─────────────────────────┬───────────────────────────────────┘
                          │ MessagePort
┌─────────────────────────▼───────────────────────────────────┐
│ Automation Orchestrator Utility Process                     │
│ Session, IR, queue, runtime resolution, reporting            │
└───────┬────────────┬────────────┬────────────┬──────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
 Web Recorder   Android Layer   Codegen      Runner Manager
 Playwright     ADB/Appium      Adapters      Process isolation
        │            │            │            │
        └────────────┴──────┬─────┴────────────┘
                            ▼
                   Automation IR
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
      Generated Project              Run Artifacts
      TS/Python/Java/etc.             HTML/JUnit/log/video
```

## Struktur monorepo

```text
automate-plus/
├─ apps/
│  └─ desktop/
│     ├─ main/
│     ├─ preload/
│     └─ renderer/
├─ packages/
│  ├─ domain/
│  ├─ ir-schema/
│  ├─ persistence/
│  ├─ runtime-manager/
│  ├─ recorder-web/
│  ├─ recorder-android/
│  ├─ runner-core/
│  ├─ report-core/
│  ├─ generators/
│  │  ├─ playwright/
│  │  ├─ cypress/
│  │  ├─ puppeteer/
│  │  ├─ selenium/
│  │  ├─ robot/
│  │  ├─ appium/
│  │  ├─ espresso/
│  │  ├─ robolectric/
│  │  └─ maestro/
│  └─ shared-test-fixtures/
├─ fixtures/
│  ├─ web-test-site/
│  └─ android-test-app/
├─ runtime-packs/
├─ scripts/
└─ docs/
```

Jangan membuat satu file `generator.ts` berisi ratusan `switch`. Gunakan adapter terpisah:

```ts
interface AutomationAdapter {
  readonly id: string;

  capabilities(): CapabilitySet;

  generate(session: AutomationSession): Promise<GeneratedProject>;

  validate(project: GeneratedProject): Promise<ValidationResult>;

  run(
    project: GeneratedProject,
    options: RunOptions,
  ): AsyncIterable<RunEvent>;
}
```

Dengan struktur ini:

* **Single Responsibility:** recorder tidak menjalankan test.
* **Open/Closed:** framework baru ditambah melalui adapter.
* **Dependency Inversion:** domain tidak bergantung pada Appium atau Playwright.
* **DRY:** normalisasi aksi dan penyimpanan session hanya dibuat satu kali.
* **Tidak over-engineered:** satu adapter hanya menangani satu framework.

---

# 4. Automation Intermediate Representation

IR harus menjadi sumber kebenaran utama, bukan generated code.

Contoh sederhana:

```json
{
  "schemaVersion": 1,
  "sessionId": "session-login-001",
  "target": {
    "kind": "web",
    "startUrl": "http://localhost:3000",
    "viewport": {
      "width": 1440,
      "height": 900
    }
  },
  "steps": [
    {
      "id": "step-001",
      "action": "fill",
      "locators": [
        {
          "strategy": "testId",
          "value": "login-email",
          "score": 100
        },
        {
          "strategy": "label",
          "value": "Email",
          "score": 90
        }
      ],
      "valueRef": "dataset.userEmail"
    },
    {
      "id": "step-002",
      "action": "click",
      "locators": [
        {
          "strategy": "role",
          "role": "button",
          "name": "Masuk",
          "score": 95
        }
      ]
    },
    {
      "id": "step-003",
      "action": "assertVisible",
      "locators": [
        {
          "strategy": "text",
          "value": "Dashboard",
          "score": 80
        }
      ]
    }
  ]
}
```

## Aksi lintas-platform

Gunakan domain action yang netral:

```text
navigate
launchApp
click
doubleClick
tap
longPress
fill
clear
select
check
uncheck
pressKey
scroll
swipe
drag
drop
hover
upload
waitFor
assertVisible
assertHidden
assertText
assertValue
assertUrl
takeScreenshot
back
home
rotate
```

Framework adapter bertugas menerjemahkan action tersebut.

Contoh:

```text
IR drag
├─ Playwright     → locator.dragTo()
├─ Selenium       → Actions.dragAndDrop()
├─ Puppeteer      → mouse.down/move/up
├─ Appium         → mobile: dragGesture
├─ Espresso       → custom ViewAction
└─ Maestro        → swipe command atau unsupported
```

## Locator candidate

Simpan beberapa locator, bukan hanya satu.

### Prioritas web

1. `data-testid` atau atribut test khusus.
2. ARIA role dan accessible name.
3. Label.
4. ID atau name yang stabil.
5. Teks stabil.
6. CSS selector.
7. XPath sebagai fallback terakhir.
8. Koordinat hanya sebagai fallback khusus.

Playwright Codegen memilih locator dengan mempertimbangkan role, text, dan test ID serta mencoba menghasilkan locator unik. Cypress juga merekomendasikan atribut `data-*` agar selector tidak bergantung pada CSS atau perubahan tampilan. ([Playwright][4])

### Prioritas Android

1. `resource-id`.
2. Accessibility ID / `content-desc`.
3. Teks stabil.
4. Class dan atribut tambahan.
5. XPath.
6. Koordinat sebagai fallback terakhir.

Koordinat harus tetap disimpan karena beberapa canvas, game view, map, atau custom-rendered component tidak tersedia dalam accessibility hierarchy.

---

# 5. Implementasi web recorder

## Langkah 1 — Jalankan browser terpisah

Jangan memuat website target ke renderer Electron yang memiliki akses internal.

Gunakan Playwright untuk membuka Chromium dalam mode headed:

```text
Automate Plus
    └─ Web Recorder Worker
          └─ Playwright Chromium Window
```

Target website tetap terisolasi dari Node dan file system Automate Plus.

Electron renderer harus menggunakan:

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
```

API privileged hanya diekspos melalui `contextBridge` dengan metode yang dibatasi. Electron secara resmi merekomendasikan context isolation dan sandboxing untuk membatasi akses renderer terhadap Node dan sistem operasi. ([Electron][5])

## Langkah 2 — Inject event collector

Pada setiap halaman dan iframe, pasang recorder script untuk menangkap:

```text
click
dblclick
input
change
submit
keydown
scroll
pointerdown
pointermove
pointerup
dragstart
drop
navigation
new tab
dialog
download
file chooser
```

Event collector tidak langsung menulis kode. Ia mengirim raw event ke recorder worker.

## Langkah 3 — Normalisasi aksi

Buat `ActionReducer`:

```text
keydown + keydown + keydown + change
                    ↓
             satu action fill

puluhan scroll event
                    ↓
             satu action scroll

pointerdown + pointermove + pointerup
                    ↓
             satu action drag
```

Ini mencegah generated code menjadi panjang dan tidak bersih.

## Langkah 4 — Locator scoring

Saat aksi terjadi:

1. Ambil elemen target.
2. Buat beberapa locator candidate.
3. Uji apakah locator unik.
4. Berikan score.
5. Simpan semua candidate ke IR.
6. Pilih default locator tertinggi.

User tetap dapat memilih locator lain melalui step editor.

## Langkah 5 — Tangani iframe dan tab baru

Setiap step menyimpan:

```json
{
  "pageId": "page-main",
  "framePath": [1, 0]
}
```

Playwright mendukung browser context dengan beberapa page dan event untuk halaman baru, sehingga pop-up serta tab baru dapat dikelola oleh recorder. ([Playwright][6])

## Langkah 6 — Rekam assertion secara manual

Jangan otomatis menebak semua assertion.

Sediakan mode:

```text
Assert Visible
Assert Hidden
Assert Text
Assert Value
Assert URL
Assert Element Count
Assert Attribute
```

Playwright Codegen sendiri mendukung pembuatan assertion visibility, text, dan value; pola yang sama dapat diadopsi dalam UI Automate Plus. ([Playwright][7])

## Langkah 7 — Simpan artefak setiap step

Simpan secara opsional:

```text
screenshot
URL
page title
selected locator
DOM fingerprint
browser console errors
network failure
elapsed time
```

Jangan menyimpan seluruh DOM setiap saat karena ukuran penyimpanan akan tumbuh besar. Simpan hanya ketika debugging diaktifkan atau step gagal.

## Langkah 8 — Dukungan Chrome DevTools Recorder

Tambahkan fitur import:

```text
Import Chrome Recorder JSON
Import HAR
Import Playwright script
```

Chrome DevTools Recorder dapat mengekspor JSON, Puppeteer Replay, Puppeteer script, dan format tambahan melalui extension. Karena Recorder penuh hanya tersedia di Chrome, bukan Chromium, jadikan ini fitur interoperabilitas, bukan engine utama Automate Plus. ([Chrome for Developers][8])

---

# 6. Implementasi Android recorder

## Langkah 1 — Device manager

Buat halaman Android Devices yang menjalankan:

```text
adb devices -l
adb get-state
adb shell wm size
adb shell wm density
adb shell dumpsys window
```

Tampilkan:

```text
Serial
Model
Android version
Resolution
Connection: USB / TCP-IP
State
Appium readiness
```

Gunakan lock per serial:

```text
device:RFCT1234 → hanya satu active interaction session
```

Dua runner tidak boleh mengendalikan perangkat yang sama secara bersamaan.

## Langkah 2 — Jalankan Appium lokal

Bundle Appium dan UiAutomator2 driver dalam Android runtime pack.

Alur:

```text
Automate Plus
  → start local Appium server
  → create UiAutomator2 session
  → inspect XML hierarchy
  → send gesture
  → collect screenshot/log
```

UiAutomator2 menyediakan gesture seperti click, long click, drag, fling, pinch, swipe, dan scroll. ([GitHub][9])

## Langkah 3 — Mirror perangkat

Gunakan scrcpy untuk video/mirroring karena bekerja melalui USB atau TCP/IP, tidak memerlukan root, dapat berjalan di Windows, dan beroperasi tanpa internet. ([GitHub][10])

Namun, jangan bergantung pada scrcpy sebagai macro recorder. Pada repositori resminya masih terdapat permintaan fitur terbuka untuk merekam input menjadi macro, sehingga Automate Plus harus menangkap pointer action sendiri. ([GitHub][11])

Arsitektur yang disarankan:

```text
scrcpy video stream
        ↓
Automate Plus Android Viewer
        ↓
mouse/touch event capture
        ↓
coordinate mapping
        ↓
Appium gesture execution
        ↓
Automation IR
```

Untuk versi awal, scrcpy dapat dibuka sebagai jendela terpisah dengan judul unik dan Automate Plus memakai Windows hook untuk mengenali interaksi. Untuk versi produksi, gunakan viewer terintegrasi agar pointer event dapat direkam secara deterministik.

## Langkah 4 — Pemetaan koordinat

Hitung:

```text
desktop viewer coordinate
          ↓
remove letterbox/padding
          ↓
apply device scale
          ↓
apply orientation transform
          ↓
Android physical coordinate
```

Simpan:

```json
{
  "start": { "x": 412, "y": 1260 },
  "end": { "x": 412, "y": 480 },
  "durationMs": 640,
  "orientation": "portrait"
}
```

## Langkah 5 — Resolve elemen dari koordinat

Ketika user melakukan tap:

1. Ambil Appium page source.
2. Parse setiap node dan bounds.
3. Cari node terkecil yang mengandung koordinat tap.
4. Buat locator candidate.
5. Simpan koordinat sebagai fallback.
6. Kirim aksi ke perangkat.

Hasil IR:

```json
{
  "action": "tap",
  "locators": [
    {
      "strategy": "resourceId",
      "value": "com.example:id/login_button",
      "score": 100
    },
    {
      "strategy": "accessibilityId",
      "value": "Masuk",
      "score": 90
    }
  ],
  "fallbackPoint": {
    "x": 520,
    "y": 1730
  }
}
```

## Langkah 6 — Rekam tap, swipe, drag, text, dan system action

Android recorder harus menangkap:

```text
tap
double tap
long press
swipe
scroll
drag
input text
clear text
back
home
enter
volume key
orientation
launch app
terminate app
wait/assert
```

Appium Inspector sendiri dapat merekam tap pada elemen, input text, clear text, generic tap/swipe pada screenshot, system action, dan driver command lalu menerjemahkannya menjadi client code. Dokumentasinya juga menyatakan custom gesture belum didukung recorder, sehingga custom pointer path tetap membutuhkan implementasi Automate Plus sendiri. ([Appium][12])

## Langkah 7 — Batasan touch fisik

Untuk MVP, user harus berinteraksi melalui Android Viewer milik Automate Plus.

Tap langsung pada layar fisik perangkat:

* mungkin terlihat dalam perubahan UI,
* tetapi tidak selalu dapat direkonstruksi sebagai gesture semantic,
* dan tidak dijamin terekam.

Dukungan tap fisik dapat ditambahkan kemudian melalui companion accessibility service atau pembacaan raw input, tetapi jangan menjadikannya bagian dari MVP.

---

# 7. Code generation

## Aturan utama

Setiap generator harus menghasilkan **proyek automation yang benar-benar runnable**, bukan hanya satu file potongan kode.

Contoh output:

```text
generated/
├─ playwright-typescript/
│  ├─ package.json
│  ├─ playwright.config.ts
│  ├─ tsconfig.json
│  ├─ eslint.config.js
│  ├─ tests/
│  ├─ fixtures/
│  └─ test-data/
├─ selenium-python/
│  ├─ pyproject.toml
│  ├─ tests/
│  ├─ pages/
│  └─ conftest.py
└─ appium-kotlin/
   ├─ settings.gradle.kts
   ├─ build.gradle.kts
   └─ src/test/kotlin/
```

## Jangan melakukan string concatenation acak

Gunakan emitter per bahasa:

| Bahasa                | Metode                                        |
| --------------------- | --------------------------------------------- |
| TypeScript/JavaScript | TypeScript AST atau ts-morph                  |
| Java                  | JavaPoet atau JavaParser                      |
| Kotlin                | KotlinPoet                                    |
| Python                | Template typed + formatter dan AST validation |
| Robot Framework       | Structured keyword serializer                 |
| Maestro               | YAML AST serializer                           |

## Struktur generated code

Generated project idealnya mempunyai:

```text
config
fixtures
test data
scenario tests
reusable components
reports
```

Namun, jangan selalu membuat Page Object untuk setiap halaman. Terapkan aturan:

```text
Satu locator dipakai satu kali
→ boleh tetap di scenario file

Locator atau workflow dipakai berulang
→ ekstrak menjadi page/screen component
```

DRY bukan berarti setiap dua baris harus dibuat abstraction.

## Secret handling

Input pada:

```text
password
token
OTP
credit card
secret text field
```

tidak boleh disimpan sebagai plaintext di IR.

Gunakan:

```json
{
  "valueRef": "secret.LOGIN_PASSWORD"
}
```

Nilainya disimpan melalui Windows Credential Manager atau DPAPI.

---

# 8. Runner dan process isolation

Jalankan framework aslinya, bukan satu engine yang berpura-pura menjadi semua framework.

Contoh:

```text
Playwright output → npx playwright test
Cypress output    → cypress run
Selenium Python   → pytest
Selenium Java     → Gradle/Maven test
Robot Framework   → robot tests/
Appium            → framework-specific runner
Espresso          → Gradle connectedAndroidTest
Robolectric       → Gradle test
Maestro           → maestro test
```

Runner harus menyediakan:

```text
Run
Stop
Pause
Step-by-step
Retry failed test
Repeat N times
Run for duration
Parallel workers
Headed/headless
Video
Screenshot
Trace
Console log
Logcat
JUnit XML
HTML report
```

## Isolasi runner

Setiap run:

1. Dibuat pada temporary workspace terpisah.
2. Dijalankan melalui child process, bukan renderer.
3. Mempunyai timeout.
4. Dapat dihentikan beserta seluruh process tree.
5. Tidak dapat menulis ke folder di luar workspace kecuali diizinkan.
6. Mengirim log melalui structured JSON event.
7. Membersihkan Appium session, browser, dan port ketika selesai.

Di Windows, gunakan Job Object atau process-tree controller agar Java, Node, Python, browser, dan ADB child process ikut berhenti ketika user menekan Stop.

---

# 9. Functional looping berbeda dari RPS

Ini bagian yang harus dipisahkan di UI.

## Mode A — Functional Loop

Digunakan untuk:

```text
Repeat test 100 kali
Run selama 30 menit
Cari flaky test
Soak test UI
Memory leak observation
Crash/ANR detection
```

Parameter:

```text
iterations
duration
worker count
delay between iterations
ramp-up
stop on first failure
retry count
```

Metrik:

```text
iterations per second
pass rate
failure rate
p50/p95 test duration
step duration
crash count
ANR count
browser/device resource usage
```

## Mode B — Load/RPS Test

**RPS tidak sebaiknya dihitung dengan mengulang click browser atau tap Android.** Browser-based load test menggunakan instance browser dan mensimulasikan user nyata, sedangkan protocol-based load test mengirim HTTP request langsung dan lebih tepat untuk target request per second. ([k6][13])

Tambahkan k6 sebagai load engine:

```text
Recorded web session
        ↓
HAR / selected network request
        ↓
parameterization
        ↓
k6 script
        ↓
constant-arrival-rate
        ↓
RPS, latency, error rate, throughput
```

k6 menyediakan `constant-arrival-rate`, yaitu model yang memulai iteration pada rate tetap dan menambah virtual user sesuai kebutuhan agar rate tersebut tercapai. ([Grafana Labs][14])

## Untuk Android

Android functional test:

```text
1 device = 1 active UI worker
10 devices = maksimal 10 independent UI workers
```

Untuk menguji backend yang dipanggil aplikasi Android:

* identifikasi API milik aplikasi,
* buat skenario protocol-level,
* jalankan melalui k6,
* jangan mencoba mencapai ratusan RPS dengan mengetuk satu emulator.

Load test hanya boleh diarahkan ke sistem yang dimiliki atau telah memberikan izin pengujian.

---

# 10. Offline runtime packs

Mengatakan aplikasi “offline” tidak cukup hanya dengan membuat Electron installer. Semua dependency yang biasanya di-download harus tersedia secara lokal.

## Pack yang disarankan

| Runtime pack     | Isi                                                                     |
| ---------------- | ----------------------------------------------------------------------- |
| `core-win-x64`   | Desktop app, SQLite, internal Node workers                              |
| `web-node`       | Node runtime, Playwright, Cypress, Puppeteer, WebdriverIO               |
| `web-python`     | Embedded Python, wheelhouse, pytest, Selenium, Playwright Python, Robot |
| `web-java`       | JDK, Gradle/Maven runtime, Selenium Java, Playwright Java               |
| `web-browsers`   | Chromium/Firefox/WebKit atau browser set yang didukung                  |
| `android-base`   | ADB/platform-tools, scrcpy                                              |
| `android-appium` | Appium, UiAutomator2 driver, WebdriverIO, Java Client dependencies      |
| `android-native` | JDK, Gradle, Android SDK platform/build-tools, Espresso, Robolectric    |
| `load-k6`        | k6 executable dan templates                                             |
| `samples`        | Local web fixture dan Android sample app                                |

## Runtime manifest

```json
{
  "packId": "web-node",
  "packVersion": "1.0.0",
  "platform": "windows-x64",
  "artifacts": [
    {
      "id": "playwright",
      "version": "pinned-version",
      "sha256": "..."
    },
    {
      "id": "cypress",
      "version": "pinned-version",
      "sha256": "..."
    }
  ]
}
```

Aturan:

* Tidak menggunakan `latest`.
* Semua versi dikunci.
* Semua file diverifikasi SHA-256.
* Tidak mengunduh runtime saat test dijalankan.
* Update menggunakan signed offline package dari USB atau folder lokal.
* Telemetry dimatikan.
* Browser dan WebDriver dipilih melalui path eksplisit.

Selenium Manager dapat mengelola browser dan driver secara otomatis, tetapi untuk mode offline lebih aman menyediakan driver dan browser yang telah dikunci lalu menentukan path secara eksplisit, sehingga runner tidak mencoba mencari atau mengunduh dependency. ([Selenium][15])

## Lokasi data Windows

```text
C:\ProgramData\AutomatePlus\runtimes\
%LOCALAPPDATA%\AutomatePlus\database\
%LOCALAPPDATA%\AutomatePlus\logs\
%LOCALAPPDATA%\AutomatePlus\cache\
D:\AutomatePlusWorkspace\projects\
D:\AutomatePlusWorkspace\artifacts\
```

Generated source code disimpan sebagai file biasa agar dapat dibuka di VS Code atau IDE lain.

## Batasan offline untuk proyek eksternal

Proyek yang dihasilkan Automate Plus dapat dijamin offline karena dependency-nya dikunci dan disediakan dalam runtime pack.

Proyek Android/Java eksternal yang diimpor hanya dapat dibangun offline bila seluruh dependency Gradle/Maven-nya:

* sudah ada di cache,
* ada di offline repository,
* atau termasuk dalam runtime pack.

Tidak realistis menjamin semua proyek pihak ketiga dapat dibangun offline tanpa semua dependency mereka.

---

# 11. Clean code dan quality gate

## TypeScript / JavaScript

Gunakan:

```text
TypeScript strict mode
ESLint flat config
typescript-eslint typed rules
Prettier
Vitest
dependency-cruiser atau aturan boundary internal
```

Typed linting dari typescript-eslint menggunakan informasi tipe TypeScript untuk mendeteksi masalah yang tidak dapat ditemukan lint biasa. ([TypeScript ESLint][16])

Quality gate:

```text
eslint --max-warnings=0
prettier --check
TypeScript typecheck
unit test
contract test
integration test
```

## Python

Gunakan:

```text
Ruff check
Ruff format
Pyright
pytest
```

Ruff menyediakan linter dan formatter Python dalam satu tool dan dapat dikonfigurasi melalui `pyproject.toml`. ([Astral Docs][17])

## Kotlin

Gunakan:

```text
detekt dengan type resolution
Spotless atau ktlint
JUnit
Gradle test
connectedAndroidTest untuk Espresso
```

Detekt merupakan static analyzer Kotlin dan type resolution memberikan analisis yang lebih akurat terhadap tipe dan simbol. ([Detekt][18])

## Java

Gunakan:

```text
Spotless
google-java-format
Checkstyle
SpotBugs
JUnit 5
Gradle/Maven test
```

## Generated code validation

Pipeline setiap generator:

```text
IR validation
    ↓
Generate source
    ↓
Format source
    ↓
Lint/static analysis
    ↓
Compile/typecheck
    ↓
Run against local fixture
    ↓
Create validation report
```

Kode hanya diberi status **Ready** setelah seluruh tahap lulus.

---

# 12. Best practice sinkronisasi test

Jangan menghasilkan static sleep seperti:

```text
sleep(5000)
Thread.sleep(5000)
time.sleep(5)
```

Gunakan mekanisme framework:

* Playwright: auto-wait dan web-first assertion.
* Selenium: explicit wait; jangan mencampur implicit dan explicit wait.
* Espresso: IdlingResource untuk pekerjaan asynchronous.
* Appium: explicit condition terhadap element state.
* Maestro: built-in wait command.

Playwright menunggu elemen menjadi actionable, Selenium memperingatkan agar implicit dan explicit wait tidak dicampur karena dapat menghasilkan timeout yang tidak dapat diprediksi, dan Espresso menyediakan Idling Resources untuk menyinkronkan background operation dengan UI test. ([Playwright][19])

---

# 13. Step-by-step pembangunan proyek

## Tahap 1 — Definisikan kontrak produk

Buat dokumen:

```text
PRD.md
ARCHITECTURE.md
IR-SCHEMA.md
ADAPTER-SPEC.md
OFFLINE-RUNTIME-SPEC.md
SECURITY.md
```

Tetapkan:

* framework-language matrix,
* daftar action,
* daftar assertion,
* locator strategy,
* format report,
* capability setiap adapter,
* arti offline,
* batasan recorder.

**Selesai ketika:** tidak ada kombinasi framework–bahasa yang ambigu.

## Tahap 2 — Bootstrap monorepo

Bangun:

```text
Electron
React
TypeScript strict
typed IPC
SQLite migration
logging
error boundary
unit-test setup
lint and format scripts
```

Buat satu perintah lokal:

```text
pnpm verify
```

yang menjalankan lint, format check, typecheck, dan test.

**Selesai ketika:** desktop app dapat dibuka, membuat project, dan menyimpan metadata tanpa jaringan.

## Tahap 3 — Implementasikan Automation IR

Bangun:

```text
IR schema
schema validation
schema version
migration
action reducer
locator model
capability model
session repository
```

Buat golden fixture untuk setiap action.

**Selesai ketika:** session dapat disimpan, dibuka, diedit, dan dimigrasikan.

## Tahap 4 — Vertical slice web pertama

Mulai hanya dengan:

```text
Playwright + TypeScript
```

Fitur:

```text
open browser
record click
record fill
record scroll
record navigation
record drag
add assertion
generate Playwright TS
lint
run
display report
```

Playwright adalah pilihan awal terbaik karena memiliki Codegen, locator tooling, auto-wait, trace, multi-browser, dan dukungan TypeScript langsung. ([Playwright][7])

**Selesai ketika:** satu session hasil rekaman dapat di-generate, dilint, dan dijalankan ulang terhadap local fixture.

## Tahap 5 — Tambahkan web adapter

Urutan yang disarankan:

```text
1. Puppeteer TypeScript
2. Selenium TypeScript
3. Cypress TypeScript
4. Selenium Python
5. Playwright Python
6. Selenium Java
7. Playwright Java
8. Robot Framework
```

Untuk setiap adapter wajib ada:

```text
capability manifest
golden generation tests
lint/compile validation
local execution fixture
raw report parser
normalized report mapper
```

**Selesai ketika:** generated project benar-benar menjalankan framework aslinya.

## Tahap 6 — Runtime manager offline

Bangun:

```text
runtime detection
runtime pack import
checksum verification
version lock
path resolver
health check
offline dependency diagnostics
```

Contoh health check:

```text
Node runtime ........ Ready
Playwright browsers . Ready
Python .............. Missing
JDK .................. Ready
ADB .................. Ready
Appium ............... Ready
UiAutomator2 ......... Ready
Android SDK .......... Partial
k6 ................... Ready
```

**Selesai ketika:** aplikasi tidak melakukan network call saat startup, generation, atau execution.

## Tahap 7 — Android device manager

Implementasikan:

```text
ADB discovery
USB/TCP-IP detection
device locking
screen size/orientation
package listing
APK installation
app launch/terminate
logcat
screenshot
```

**Selesai ketika:** perangkat dapat dipilih dan dikontrol dari satu abstraction `DevicePort`.

## Tahap 8 — Vertical slice Android pertama

Mulai dengan:

```text
Appium + TypeScript/WebdriverIO
```

Implementasikan:

```text
Appium server lifecycle
UiAutomator2 session
screenshot viewer
tap
input text
swipe
drag
back
assert visible
generate Appium TS
run
report
```

**Selesai ketika:** user melakukan tap dan swipe melalui viewer, session tersimpan sebagai IR, lalu Appium TS dapat mengulanginya.

## Tahap 9 — Integrasi scrcpy

Tambahkan:

```text
low-latency device mirror
coordinate transformation
orientation handling
pointer path recording
window resize handling
device disconnect recovery
```

scrcpy hanya menangani video/control; step semantic tetap dihasilkan melalui Appium hierarchy.

**Selesai ketika:** koordinat tetap tepat setelah resize, rotation, dan perubahan resolusi.

## Tahap 10 — Android generator tambahan

Urutan:

```text
1. Appium Java
2. Appium Kotlin
3. Appium JavaScript
4. Maestro YAML
5. Espresso Kotlin
6. Espresso Java
7. Robolectric Kotlin
8. Robolectric Java
```

Aturan penting:

* Appium dan Maestro dapat diarahkan ke APK terpasang.
* Espresso memerlukan source project dan instrumented test setup.
* Robolectric memerlukan source project dan berjalan lokal di JVM.
* Menu Run untuk Espresso/Robolectric dinonaktifkan sampai Gradle project valid dipilih.

## Tahap 11 — Functional loop

Tambahkan scheduler:

```text
repeat count
duration
parallel browser worker
per-device worker
ramp-up
delay
stop policy
retry policy
resource limit
```

**Selesai ketika:** browser worker terisolasi dan Android worker tidak saling berebut serial perangkat.

## Tahap 12 — Load/RPS engine

Implementasikan:

```text
HAR capture
request selection
variable extraction
cookie/header sanitization
k6 script generation
constant arrival rate
threshold editor
HTML result
```

Pisahkan menu:

```text
Run Functional Test
Run UI Soak Test
Generate Load Test
Run RPS Test
```

## Tahap 13 — Reporting

Normalisasikan hasil menjadi:

```text
Run
Suite
Test
Step
Status
Duration
Error
Screenshot
Video
Trace
Log
Metric
```

Hasil:

```text
offline HTML report
JUnit XML
JSON raw report
CSV metric export
```

## Tahap 14 — Security hardening

Wajib:

```text
sandboxed Electron renderer
nodeIntegration disabled
contextIsolation enabled
allowlisted IPC
no shell string concatenation
canonical path validation
secret redaction
process timeout
process-tree termination
signed runtime manifest
local-only Appium binding
adb shell allowlist
```

Appium mengategorikan kemampuan menjalankan arbitrary ADB shell sebagai insecure feature. Automate Plus sebaiknya tidak mengaktifkannya secara umum; sediakan command allowlist melalui `DevicePort`. ([Appium][20])

## Tahap 15 — Offline installer

Bangun installer yang:

```text
memasang desktop app
mengimpor runtime packs
memverifikasi checksum
tidak membutuhkan login
tidak membutuhkan cloud
tidak menjalankan auto-update
dapat diperbarui dengan offline package
```

Sediakan dua distribusi:

```text
AutomatePlus-Core-Setup.exe
AutomatePlus-Full-Offline-Bundle.zip
```

Full bundle dapat berukuran besar karena berisi browser, Python, JDK, Android SDK, Appium, Cypress, dan dependency lain. Modular pack mencegah user yang hanya memakai Playwright menginstal seluruh Android stack.

---

# 14. Acceptance criteria wajib

Automate Plus dinyatakan siap ketika:

1. Satu web recording dapat menghasilkan dan menjalankan Playwright TypeScript.
2. Satu Android recording dapat menghasilkan dan menjalankan Appium TypeScript.
3. Click, fill, scroll, tap, swipe, dan drag tersimpan sebagai semantic IR.
4. Invalid framework-language combination tidak dapat dipilih.
5. Generated code lolos formatter, lint, typecheck/compile, dan smoke test.
6. Tidak ada static sleep pada generated code kecuali user menambahkannya secara eksplisit.
7. Password dan token tidak disimpan sebagai plaintext.
8. User dapat menghentikan test tanpa meninggalkan browser, Appium, Java, atau ADB process.
9. Android device mempunyai exclusive lock.
10. Functional loop dan RPS test ditampilkan sebagai dua mode berbeda.
11. RPS menggunakan protocol-level engine seperti k6.
12. Espresso dan Robolectric hanya aktif ketika source Gradle project tersedia.
13. Semua tool utama dapat berjalan tanpa internet setelah runtime pack terpasang.
14. Website target tidak memperoleh akses Node atau file system desktop.
15. Setiap adapter mempunyai capability tests dan golden generated-code tests.
16. Tidak ada dummy runner atau code preview yang tidak dapat dieksekusi.

# Urutan pengembangan paling aman

Fondasi pertama sebaiknya hanya mencakup:

```text
Electron desktop
Automation IR
Playwright TypeScript recorder + runner
Appium TypeScript recorder + runner
SQLite session storage
Monaco step/code editor
HTML report
Functional looping
Offline runtime manager
```

Setelah vertical slice tersebut stabil, tambahkan Puppeteer, Selenium, Cypress, Robot, Maestro, Espresso, dan Robolectric sebagai adapter. Pendekatan ini mempertahankan clean code, menghindari satu codebase generator yang penuh kondisi, dan memastikan setiap fitur yang ditambahkan benar-benar dapat direkam, dihasilkan, dilint, dikompilasi, serta dijalankan secara lokal.

[1]: https://electronjs.org/docs/latest/why-electron?utm_source=chatgpt.com "Why Electron"
[2]: https://playwright.dev/docs/languages?utm_source=chatgpt.com "Supported languages"
[3]: https://appium.io/docs/en/latest/ecosystem/clients/?utm_source=chatgpt.com "Appium Clients - Appium Documentation"
[4]: https://playwright.dev/docs/codegen "Test generator | Playwright"
[5]: https://electronjs.org/docs/latest/api/structures/web-preferences?utm_source=chatgpt.com "WebPreferences Object"
[6]: https://playwright.dev/docs/pages?utm_source=chatgpt.com "Pages"
[7]: https://playwright.dev/docs/codegen?utm_source=chatgpt.com "Test generator"
[8]: https://developer.chrome.com/docs/devtools/recorder?utm_source=chatgpt.com "Record, replay, and measure user flows | Chrome DevTools"
[9]: https://github.com/appium/appium-uiautomator2-driver?utm_source=chatgpt.com "Appium UiAutomator2 Driver"
[10]: https://github.com/genymobile/scrcpy?utm_source=chatgpt.com "Genymobile/scrcpy: Display and control your Android device"
[11]: https://github.com/Genymobile/scrcpy/issues/6575?utm_source=chatgpt.com "Support input recording (of macros) for adb shell input #6575"
[12]: https://appium.github.io/appium-inspector/latest/session-inspector/header/?utm_source=chatgpt.com "Header - Appium Inspector"
[13]: https://k6.io/docs/testing-guides/load-testing-websites?utm_source=chatgpt.com "How to load test a website: A comprehensive guide"
[14]: https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/?utm_source=chatgpt.com "Constant arrival rate | Grafana k6 documentation"
[15]: https://www.selenium.dev/documentation/selenium_manager/?utm_source=chatgpt.com "Selenium Manager (Beta)"
[16]: https://typescript-eslint.io/getting-started/typed-linting?utm_source=chatgpt.com "Linting with Type Information"
[17]: https://docs.astral.sh/ruff/?utm_source=chatgpt.com "Ruff - Astral Docs"
[18]: https://detekt.dev/?utm_source=chatgpt.com "Hello from detekt | detekt"
[19]: https://playwright.dev/?utm_source=chatgpt.com "Playwright: Fast and reliable end-to-end testing for modern ..."
[20]: https://appium.io/docs/en/2.0/guides/security/?utm_source=chatgpt.com "Appium Server Security"
