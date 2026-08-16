Membangun platform automasi *all-in-one* desktop yang berjalan 100% *offline* di Windows dengan dukungan multi-framework, multi-bahasa, serta integrasi perekam Web & Android memerlukan arsitektur modular berbasis **Intermediate Representation (IR)**. Dengan pendekatan ini, satu aksi perekaman dapat diterjemahkan ke framework dan bahasa target apa pun tanpa duplikasi logika (*Don't Repeat Yourself*).

---

## 1. Rekomendasi Tech Stack

| Komponen | Pilihan Teknologi | Alasan Pemilihan |
| --- | --- | --- |
| **Desktop Shell** | **Electron** (Node.js + Chromium) | Akses langsung ke `child_process` untuk eksekusi CLI (ADB, PyTest, Maven, Gradle, Node), integrasi Chrome DevTools Protocol (CDP), serta *zero-dependency runtime* saat dipaketkan. |
| **Frontend UI** | **React / Vue 3 + TypeScript + Tailwind CSS** | Ekosistem komponen UI yang matang (Monaco Editor untuk editor kode, Canvas/WebGL untuk *device stream screen*). |
| **State Management & DI** | **Zustand** + **InversifyJS / TSyringe** | Ringan, terprediksi, dan mendukung *Dependency Injection* untuk implementasi prinsip SOLID. |
| **Android Mirroring & Control** | **Embedded `scrcpy-server.jar` + `adb.exe**` | Latensi rendah untuk *screen mirroring* langsung ke H.264/WebCodecs canvas desktop dan *touch event injection* instan. |
| **Web Recording Core** | **Chrome DevTools Protocol (CDP) & Injected Script** | Menangkap event DOM secara presisi (*click*, *type*, *drag & drop*, *scroll*, *selector engine* multi-strategi: ID, CSS, XPath, Text). |
| **Offline Bundling** | **Portable Runtimes Bundle** (Python Portable, OpenJDK, Node.js binaries) | Semua binary dibundel di dalam direktori aplikasi sehingga tidak membutuhkan koneksi internet atau instalasi manual oleh pengguna. |

---

## 2. Arsitektur Sistem (SOLID & DRY)

```
       ┌───────────────────────────────┐
       │      User Interaction UI      │
       └───────┬───────────────┬───────┘
               │               │
  [Web Recorder Engine]  [Android ADB/Mirror]
               │               │
               ▼               ▼
      ┌─────────────────────────────────┐
      │ Intermediate Representation (IR)│  <-- Single Source of Truth (DRY)
      └────────────────┬────────────────┘
                       │
             [Generator Factory]
                       │
     ┌─────────────────┴─────────────────┐
     ▼                                   ▼
[Web Code Generators]           [Android Code Generators]
- Playwright (Py/TS/JS/Java)    - Appium (Py/Java/TS/JS)
- Cypress (TS/JS)               - Espresso (Kotlin/Java)
- Puppeteer (TS/JS)             - Robolectric (Kotlin/Java)
- Selenium (Py/Java/TS/JS)      - Maestro (YAML/JS)
- Robot Framework (Python)
                       │
                       ▼
      ┌─────────────────────────────────┐
      │   Runner Engine & RPS Looper    │
      └─────────────────────────────────┘

```

### Penerapan Prinsip SOLID

* **Single Responsibility Principle (SRP):** Modul perekam (*Recorder*), penormal aksi (*IR Normalizer*), generator kode (*Code Generator*), dan eksekutor (*Test Runner*) dipisahkan secara ketat.
* **Open/Closed Principle (OCP):** Penambahan framework atau bahasa baru dilakukan hanya dengan mengimplementasikan *interface* `ICodeGenerator` baru dan mendaftarkannya ke `GeneratorFactory` tanpa memodifikasi engine inti.
* **Liskov Substitution Principle (LSP):** Semua generator kode dan runner mengimplementasikan kontrak interface bersama sehingga dapat saling menggantikan.
* **Interface Segregation Principle (ISP):** Kontrak dipisah menjadi `IRecorder`, `ICodeGenerator`, `IDeviceBridge`, dan `IRpsStressRunner`.
* **Dependency Inversion Principle (DIP):** Modul tingkat tinggi (*Session Orchestrator*) bergantung pada abstraksi interface, bukan implementasi langsung (*concrete class*).

---

## 3. Desain Fondasi Kode (Intermediate Representation & Generator)

Berikut adalah cetak biru representasi data perantara (*IR Schema*) dan *interface* generator kode:

```typescript
// types/action-ir.ts
export type ActionType = 'click' | 'type' | 'dragAndDrop' | 'scroll' | 'tap' | 'swipe' | 'assertText';

export interface SelectorStrategy {
  primary: string;
  css?: string;
  xpath?: string;
  id?: string;
  accessibilityId?: string;
  coordinates?: { x: number; y: number };
}

export interface ActionIR {
  id: string;
  timestamp: number;
  platform: 'web' | 'android';
  type: ActionType;
  target: SelectorStrategy;
  payload?: {
    text?: string;
    dragTarget?: SelectorStrategy;
    scrollOffset?: { deltaX: number; deltaY: number };
    durationMs?: number;
  };
}

// interfaces/code-generator.interface.ts
export interface GeneratorOptions {
  indentation?: string;
  headless?: boolean;
  timeoutMs?: number;
}

export interface ICodeGenerator {
  readonly frameworkName: string;
  readonly language: 'python' | 'typescript' | 'javascript' | 'java' | 'kotlin' | 'yaml';
  
  generateSessionHeader(options?: GeneratorOptions): string;
  translateAction(action: ActionIR): string;
  generateSessionFooter(): string;
  compileFullSuite(actions: ActionIR[], options?: GeneratorOptions): string;
}

```

Contoh implementasi konkret generator menggunakan pola *Strategy Pattern*:

```typescript
// generators/web/playwright-python.generator.ts
import { ICodeGenerator, GeneratorOptions } from '../../interfaces/code-generator.interface';
import { ActionIR } from '../../types/action-ir';

export class PlaywrightPythonGenerator implements ICodeGenerator {
  public readonly frameworkName = 'playwright';
  public readonly language = 'python' as const;

  public generateSessionHeader(options?: GeneratorOptions): string {
    return [
      'import pytest',
      'from playwright.sync_api import Page, expect',
      '',
      'def test_automated_session(page: Page):',
    ].join('\n');
  }

  public translateAction(action: ActionIR): string {
    const selector = action.target.css || action.target.xpath || action.target.primary;
    
    switch (action.type) {
      case 'click':
        return `    page.locator("${selector}").click()`;
      case 'type':
        return `    page.locator("${selector}").fill("${action.payload?.text ?? ''}")`;
      case 'dragAndDrop': {
        const targetSel = action.payload?.dragTarget?.css || action.payload?.dragTarget?.primary;
        return `    page.locator("${selector}").drag_to(page.locator("${targetSel}"))`;
      }
      case 'scroll':
        return `    page.mouse.wheel(${action.payload?.scrollOffset?.deltaX ?? 0}, ${action.payload?.scrollOffset?.deltaY ?? 0})`;
      default:
        return `    # Unhandled action: ${action.type}`;
    }
  }

  public generateSessionFooter(): string {
    return '';
  }

  public compileFullSuite(actions: ActionIR[], options?: GeneratorOptions): string {
    const header = this.generateSessionHeader(options);
    const body = actions.map(act => this.translateAction(act)).join('\n');
    const footer = this.generateSessionFooter();
    return `${header}\n${body}\n${footer}`.trim();
  }
}

```

---

## 4. Step-by-Step Implementasi Project

### Langkah 1: Inisialisasi Desktop Shell & Environment

1. Buat project berbasis **Electron + Vite + React + TypeScript**.
2. Konfigurasikan struktur folder modular:
```text
src/
├── main/                 # Electron main process (IPC, Subprocess, ADB)
├── preload/              # Context bridges & safe native APIs
├── renderer/             # React UI (Editor, Runner UI, Device Mirror)
└── core/
    ├── ir/               # Schemas & Normalizers
    ├── generators/       # Web & Android Code Generators
    ├── recorders/        # CDP Web & ADB Android Recorders
    └── runners/          # E2E & High-Performance Looping Runners

```


3. Bundel binary portabel (`adb.exe`, `scrcpy-server`, dan runtime interpreter) ke dalam direktori `resources/bin` agar berjalan secara *standalone offline*.

---

### Langkah 2: Membangun Modul Web Recorder

1. **CDP Injection:** Gunakan `puppeteer-core` atau `playwright-core` dalam mode *connect over CDP* untuk membuka jendela Chromium lokal.
2. **Injected Event Capturing:** Suntikkan script deteksi ke browser untuk menangkap event DOM:
* *Click, Double Click, Context Menu*
* *Input / Change* (dengan mekanisme *debounce*)
* *Dragstart, Dragover, Drop* (merekam elemen sumber dan elemen tujuan)
* *Wheel / Scroll*


3. **Selector Resolution Hierarchy:** Hitung atribut dengan urutan prioritas: `data-testid` $\rightarrow$ `id` $\rightarrow$ `name` $\rightarrow$ Unik CSS Selector $\rightarrow$ XPath.
4. Kirim event yang ternormalisasi ke Electron Main Process melalui WebSocket/CDP Binding untuk diubah menjadi `ActionIR`.

---

### Langkah 3: Membangun Modul Android Recorder & Mirroring

1. **Device Mirroring:**
* Eksekusi `adb forward` dan jalankan `scrcpy-server.jar` via `adb shell app_process`.
* Tangkap stream video H.264 melalui TCP socket lokal, lalu dekode di UI menggunakan `WebCodecs API` / HTML5 Canvas.


2. **Input Injection & User Action Capture:**
* Tangkap interaksi mouse pada Canvas UI desktop:
* *Mouse Down + Up* di titik yang sama $\rightarrow$ Kirim `adb shell input tap X Y`.
* *Mouse Down + Drag + Up* $\rightarrow$ Kirim `adb shell input swipe X1 Y1 X2 Y2 [duration]`.




3. **UI Hierarchy Inspection:**
* Jalankan `adb exec-out uiautomator dump /dev/tty` di latar belakang secara asinkron atau saat aksi dilepaskan (*mouse up*).
* Petakan koordinat $(X, Y)$ ke node XML untuk mengekstrak `resource-id`, `content-desc`, `class`, dan `bounds`.


4. Ubah aksi menjadi format `ActionIR` platform Android.

---

### Langkah 4: Implementasi Multi-Framework Code Generator Registry

1. Bangun kelas `GeneratorRegistry` (memenuhi OCP & Factory Pattern).
2. Daftarkan generator untuk **Web**:
* *Playwright* (Python, TypeScript, JavaScript, Java)
* *Cypress* (TypeScript, JavaScript)
* *Puppeteer* (TypeScript, JavaScript)
* *Selenium WebDriver* (Python, Java, TypeScript, JavaScript)
* *Robot Framework* (Python / Keyword format)


3. Daftarkan generator untuk **Android**:
* *Appium* (Python, Java, TypeScript, JavaScript)
* *Espresso* (Kotlin, Java)
* *Robolectric* (Kotlin, Java)
* *Maestro* (YAML)



---

### Langkah 5: Eksekusi E2E & High-Performance Looping (RPS / Stress Test)

1. **E2E Execution Engine:**
* Eksekutor membuat *temporary working directory*, menulis kode yang dihasilkan, dan memanggil binary lokal yang sesuai (misalnya `pytest`, `mvn test`, `npx playwright test`, `maestro test`).
* Alirkan *standard output* (stdout/stderr) secara *real-time* ke terminal UI desktop via IPC.


2. **Looping & RPS Stress Engine:**
* Untuk pengujian beban (*load / RPS test*), gunakan arsitektur *Worker Thread Pool* (Node.js `worker_threads` atau *child processes pool*).
* Buat scheduler berbasis *Token Bucket* atau *Fixed Rate Loop* untuk mengirimkan aksi secara paralel sesuai target RPS.
* Kumpulkan metrik performa: Total Requests, Success/Failure Rate, Latency ($P_{50}$, $P_{95}$, $P_{99}$), dan Throughput aktual.



---

### Langkah 6: Quality Assurance, Linting, dan Standarisasi Kode

1. **Linting & Formatting:** Terapkan **ESLint** (dengan aturan `@typescript-eslint/recommended`, `eslint-plugin-sonarjs`), **Prettier**, dan validasi arsitektural menggunakan modul pelindung boundary (misal: `eslint-plugin-import`).
2. **Unit & Integration Test:** Gunakan **Vitest** untuk menguji setiap *Code Generator* secara terisolasi (memastikan setiap `ActionIR` menghasilkan string sintaksis yang 100% valid pada setiap framework).
3. **Packaging Windows Offline:** Gunakan **Electron-Builder** dengan target `nsis` (installer portabel) dan masukkan direktori `resources` berisi seluruh runtime dependensi agar siap dijalankan di sistem Windows tanpa akses internet.

---




# Rekomendasi Stack & Step-by-Step Membangun Aplikasi "Automate Plus"

Berdasarkan permintaan Anda, berikut adalah rekomendasi arsitektur, stack teknologi, dan panduan langkah demi langkah untuk membangun aplikasi desktop **Automate Plus** yang berjalan offline di Windows. Aplikasi ini menggabungkan perekaman aksi (record) untuk Web dan Android, serta eksekusi dan pembuatan kode otomatisasi.

---

## 1. Rekomendasi Stack Teknologi (Technology Stack)

Untuk memenuhi kebutuhan offline, dukungan multi-framework, dan kode yang bersih, saya merekomendasikan arsitektur berbasis **Electron** (untuk UI desktop) dengan **Node.js** sebagai backend utama, serta **Python** sebagai mesin eksekusi untuk framework tertentu.

### 1.1. UI Desktop & Backend Utama
- **Framework:** **Electron.js**
    - **Alasan:** Memungkinkan pembangunan aplikasi desktop cross-platform (fokus Windows) menggunakan HTML, CSS, dan JavaScript. Sangat cocok untuk kebutuhan "offline" dan memiliki akses penuh ke sistem file serta child process untuk menjalankan perintah eksekusi.
- **Bahasa Utama:** **TypeScript**
    - **Alasan:** Wajib untuk kode yang bersih (clean code) dan lolos lint. TypeScript memberikan type safety yang sangat membantu implementasi SOLID dan mengurangi bug .
- **State Management:** **Redux Toolkit** atau **Zustand**
    - **Alasan:** Mengelola state aplikasi yang kompleks (konfigurasi framework, kode yang dihasilkan, status eksekusi) secara terstruktur dan terprediksi.

### 1.2. Web Automation Engine (Mesin Otomatisasi Web)
Karena aplikasi harus bisa "merekam" aksi menjadi kode, Anda membutuhkan **middleware** yang menangkap event DOM dan mengubahnya menjadi kode.

- **Recorder (Penangkap Aksi):** **Playwright `codegen`** atau **Puppeteer Recorder**.
    - **Playwright Codegen** adalah alat bawaan yang sangat baik untuk merekam klik, scroll, dan input, lalu mengeluarkannya dalam berbagai bahasa (TypeScript, JS, Python, Java, C#) .
    - **Catatan Penting (Best Practice):** Hasil rekaman mentah (raw) biasanya rapuh (brittle) karena menggunakan selector yang panjang . Aplikasi Anda harus memiliki fitur **"Cleaner"** yang mengubah selector tersebut menjadi selector yang lebih stabil (misal: `getByRole`, `getByText`) sebelum disimpan.
- **Execution Engine:**
    - Untuk **Node.js** (Playwright, Puppeteer, Cypress): Eksekusi langsung menggunakan `child_process` atau API bawaan framework.
    - Untuk **Java** & **Python** (Selenium, Robot Framework): Aplikasi perlu **memanggil script eksternal** atau menjalankan runtime (JVM untuk Java, Python Interpreter untuk Python) melalui terminal.
    - **Rekomendasi Arsitektur:** Buat **"Command Factory"** yang menerjemahkan aksi rekaman (misal: `{ action: 'click', selector: '#btn' }`) menjadi kode spesifik framework menggunakan **Template Method Pattern** (bagian dari SOLID).

### 1.3. Mobile Automation Engine (Android)
- **ADB (Android Debug Bridge):** Digunakan untuk menangkap event layar Android secara real-time .
- **Appium:** Digunakan sebagai server dan library untuk eksekusi serta pembuatan kode .
- **Maestro:** Opsi bagus untuk pembuatan kode dengan syntax YAML yang lebih sederhana .
- **Integrasi:** Sama seperti Web, rekaman aksi Android (tap, swipe) perlu diubah menjadi kode untuk Espresso (Java/Kotlin), Appium (Java/Python/JS), atau Maestro (YAML).

### 1.4. Database & File System
- **SQLite:** Untuk menyimpan project, sesi rekaman, dan konfigurasi secara lokal/offline.
- **File System:** Menyimpan file kode yang dihasilkan (`.spec.ts`, `.java`, `.robot`, dll.) di folder project.

---

## 2. Step-by-Step Pembuatan Aplikasi (Implementasi)

### Fase 1: Fondasi & Arsitektur (Minggu 1-2)
1.  **Inisialisasi Project:**
    - Setup project Electron + TypeScript.
    - Konfigurasi ESLint dan Prettier untuk memastikan kode lolos uji lint.
    - Setup struktur folder berdasarkan **Clean Architecture** (Domain, Use Case, Infrastructure, UI) untuk mematuhi SOLID dan DRY.
2.  **Integrasi Runtime:**
    - Deteksi dan kelola path instalasi **Node.js**, **Python**, dan **Java (JRE/JDK)** di sistem Windows user. Buat service untuk menjalankan perintah terminal.

### Fase 2: Web Recorder & Code Generation (Minggu 3-4)
3.  **Membangun "Recorder Web":**
    - Integrasikan Playwright Codegen ke dalam aplikasi. Saat user mengklik "Record", jalankan `npx playwright codegen` di background.
    - **Optimasi:** Alih-alih hanya menampilkan kode mentah, aplikasi harus menangkap event dan memetakannya ke struktur data internal (misal: `StepModel`).
4.  **Fitur "Drag n Drop" & Click:**
    - Pastikan recorder menangkap event `mousedown`, `mousemove`, `mouseup` sebagai satu kesatuan "Drag and Drop".
5.  **Code Generator Engine:**
    - Buat **Strategy Pattern** untuk setiap framework (Cypress, Playwright, Selenium, Robot).
    - **Logika:** Input: `StepModel[]` + `selectedLanguage` + `selectedFramework` → Output: Kode String.
    - Terapkan prinsip **DRY (Don't Repeat Yourself)**: Buat core mapping untuk selector, dan biarkan masing-masing strategy hanya menangani syntax spesifik framework.
    - Contoh:
      - Playwright + TS: `await page.getByRole('button', { name: 'Submit' }).click();`
      - Selenium + Python: `driver.find_element(By.ID, "submit").click()`

### Fase 3: Web Execution & Looping (Minggu 5)
6.  **Test Runner:**
    - Buat modul yang bisa menjalankan kode yang telah dibuat.
    - Untuk eksekusi **Looping/RPS (Request Per Second)**: Bungkus panggilan eksekusi dalam loop (misal: `for i in range(10)` untuk eksekusi 10 kali) dan hitung waktu eksekusi menggunakan `performance.now()`.
    - Tampilkan log secara real-time di UI.

### Fase 4: Android Recorder & Execution (Minggu 6-7)
7.  **ADB Integration:**
    - Gunakan library Node.js (`adbkit`) untuk berkomunikasi dengan perangkat Android.
    - **Fitur Recorder:** Gunakan `adb shell getevent` atau `uiautomator` untuk mendeteksi tap dan swipe di layar. Konversi koordinat layar menjadi elemen UI (jika memungkinkan) atau koordinat relatif.
8.  **Code Generation Android:**
    - Implementasikan generator untuk **Espresso** (Kotlin/Java), **Appium** (Python/JS), dan **Maestro** (YAML) .
    - Untuk Appium: rekam aksi sebagai `MobileBy` atau `UiSelector`.

### Fase 5: UI/UX & Polishing (Minggu 8)
9.  **UI Dashboard:**
    - Layout sidebar (Project Explorer), area kode (Monaco Editor), dan log console.
10. **Quality Assurance (Best Practice):**
    - Terapkan **SOLID Principles**: Pisahkan tanggung jawab (SRP) antara Recorder, Generator, dan Executor.
    - **DRY**: Buat base class untuk semua "Generator" yang berisi logika parsing selector yang sama.
    - **Linting**: Jalankan `eslint` pada setiap build.

---

## 3. Best Practice & Tips Kritis

1.  **Jangan Percaya Sepenuhnya pada Hasil Rekaman Mentah (Raw Recorder)**:
    Hasil rekaman langsung dari Playwright Codegen seringkali rapuh dan sulit di-maintain jika UI berubah . **Wajib** untuk menambahkan fitur **"Clean Locators"** di aplikasi Anda yang secara otomatis mengganti selector XPath panjang dengan `getByRole` atau `data-testid` .
2.  **Arsitektur "Recorder"**:
    Jangan simpan hasil rekaman sebagai teks kode. Simpan sebagai **"Command-Target-Value" (CTV)** . Ini adalah format intermediate (data mentah aksi user) yang kemudian di-"render" menjadi berbagai bahasa dan framework. Ini adalah implementasi terbaik dari prinsip **DRY**.
    ```json
    // Contoh CTV
    { "command": "click", "target": "id=login-btn", "value": "" }
    { "command": "type", "target": "css=.username", "value": "admin" }
    ```
3.  **Offline Execution**:
    Pastikan semua dependency (Node_modules, Python packages, Java JARs) di-bundle atau di-download saat instalasi pertama, sehingga user tidak perlu koneksi internet saat menjalankan tes.
4.  **Logging & Debugging**:
    Sediakan fitur screenshot otomatis saat tes gagal (sesuai praktik terbaik di ) dan export log yang jelas untuk memudahkan debugging.

Dengan stack dan langkah-langkah di atas, Anda akan memiliki fondasi aplikasi yang kuat, mudah dipelihara, dan memenuhi semua kebutuhan fitur yang Anda sebutkan.