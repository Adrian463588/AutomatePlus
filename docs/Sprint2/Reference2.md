Untuk Automate Plus Sprint 2, saya menyarankan tidak mengganti arsitektur Sprint 1. Baseline Anda sudah tepat: WinUI 3 + .NET 8 sebagai host/orchestrator, Node.js/TypeScript sidecar untuk IR/selector/generator, SQLite, ADB/Appium/scrcpy sebagai local runtime, serta NDJSON IPC.

Sprint 2 cukup menambahkan satu vertical slice baru:

Local Android Device Farm = Device Pool → Device Locks → Scheduler → N Device Workers → Per-device Evidence

Bukan membuat service/device-farm terdistribusi seperti AWS Device Farm.

1. Target Sprint 2

Dua fitur utamanya saya definisikan seperti ini:

Fitur A — Multi-device repeated replay

AutomationSession │ ▼ FarmRun │ ┌────────────────┼─────────────────┐ ▼ ▼ ▼ Samsung S24 Pixel 9 Xiaomi 15 │ │ │ Worker #1 Worker #2 Worker #3 │ │ │ iteration 1 iteration 1 iteration 1 iteration 2 iteration 2 iteration 2 ... iteration N iteration N iteration N

Satu session dapat dijalankan:

3 devices × 20 iterations = 60 device iterations

tetapi setiap device tetap memiliki 1 exclusive worker.

Ini konsisten dengan DESIGN Anda yang saat ini sudah menetapkan satu worker per locked serial pada Android.

Fitur B — Multi-device recording

Jangan membuat:

GalaxyS24-session.json Pixel9-session.json Xiaomi-session.json

Gunakan:

Primary device │ ▼ Record intent │ ▼ Canonical ActionIR │ ┌────┴─────────────────────┐ ▼ ▼ resolve on Pixel resolve on Xiaomi │ │ DeviceObservation DeviceObservation

Artinya:

Record once → semantic IR → validate/replay across selected devices.

Ini mempertahankan aturan existing project bahwa AutomationSession dan ActionIR adalah source of truth, sedangkan generated code hanya projection.

2. Stack Sprint 2 yang saya rekomendasikan

LayerStackDesktop UIWinUI 3Host/orchestration.NET 8 / C#ArchitectureMVVM + Clean ArchitectureDevice discoveryAndroid Platform Tools / ADBDevice IDADB serial / transport IDAndroid E2EAppium + UiAutomator2Device screen/controlscrcpySemantic hierarchyUiAutomator2 + Appium page sourceIPCExisting versioned NDJSONIRExisting Automation IRDevice inventorySQLiteMulti-device schedulerC#/.NETConcurrencyTask, Channel<T>, SemaphoreSlim, CancellationTokenPort allocation.NET PortLeaseManagerRuntime isolationExisting ProcessRunnerGenerated AppiumTS/JS/Java/KotlinOptional laterMaestro / EspressoReportingExisting normalized report modelRuntime distributionOffline verified packsTests .NETxUnitMockingNSubstitute/Fake implementationsTS qualityESLint + TypeScript + Vitest.NET qualitydotnet format + build + test

Saya tidak menyarankan Docker/Kubernetes/Redis/RabbitMQ/PostgreSQL untuk Sprint 2.

Semua perangkat terhubung ke satu desktop Windows. Membawa stack distributed-device-farm sekarang akan melanggar KISS + YAGNI.

3. Arsitektur Sprint 2

Tambahkan layer berikut ke DESIGN:

┌─────────────────────────────────────────────────────────────┐ │ WinUI 3 │ │ │ │ Devices | Device Groups | Recorder | Farm Runs | Reports │ └────────────────────────────┬────────────────────────────────┘ │ ▼ ┌─────────────────────────────────────────────────────────────┐ │ .NET HOST │ │ │ │ DeviceRegistry │ │ DeviceHealthService │ │ DeviceGroupService │ │ DeviceLockManager │ │ PortLeaseManager │ │ DeviceFarmCoordinator │ │ FarmRunScheduler │ │ DeviceSessionFactory │ │ DeviceWorker │ │ ArtifactAggregator │ └───────────────┬───────────────────────┬─────────────────────┘ │ │ ADB/Appium NDJSON │ │ │ ▼ │ TypeScript Sidecar │ ├─ IR │ ├─ selector │ └─ generators │ ┌────────┼──────────────┐ ▼ ▼ ▼ Device A Device B Device C │ │ │ scrcpy scrcpy scrcpy │ │ │ UIA2 UIA2 UIA2

Yang penting:

Device Farm adalah orchestration concern milik .NET Host.

Jangan pindahkan ke sidecar TypeScript karena DESIGN Anda sudah menyatakan discovery, lock, process execution, cancellation, serta runtime ownership berada di .NET host.

4. Tambahkan DeviceRegistry

Saat aplikasi start atau user menekan Refresh:

adb devices -l │ ▼ DeviceDiscovery │ ▼ DeviceRegistry

Simpan model seperti:

DeviceProfile ├── id ├── adbSerial ├── model ├── manufacturer ├── sdkLevel ├── androidVersion ├── resolution ├── density ├── orientation ├── transport ├── state └── lastSeen

Android mendukung ADB ke physical device, termasuk wireless debugging pada Android modern, dan dapat melakukan deployment/debugging ke beberapa remote devices. (Android Developers)

Untuk Sprint 2 saya akan memprioritaskan:

USB device farm terlebih dahulu, wireless ADB tetap didukung melalui abstraction yang sama.

Buat interface:

public interface IDeviceDiscovery { Task<IReadOnlyList<DeviceProfile>> DiscoverAsync( CancellationToken cancellationToken); }

Jangan biarkan UI memanggil ADB langsung.

5. Tambahkan DeviceGroup

User dapat memilih:

Android Farm — Regression Phones ☑ Samsung Galaxy S24 ☑ Pixel 9 ☑ Xiaomi 15 ☐ Galaxy Watch ☑ Samsung A55

Database:

device_groups device_group_members device_profiles

Contoh model:

DeviceGroup ├── id ├── name ├── selectedDevices[] ├── primaryRecorderDevice └── createdAt

Jangan menjadikan group sebagai static hardware configuration yang kompleks.

Cukup:

group → list of device references

KISS.

6. Device locking wajib

Existing DESIGN Anda sudah mensyaratkan:

satu Android serial hanya boleh mempunyai satu active interaction/run.

Pertahankan rule itu.

Device A ── Run #123 LOCKED Device B ── Run #123 LOCKED Device C ── Recorder LOCKED Device D AVAILABLE

Buat:

IDeviceLockManager AcquireAsync(serial) ReleaseAsync(serial) IsLocked(serial)

Jangan gunakan:

bool IsDeviceBusy

tanpa atomic locking karena race condition akan muncul ketika dua run dimulai hampir bersamaan.

Gunakan per-device semaphore/lease:

Dictionary<DeviceSerial, SemaphoreSlim>

atau abstraction equivalent.

7. Tambahkan PortLeaseManager

Ini sangat penting untuk parallel Appium.

UiAutomator2 secara resmi mendukung parallel sessions dan menyatakan beberapa port harus unik untuk setiap session Android:

udid

systemPort

chromedriverPort jika menggunakan Chrome/WebView

mjpegServerPort jika menggunakan MJPEG/video. (GitHub)

Jadi:

Galaxy S24 udid R58... systemPort A chromedriverPort B mjpegPort C Pixel 9 udid ABC... systemPort D chromedriverPort E mjpegPort F

Jangan:

systemPort = 8200

untuk semua device.

Buat:

PortLeaseManager ├── AcquireSystemPort() ├── AcquireChromedriverPort() ├── AcquireMjpegPort() └── Release(runId)

Dan port lease harus ikut cleanup ketika:

Passed Failed Cancelled DeviceDisconnected ProcessCrashed ApplicationShutdown

UiAutomator2 juga secara eksplisit menyebut single Appium server dengan multiple sessions sebagai model yang lebih hemat resource dan lebih mudah dikontrol dibanding membuat proses server terpisah untuk setiap session. (GitHub)

Jadi default saya:

1 Appium Server │ ┌────┼────┬────┐ ▼ ▼ ▼ ▼ S1 S2 S3 S4 │ │ │ │ D1 D2 D3 D4

8. Buat FarmRunScheduler

Ini merupakan core Sprint 2.

Input:

FarmRunSpec ├── sessionId ├── deviceGroupId ├── iterationsPerDevice ├── maxParallelDevices ├── iterationDelay ├── failurePolicy └── statePolicy

Contoh:

Devices 5 Iterations/device 20 Maximum parallel 4 Delay 1000 ms Failure policy Continue other devices

Scheduler:

FarmRun │ maxParallel = 3 │ ┌─────────────────┼─────────────────┐ ▼ ▼ ▼ Worker A Worker B Worker C │ │ │ Samsung S24 Pixel 9 A55 │ │ │ iteration 1 iteration 1 iteration 1 iteration 2 iteration 2 iteration 2 ...

Gunakan:

SemaphoreSlim + Task + Channel<T> + CancellationToken

Tidak perlu message broker.

9. DeviceWorker

Satu worker harus terikat ke:

1 run + 1 serial + 1 Appium session + 1 port lease

Lifecycle:

Queued ↓ AcquireDevice ↓ Preflight ↓ AllocatePorts ↓ CreateAppiumSession ↓ PrepareApp ↓ Run iteration ↓ Collect evidence ↓ repeat ↓ Close session ↓ Release ports ↓ Release device

Jangan reuse state lintas device.

10. Preflight setiap device

Sebelum menjalankan farm:

DevicePreflight

periksa minimal:

ADB state device authorized yes API level compatible screen size available orientation available target package available Appium runtime ready UiAutomator2 ready port allocation ready device lock acquired free storage sufficient

Jika:

Device 1 READY Device 2 READY Device 3 UNAUTHORIZED Device 4 READY

Device 3:

BLOCKED

bukan fake PASSED.

Ini juga sesuai error semantics current DESIGN.

11. Repeated replay

Implementasi jangan menjadi:

for (i = 0; i < 100; i++) RunTest();

di UI.

Gunakan domain:

FarmRun │ ├── DeviceRun Samsung │ ├── iteration 1 │ ├── iteration 2 │ └── iteration 3 │ ├── DeviceRun Pixel │ ├── iteration 1 │ ├── iteration 2 │ └── iteration 3 │ └── DeviceRun Xiaomi ├── iteration 1 ├── iteration 2 └── iteration 3

Simpan setiap result secara independen.

12. Database Sprint 2

Tambahkan minimal:

devices device_groups device_group_members farm_runs device_runs device_iterations device_observations

Relasi:

AutomationSession │ ▼ FarmRun │ ┌────┴────────┐ ▼ ▼ DeviceRun DeviceRun │ │ ▼ ▼ Iterations Iterations

Contoh device_runs:

id farm_run_id device_id serial_snapshot status started_at finished_at summary_json

Saya sengaja menyebut:

serial_snapshot

bukan memasukkan serial ke canonical automation source.

13. Recording multiple devices

Untuk Sprint 2 saya membuat dua mode.

Mode 1 — Primary Record

Default dan recommended.

Selected devices: ● Samsung S24 PRIMARY ○ Pixel 9 ○ Xiaomi 15 ○ A55

User berinteraksi dengan Samsung.

Tap Login ↓ Hierarchy Samsung ↓ resource-id=com.foo:id/login ↓ ActionIR

Kemudian AutomatePlus mengecek selector tersebut terhadap:

Pixel Xiaomi A55

UI Automator memang dirancang untuk menemukan dan berinteraksi dengan elemen aplikasi/system UI, sehingga semantic hierarchy merupakan sumber yang tepat untuk validation lintas device. (Android Developers)

14. Mode 2 — Synchronized Record

Tambahkan setelah Primary Record stabil.

User menekan Login pada primary:

Samsung │ │ Tap Login ▼ Resolve semantic element │ ▼ ActionIR │ ├──────── Pixel │ │ │ resolve │ ▼ │ Tap │ ├──────── Xiaomi │ │ │ resolve │ ▼ │ Tap │ └──────── A55 │ resolve ▼ Tap

Jangan broadcast coordinate.

Misalnya:

Samsung 1440 × 3120 Pixel 1344 × 2992 Xiaomi 1220 × 2712

maka:

tap(612, 1940)

tidak boleh langsung dikirim ke semua perangkat.

Gunakan:

resourceId accessibilityId text class bounds fallback

Existing DESIGN Anda memang sudah memprioritaskan semantic hierarchy dan hanya menyimpan coordinate/bounds sebagai fallback.

15. Tambahkan DeviceObservation

Jangan merusak canonical ActionIR dengan data Samsung/Pixel.

Buat data terpisah:

DeviceObservation ├── actionId ├── deviceId ├── resolvedLocator ├── matched ├── matchCount ├── fallbackUsed ├── screenshot ├── hierarchyHash ├── duration └── status

Contoh:

Action: TAP LOGIN Samsung ✓ resource-id confidence 1.00 Pixel ✓ resource-id confidence 1.00 Xiaomi ✓ text confidence 0.78 A55 ✗ not found

UI:

Compatibility Samsung S24 ✓ Pixel 9 ✓ Xiaomi 15 ⚠ fallback Samsung A55 ✗ needs review

Ini fitur yang sangat bernilai untuk device-farm testing.

16. Jangan silent fallback

Jika:

resource-id

tidak ditemukan pada Device B:

jangan otomatis melakukan:

tap normalized-coordinate

dan menganggap test sukses.

Gunakan:

SEMANTIC_SELECTOR_MISSING

atau:

DEVICE_VARIANT_MISMATCH

Status:

Needs Review

Ini jauh lebih aman dan sesuai prinsip existing project yang melarang silent fallback.

17. Multi-device screen

Saya tidak menyarankan menjalankan full-quality scrcpy viewer untuk 20 device sekaligus pada Sprint 2.

Gunakan UI:

┌──────────────┬──────────────┬──────────────┐ │ Samsung S24 │ Pixel 9 │ Xiaomi 15 │ │ │ │ │ │ snapshot │ snapshot │ snapshot │ │ READY │ RUNNING │ RUNNING │ └──────────────┴──────────────┴──────────────┘ ACTIVE DEVICE ┌─────────────────────────────────────────────┐ │ │ │ Live scrcpy │ │ │ └─────────────────────────────────────────────┘

Primary device = live full mirror.

Secondary devices:

periodic thumbnail + status + last screenshot

Jika user memilih Device B:

Device B → full live mirror

scrcpy memang dirancang untuk mirror dan control Android melalui USB atau TCP/IP dan berjalan pada Windows. (GitHub)

Ini jauh lebih KISS dan hemat resource.

18. Code generation multi-device

Ini juga penting:

jangan generate satu source project per device.

Salah:

appium-samsung/ appium-pixel/ appium-xiaomi/ appium-a55/

Benar:

appium-typescript/ ├── tests/ │ └── login.spec.ts ├── config/ │ └── runtime.ts ├── package.json └── automate-plus.generated.json

Device adalah runtime configuration:

Generated test + DeviceRunConfiguration ↓ Appium session

Misalnya secara konseptual:

AUTOMATEPLUS_DEVICE_SERIAL AUTOMATEPLUS_SYSTEM_PORT AUTOMATEPLUS_CHROMEDRIVER_PORT AUTOMATEPLUS_MJPEG_PORT

Jangan hard-code:

udid: "R58M12345"

ke source test.

19. Framework priority Sprint 2

Saya akan mengimplementasikan urutannya:

P0 — Appium + UiAutomator2

Wajib.

Karena UiAutomator2 secara resmi mendukung multiple parallel Android sessions dan real devices dengan udid serta unique port configuration. (GitHub)

P1 — Maestro

Gunakan scheduler yang sama:

DeviceWorker ↓ MaestroRunnerAdapter

P1 — Espresso

Tetap:

one generated instrumentation suite + selected device at execution

Android Test Orchestrator juga tersedia untuk memberi isolasi per instrumentation test; setiap test dapat dijalankan di instance instrumentation sendiri. (Android Developers)

Bukan device-farm target

Robolectric

Karena Robolectric adalah local JVM testing; tidak masuk phone-farm scheduler.

20. Offline architecture

Pertahankan runtime packs:

runtime-packs/ ├── android-platform-tools/ ├── scrcpy/ ├── node/ ├── appium/ ├── uiautomator2/ ├── maestro/ └── jdk/

Existing DESIGN Anda sudah mengharuskan runtime packs lokal, checksum-verified, dan tidak melakukan dependency installation pada waktu test.

Sprint 2 juga harus tetap:

NO: npm install ketika run appium driver install ketika run GitHub download cloud dashboard cloud device farm telemetry login remote database

Semua dependency harus masuk:

Verified Runtime Pack

sebelum Ready.

21. Quality gates Sprint 2

Pertahankan gate dari AGENTS Anda:

dotnet format AutomatePlus.sln --verify-no-changes dotnet build AutomatePlus.sln --no-restore dotnet test AutomatePlus.sln --no-restore

dan:

npm ci --offline npm run lint npm run typecheck npm test

Generated project juga harus melalui formatter → lint → compile/typecheck → local smoke validation.

Tambahkan test khusus device farm.

Unit tests

DeviceRegistryTests DeviceLockManagerTests DeviceGroupTests PortLeaseManagerTests FarmRunSchedulerTests DeviceWorkerTests DeviceObservationTests CoordinateTransformTests

Race-condition tests

Two runs request same serial → exactly one wins Two sessions request same systemPort → never collide Device disconnect during test → lock released Cancel farm → all owned sessions terminated

Integration tests

Minimal gunakan 2 physical Android devices.

Device A + Device B record → generate → run → 10 iterations → separate evidence

Mock/fake ADB bagus untuk development, tetapi tidak boleh dianggap production acceptance evidence—ini juga sesuai prinsip traceability PRD Anda.

22. SOLID / DRY / KISS / YAGNI rules

Saya akan menetapkan rule keras:

DeviceRegistry ≠ Scheduler Scheduler ≠ Appium Appium ≠ Recorder Recorder ≠ Generator Generator ≠ Runner DeviceWorker ≠ Device FarmRun ≠ Session IR DeviceObservation ≠ ActionIR Device serial ≠ Generated source Device-specific evidence ≠ Canonical test

Dan dilarang membuat:

if (device.Manufacturer == "Samsung") { ... } else if (device.Manufacturer == "Xiaomi") { ... }

Gunakan capability/evidence.

Juga hindari:

Distributed node controller Redis Kafka gRPC cluster Kubernetes Device farm web server Remote database

sampai memang ada requirement:

phone farm berjalan di banyak PC.

Untuk Sprint 2 satu Windows host, itu over-engineering.

23. Sprint 2 step-by-step implementasi

Urutan pengerjaan terbaik menurut saya:

Step 1 — Device Registry

ADB discovery device metadata health state SQLite persistence

Step 2 — Device Group

select N devices save group primary recorder selection

Step 3 — Lock Manager

exclusive per serial disconnect cleanup cancellation cleanup

Step 4 — Port Lease Manager

systemPort chromedriverPort mjpegServerPort

Step 5 — Device Session Factory

device + port leases + capabilities → Appium session

Step 6 — DeviceWorker

one device one Appium session N iterations

Step 7 — FarmRunScheduler

DeviceGroup + Session + RunOptions → N parallel workers

Step 8 — Farm Reports

Farm ├─ Device │ ├─ iteration │ └─ step └─ aggregated results

Step 9 — Primary Multi-device Recorder

Primary viewer → semantic ActionIR → validate secondary devices

Step 10 — DeviceObservation

selector compatibility screenshots hierarchy evidence

Step 11 — Synchronized Record

primary semantic event → resolve per device → execute only if confidently resolved

Step 12 — Multi-device UI

device grid active mirror statuses farm run controls

Step 13 — Hardening

disconnect cancel Appium crash ADB restart port conflict device offline screen rotation app crash

Step 14 — 2+ physical-device acceptance

Baru Sprint 2 dianggap selesai.

24. Definition of Done Sprint 2

Saya akan menetapkan DoD berikut:

✓ 2+ Android physical devices ditemukan lewat ADB. ✓ User dapat membuat Device Group. ✓ Satu serial tidak pernah mempunyai dua active workers. ✓ Satu session dapat dijalankan serentak pada ≥2 device. ✓ Tiap device dapat menjalankan N iterations. ✓ Appium ports tidak collision. ✓ Device failure tidak otomatis menggagalkan worker device lain. ✓ Cancel menghentikan seluruh owned Appium/session/process. ✓ Per-device screenshots/log/report tersedia. ✓ User dapat memilih Primary Recorder. ✓ Satu recording menghasilkan canonical IR. ✓ Selector divalidasi pada selected secondary devices. ✓ Device-specific observations tidak mengubah canonical IR. ✓ Satu generated project dipakai untuk seluruh selected devices. ✓ Serial/port tidak di-hardcode ke generated source. ✓ Semua source lolos format/lint/typecheck/build/test. ✓ Semua execution tetap bisa berjalan tanpa internet.

25. Top 5 GitHub repository untuk Sprint 2

1. AppiumTestDistribution/appium-device-farm

Paling relevan untuk Sprint 2.

Project ini merupakan Appium plugin khusus untuk mengelola dan membuat sessions pada kumpulan connected devices—real devices, emulator/simulator, termasuk Android. (GitHub)

Pelajari:

device inventory device allocation session allocation parallel device usage busy/free state port allocation device availability

Gunakan sebagai reference architecture, bukan wajib runtime dependency.

2. appium/appium-uiautomator2-driver

Ini source-of-truth utama untuk Android Appium layer Anda.

UiAutomator2 driver mendukung native, hybrid dan mobile-web Android automation, real devices/emulators, serta mempunyai dokumentasi khusus parallel execution. (GitHub)

Pelajari:

parallel sessions udid systemPort chromedriverPort mjpegServerPort ADB lifecycle gesture execution hierarchy session cleanup

Untuk implementasi runtime Sprint 2: repository #1 yang harus dibedah.

3. DeviceFarmer/stf

Ini referensi yang bagus untuk konsep local physical device farm.

DeviceFarmer mengelola kumpulan Android devices dan mempunyai model reservasi/release perangkat melalui API. (GitHub)

Pelajari:

device presence device availability device reservation device status device groups disconnect handling remote control architecture

Tetapi jangan copy arsitektur distributed STF sepenuhnya ke AutomatePlus.

Anda hanya membutuhkan subset:

DeviceRegistry DeviceLease DeviceHealth DeviceGroup

4. Genymobile/scrcpy

Untuk:

multi-device preview screen streaming control protocol rotation coordinate mapping ADB lifecycle

scrcpy tetap menjadi salah satu referensi terbaik. Project ini mendukung USB maupun TCP/IP dan Windows, dan release stream-nya tetap aktif pada 2026. (GitHub)

Gunakan khusus:

video/control transport

bukan sebagai source-of-truth recorder semantics.

5. appium/appium-inspector

Ini sangat berguna untuk fitur:

Screenshot + Page Source + Element Inspector + Locator + Actions

Appium Inspector memang menyediakan GUI untuk menampilkan screenshot dan page source aplikasi serta menginspeksi/interaksi dengan elemen. (GitHub)

Untuk Sprint 2, pelajari bagaimana mereka merepresentasikan:

selected device selected element hierarchy element attributes interaction

karena ini sangat mirip dengan DeviceObservation dan multi-device selector validation.

26. Ranking berdasarkan kebutuhan Automate Plus

RankRepositoryPelajari untuk1appium-device-farmDevice allocation/farm architecture2appium-uiautomator2-driverParallel Android/Appium3DeviceFarmer/stfDevice pool/reservation/health4scrcpyScreen/control/multi-device viewer5appium-inspectorHierarchy/locator/inspection

Alternatif yang juga layak dipelajari adalah VKCOM/devicehub, sebuah fork device-farm yang masih memiliki release pada 2026 dan menyediakan real-time device screen/control. (GitHub)

Rekomendasi final Sprint 2

Arsitektur akhirnya sebaiknya menjadi:

AUTOMATE PLUS │ AutomationSession │ Canonical ActionIR │ ┌────────────────┴────────────────┐ │ │ Recorder Farm Runner │ │ Primary Device Device Group │ │ │ ┌─────────────┼─────────────┐ │ ▼ ▼ ▼ │ Worker A Worker B Worker C │ │ │ │ │ Device A Device B Device C │ ├──────── DeviceObservation A ├──────── DeviceObservation B └──────── DeviceObservation C │ ▼ Generator Registry │ ▼ ONE GENERATED PROJECT │ Runtime device bindings │ ┌─────────────┼─────────────┐ ▼ ▼ ▼ Device A Device B Device C

Kunci desain Sprint 2 adalah:

Satu test intent, satu canonical IR, satu generated project, banyak device workers, dan evidence terpisah per device.

Itu yang paling menjaga SOLID, DRY, KISS dan YAGNI sekaligus membuat fondasi Anda siap berkembang ke Sprint berikutnya—misalnya device compatibility matrix, automated device quarantine, device tags/API-level selection, APK distribution ke farm, dan multi-PC device nodes—tanpa perlu membongkar core architecture lagi.

