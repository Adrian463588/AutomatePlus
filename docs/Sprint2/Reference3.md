Automate Plus — Rekomendasi Sprint 2: Local Android Device Farm

Setelah saya cocokkan dengan PRD.md, DESIGN.md, AGENTS.md, dokumentasi Android, Appium, Maestro, scrcpy, Mobly, dan beberapa proyek device-farm, saya tidak menyarankan mengganti stack Sprint 1.

Fondasi Anda sudah tepat: Windows 10/11 x64 + WinUI 3/.NET 8 sebagai authoritative host + Node.js/TypeScript sidecar + SQLite + runtime pack lokal. Arsitektur saat ini juga sudah menetapkan .NET sebagai pemilik orchestration, device locks, process isolation dan reports, sementara TypeScript memiliki IR/generator/selector.

Untuk Sprint 2, tambahkan lapisan:

Device Registry ↓ Device Pool / Device Group ↓ Device Reservation ↓ Multi-Device Scheduler ↓ ┌──────────┬──────────┬──────────┬──────────┐ │ Worker A │ Worker B │ Worker C │ Worker D │ │ Phone A │ Phone B │ Phone C │ Phone D │ └──────────┴──────────┴──────────┴──────────┘ ↓ Per-device Appium / ADB context ↓ Canonical Automation IR ↓ One Generated Project ↓ Per-device Reports / Artifacts

Ini tetap sesuai dengan desain Anda yang sudah mengharuskan satu worker per Android serial yang terkunci, bukan beberapa test yang berebut device yang sama.

1. Stack Sprint 2 yang saya rekomendasikan

AreaStack Sprint 2Desktop hostWinUI 3 + .NET 8Language hostC# / .NETUI patternMVVMConcurrencyTask, CancellationToken, Channel<T>, SemaphoreSlimDevice discoveryADB / Android Platform ToolsDevice identityinternal UUID + current ADB serialMobile automationAppium 3 + UiAutomator2Device mirroringscrcpyMulti-device schedulercustom C# schedulerAndroid IRexisting Automation IRCode generatorexisting Node.js/TypeScript sidecarAppium TS/JSWebdriverIO/Appium adapterAppium Java/KotlinAppium Java ClientMaestroYAML + local shardingEspressoKotlin/Java + AndroidJUnitRunnerEspresso isolationAndroid Test OrchestratorEmulator matrixGradle Managed DevicesRobolectricJVM-only; bukan device-farm runnerMetadataSQLiteSecretsDPAPI / Windows Credential ManagerReportsnormalized report + per-device artifactsRuntime distributionchecksum-verified offline runtime packs.NET qualitydotnet format + build + testTypeScript qualityESLint + typecheck + testsKotlinktlint/Spotless + detektJavaSpotless/Checkstyle/SpotBugs

Stack tersebut mempertahankan kontrak Sprint 1: production host tetap WinUI/.NET, TypeScript sidecar tetap mempunyai IR validation dan generator, dan runtime eksternal dijalankan sebagai proses lokal yang terverifikasi.

2. Jangan membuat platform Device Farm baru

Untuk menjaga KISS + YAGNI, jangan menambahkan:

platform = "device-farm"

dan jangan menambahkan:

RunMode = "farm"

Run mode saat ini:

functional ui-soak api-rps

sudah cukup.

Tambahkan saja:

DeviceExecutionStrategy

misalnya:

type DeviceExecutionStrategy = | 'single' | 'all-devices' | 'split-iterations';

Sehingga:

functional + single functional + all-devices functional + split-iterations ui-soak + single ui-soak + all-devices ui-soak + split-iterations

Tidak perlu menciptakan hierarchy baru.

3. Arsitektur Android Phone Farm

Saya merekomendasikan struktur berikut:

WinUI │ ▼ FarmRunViewModel │ ▼ FarmRunCoordinator │ ├── DeviceRegistry │ ├── DevicePoolService │ ├── DeviceLeaseService │ ├── PortLeaseManager │ ├── DeviceHealthService │ └── FarmScheduler │ ├── DeviceWorker[serial A] │ └── AppiumSession │ ├── DeviceWorker[serial B] │ └── AppiumSession │ └── DeviceWorker[serial C] └── AppiumSession

Domain interfaces cukup:

IDeviceRegistry IDevicePoolService IDeviceLeaseService IPortLeaseManager IFarmScheduler IDeviceWorker IDeviceHealthService

Jangan membuat puluhan interface untuk setiap operasi ADB. Itu akan menjadi over-engineering.

4. Device Registry

Sprint 1 sudah memiliki discovery:

adb devices -l

Sprint 2 ubah hasil discovery menjadi DeviceDescriptor.

Contoh:

{ "id": "internal-device-uuid", "alias": "Samsung S24", "adbSerial": "R5CX123ABC", "model": "SM-S921B", "apiLevel": 35, "resolution": "1080x2340", "density": 420, "orientation": "portrait", "transport": "usb", "state": "ready" }

Ketika lebih dari satu perangkat terhubung, Android secara eksplisit mengharuskan command diarahkan ke serial tertentu dengan:

adb -s <serial> ...

Automate Plus karena itu tidak boleh pernah menjalankan ADB tanpa serial setelah Device Farm aktif. (Android Developers)

Buat satu wrapper:

AdbDeviceClient

dan semua operasi harus menjadi:

AdbDeviceClient(serial).Tap(...) AdbDeviceClient(serial).Install(...) AdbDeviceClient(serial).Screenshot(...) AdbDeviceClient(serial).GetHierarchy(...)

bukan:

AdbService.Tap(...)

yang kemudian menebak device.

5. Bedakan Device ID dengan ADB connection

Ini penting khususnya kalau nanti menggunakan wireless debugging.

Gunakan:

internal DeviceId ≠ current adbSerial

Contohnya:

DeviceId: phone-samsung-01 Current connection: 192.168.1.22:39125

Jika port wireless berubah:

192.168.1.22:39125 ↓ 192.168.1.22:43871

profile device tidak dianggap sebagai device baru.

Untuk farm yang stabil, USB sebaiknya menjadi koneksi default, sedangkan wireless ADB menjadi opsi.

6. Device Pool / Device Group

Tambahkan konsep sederhana:

Device Group

Contoh UI:

Android Devices [x] Samsung S24 Android 15 USB Ready [x] Pixel 8 Android 16 USB Ready [x] Samsung A54 Android 14 USB Ready [ ] Galaxy Watch Wear OS WiFi Ready Group: Regression Phones

Database minimal:

device_profiles device_groups device_group_members farm_runs farm_run_devices

Tidak perlu Redis, RabbitMQ atau message broker.

SQLite sudah cukup karena seluruh sistem berjalan di satu Windows desktop.

7. Device Reservation

Sprint 1 sudah menetapkan:

satu Android serial hanya boleh mempunyai satu active interaction/run.

Pertahankan aturan tersebut.

State:

Available ↓ Reserved ↓ Preparing ↓ Running ↓ Cleaning ↓ Available

atau ketika gagal:

Running ↓ Disconnected / Failed ↓ Cleaning ↓ Available / Quarantined

Jangan membuat dua Appium session terhadap device yang sama.

8. Multi-device Appium

Ini merupakan engine utama yang paling tepat untuk physical phone farm.

UiAutomator2 mendukung parallel testing. Untuk real-device parallel session, dokumentasinya meminta identitas device melalui udid dan port unik untuk komponen seperti systemPort; chromedriverPort diperlukan untuk Chrome/WebView dan mjpegServerPort perlu unik ketika digunakan. Dokumentasinya juga menyebut satu server Appium yang menangani beberapa session sebagai pilihan yang lebih ringan dibanding menjalankan server terpisah per session. (GitHub)

Rekomendasi Sprint 2

Gunakan:

1 Local Appium Server │ ├── Session A → Phone A ├── Session B → Phone B ├── Session C → Phone C └── Session D → Phone D

Bukan langsung:

Appium Server A Appium Server B Appium Server C Appium Server D

Process-per-device baru dibuat di Sprint berikutnya jika terbukti dibutuhkan.

Per-device runtime context

{ "deviceId": "device-A", "udid": "R5CX123ABC", "systemPort": 8211, "mjpegServerPort": 9111, "chromedriverPort": 9516 }

Device B:

{ "deviceId": "device-B", "udid": "34031FDH200012", "systemPort": 8212, "mjpegServerPort": 9112, "chromedriverPort": 9517 }

9. Tambahkan PortLeaseManager

Ini sangat penting.

Jangan membiarkan setiap adapter memilih port sendiri.

Buat:

PortLeaseManager

yang mengalokasikan:

Appium systemPort MJPEG port Chromedriver port optional local forwarding port

State:

Free ↓ Reserved(runId, deviceId) ↓ InUse ↓ Released

Port selalu dibersihkan ketika:

Pass Fail Cancel Timeout Device disconnect Application shutdown

10. Fitur 1 — Replay berulang pada multiple Android device

Saya merekomendasikan dua mode Sprint 2.

Mode A — Run on All Devices

Satu scenario dikirim ke semua phone.

LoginTest │ ├── Samsung S24 ├── Pixel 8 ├── Samsung A54 └── Xiaomi 14

Contoh:

Devices: 4 Iterations: 20

artinya:

Samsung → 20 iterations Pixel → 20 iterations A54 → 20 iterations Xiaomi → 20 iterations

Total:

80 executions

Ini cocok untuk:

compatibility test regression test flaky test soak test device fragmentation test

11. Mode B — Split Iterations

Misalnya:

100 iterations 4 phones

scheduler membaginya kira-kira:

Phone A → 25 Phone B → 25 Phone C → 25 Phone D → 25

Gunakan queue-based scheduling, bukan pembagian statis permanen.

Lebih baik:

Global iteration queue │ ├── Worker A requests next ├── Worker B requests next ├── Worker C requests next └── Worker D requests next

Jika Phone B lambat:

A → 29 B → 18 C → 27 D → 26

masih diperbolehkan selama total tetap 100.

Ini memberikan utilisasi device lebih baik.

Konsep serupa digunakan Maestro untuk local execution: --shard-all menjalankan koleksi yang sama pada beberapa device, sedangkan --shard-split membagi test suite di antara device yang tersedia. (Maestro Docs)

12. Jangan menyebut Android UI throughput sebagai RPS

Tetap pertahankan aturan Sprint 1:

Android: iterations/sec API: requests/sec

PRD Anda memang sudah membedakan UI functional/soak dari API RPS.

Contoh laporan:

Android Device Farm Devices 4 Iterations 100 Passed 96 Failed 4 Average duration 8.3 s Iteration throughput 0.46/s

Bukan:

46 RPS

13. Fitur 2 — Record untuk multiple Android devices

Untuk prinsip DRY + KISS, saya tidak menyarankan 4 device merekam 4 timeline terpisah pada waktu yang sama.

Gunakan konsep:

Leader Recorder + Follower Validation

Contoh:

Primary / Leader Samsung S24 Followers ├── Pixel 8 ├── Samsung A54 └── Xiaomi 14

User melakukan:

tap Login

pada Samsung.

Pipeline:

Pointer event Samsung ↓ resolve semantic element ↓ resource-id = login_button ↓ create canonical ActionIR ↓ broadcast same semantic action ↓ ┌───────────────┬───────────────┬───────────────┐ Pixel 8 Samsung A54 Xiaomi 14 ↓ ↓ ↓ resolve resolve resolve ↓ ↓ ↓ PASS PASS FALLBACK

Ini merupakan pendekatan yang jauh lebih bersih dibanding merekam koordinat setiap phone secara independen.

14. Canonical IR tetap satu

Jangan menghasilkan:

session-samsung.json session-pixel.json session-xiaomi.json

untuk test yang sama.

Tetap:

session-login.json

berisi:

{ "action": "tap", "target": { "locators": [ { "strategy": "resourceId", "value": "com.example:id/login", "score": 100 }, { "strategy": "accessibilityId", "value": "Login", "score": 90 } ] } }

Ini selaras dengan arsitektur Anda bahwa AutomationSession dan ActionIR adalah canonical source of truth dan generated code hanya projection.

15. Simpan per-device evidence secara terpisah

Jangan mencemari canonical IR dengan hasil setiap device.

Tambahkan:

DeviceExecutionEvidence

contoh:

{ "stepId": "step-22", "deviceId": "pixel-8", "status": "passed", "resolvedLocator": { "strategy": "resourceId", "value": "com.example:id/login" }, "coordinateFallbackUsed": false, "durationMs": 341 }

Device lain:

{ "stepId": "step-22", "deviceId": "xiaomi-14", "status": "passed", "resolvedLocator": { "strategy": "accessibilityId", "value": "Login" }, "coordinateFallbackUsed": false }

Canonical intent:

Tap Login

tetap sama.

16. Jika layout berbeda

Misalnya:

Samsung: resource-id = btn_login Pixel: resource-id = login_button

jangan langsung membuat dua test.

Locator engine dapat menyimpan ranked candidates:

accessibilityId = Login resourceId = btn_login text = Login bounds = fallback

Selama semantic target sama, code tetap satu.

17. Synchronized recording

Tambahkan tombol:

Record Mode (●) Primary Device ( ) Primary + Validate Followers

Saya merekomendasikan Sprint 2 hanya mempunyai dua mode tersebut.

Jangan dulu implementasikan independent simultaneous recording, misalnya:

user A tap Phone A user B tap Phone B user C scroll Phone C

lalu mencoba menggabungkan ketiga timeline.

Masalahnya akan mencakup:

event ordering timeline merge conflicting semantic actions different application states locator merging assertion ownership

Itu kandidat Sprint 3, bukan Sprint 2.

18. Multi-device code generation

Hal terpenting:

Generate satu project, bukan N project.

Contoh:

generated/ └─ appium-typescript/ ├─ package.json ├─ tsconfig.json ├─ config/ │ └─ devices.example.json ├─ tests/ │ └─ login.spec.ts ├─ support/ │ ├─ device-context.ts │ └─ capabilities.ts └─ automate-plus.generated.json

Runtime:

Canonical test ↓ Device Matrix ↓ ┌─────────┬─────────┬─────────┐ │ Device A│ Device B│ Device C│ └─────────┴─────────┴─────────┘

Serial sebenarnya tidak perlu hard-coded dalam generated source.

Gunakan environment/runtime configuration:

DEVICE_UDID APPIUM_SYSTEM_PORT APPIUM_MJPEG_PORT CHROMEDRIVER_PORT

19. Framework support pada Device Farm Sprint 2

FrameworkPhysical multi-deviceStrategiAppium✅ Excellentprimary farm engineMaestro✅local shardingEspresso✅instrumentation per deviceRobolectric❌JVM-onlyADB actions✅device control/support

Appium

Prioritas utama.

One IR → Appium project → one session per selected device

Maestro

Maestro menyediakan local sharding terhadap perangkat yang sudah terhubung, termasuk menjalankan seluruh suite pada N device atau membagi suite di antara device. (Maestro Docs)

Jadi adapter Anda bisa menerjemahkan:

All Devices

menjadi konsep seperti:

--shard-all

dan:

Split

menjadi:

--shard-split

Jangan bergantung pada Maestro Cloud karena Automate Plus ditargetkan offline.

Espresso

Untuk emulator, Android Gradle Plugin mempunyai Gradle Managed Devices yang dapat mengelompokkan beberapa device profile dan menjalankan test pada device group secara parallel. (Android Developers)

Untuk physical phones milik Automate Plus, saya lebih menyarankan host scheduler Anda menjalankan instrumentation terhadap masing-masing serial.

Gunakan Android Test Orchestrator agar test instrumentation lebih terisolasi; setiap test dapat dijalankan pada instrumentation instance terpisah sehingga state leakage dan dampak crash dapat dikurangi. (Android Developers)

Robolectric

Tetap:

Local JVM

Jangan tampilkan:

Select Phone Farm

ketika user memilih Robolectric.

20. Device mirror multi-phone

scrcpy tetap sangat cocok sebagai referensi/runtime mirror.

scrcpy dapat menargetkan device tertentu menggunakan serial ketika beberapa ADB device tersedia:

scrcpy -s <serial>

dan mendukung Windows serta tidak memerlukan internet untuk penggunaan lokal. (GitHub)

UI:

┌──────────────────────────────────────────────┐ │ Android Farm │ ├──────────────┬──────────────┬───────────────┤ │ Samsung S24 │ Pixel 8 │ Samsung A54 │ │ │ │ │ │ [ mirror ] │ [ mirror ] │ [ mirror ] │ │ │ │ │ │ Ready │ Running 3/20 │ Failed 2/20 │ └──────────────┴──────────────┴───────────────┘

Namun, jangan mencoba menjalankan 10 mirror full-resolution sekaligus.

Untuk non-focused devices:

lower FPS lower resolution disable audio

dan hanya device aktif mendapatkan preview kualitas tinggi.

21. Satu versi ADB untuk seluruh aplikasi

Ini penting.

Gunakan satu:

runtime-packs/ └─ android-platform-tools/ └─ adb.exe

dan paksa:

AutomatePlus Appium scrcpy internal commands

menggunakan executable ADB yang sama.

scrcpy sendiri mendokumentasikan konflik ketika beberapa versi ADB berbeda digunakan pada mesin yang sama. (GitHub)

22. Offline runtime pack Sprint 2

Tambahkan:

runtime-packs/ └─ android-farm-win-x64/ ├─ manifest.json ├─ platform-tools/ │ └─ adb.exe ├─ appium/ │ ├─ node/ │ ├─ appium/ │ └─ drivers/uiautomator2/ ├─ scrcpy/ ├─ maestro/ ├─ jdk/ ├─ android-sdk/ └─ licenses/

Jangan menjalankan:

npm install appium driver install pip install gradle download maestro download

saat test berlangsung.

Dokumen Sprint 1 Anda sudah menetapkan bahwa dependency/runtimes harus tersedia dari local checksum-verified packs dan tidak boleh di-download selama run.

23. Health checker

Tambahkan halaman:

Android Farm Health ADB Ready Appium Ready UiAutomator2 Ready scrcpy Ready JDK Ready Android SDK Ready Maestro Ready Devices ──────────────────────────────────── Samsung S24 Ready Pixel 8 Ready Samsung A54 Unauthorized Xiaomi 14 Offline

Per-device preflight:

ADB authorized battery acceptable screen unlocked package installed target activity resolvable resolution detected orientation detected Appium bootstrap ready port lease ready free disk space

Jangan melakukan test jika preflight gagal.

Status:

Blocked

bukan fake Passed.

Ini juga konsisten dengan kontrak repository Anda.

24. Struktur source Sprint 2

Saya sarankan memperluas solution:

src/ ├─ AutomatePlus.App/ │ └─ Features/ │ └─ DeviceFarm/ │ ├─ AutomatePlus.Application/ │ └─ DeviceFarm/ │ ├─ DeviceRegistry.cs │ ├─ DevicePoolService.cs │ ├─ FarmRunCoordinator.cs │ ├─ FarmScheduler.cs │ └─ Contracts/ │ ├─ AutomatePlus.Domain/ │ └─ DeviceFarm/ │ ├─ DeviceDescriptor.cs │ ├─ DeviceGroup.cs │ ├─ DeviceLease.cs │ ├─ DeviceRunContext.cs │ └─ FarmRun.cs │ ├─ AutomatePlus.Infrastructure/ │ ├─ Android/ │ │ ├─ AdbDeviceClient.cs │ │ ├─ AppiumSessionManager.cs │ │ ├─ ScrcpyManager.cs │ │ └─ PortLeaseManager.cs │ │ │ └─ Persistence/ │ └─ AutomatePlus.SidecarHost/

Sidecar:

sidecar/src/ ├─ ir/ ├─ generators/ │ ├─ appium/ │ ├─ maestro/ │ └─ espresso/ └─ selectors/ └─ android/

Tidak perlu membuat DeviceFarmSidecar.

Device farm adalah orchestration concern milik .NET.

25. Step-by-step Sprint 2

Step 0 — Bereskan blocker Sprint 1 terlebih dahulu

Dokumen Anda mencatat solution .NET 8 sudah ada, tetapi environment terakhir masih menggunakan SDK 5.0.406 sehingga native .NET 8 build/test masih Blocked.

Sebelum menambahkan Sprint 2:

dotnet --list-sdks

pastikan .NET 8 tersedia secara lokal.

Kemudian:

dotnet format AutomatePlus.sln --verify-no-changes dotnet build AutomatePlus.sln --no-restore dotnet test AutomatePlus.sln --no-restore

Step 1 — Update specification

Karena device farm adalah public capability baru, update:

PRD.md DESIGN.md

AGENTS.md Anda sendiri mengharuskan PRD/DESIGN diperbarui bila public contract atau acceptance behavior berubah.

Saya sarankan menambahkan:

FR-14 — Local Android Device Farm FR-15 — Multi-Device Recording and Replay

Step 2 — Implement Device Registry

Implementasikan:

ADB discovery serial targeting device alias device metadata connection state health last seen

Acceptance:

3 device terhubung → semua terlihat → setiap command diarahkan ke serial yang tepat

Step 3 — Implement Device Group

Tambahkan:

Create Device Group Rename Group Add Device Remove Device Select Group

Jangan buat booking calendar atau account-based reservation.

Itu tidak diperlukan pada offline single-user desktop.

Step 4 — Implement Device Lease

Tambahkan exclusive lock:

Acquire(device) Release(device) Recover stale lock

Tests:

two workers cannot acquire same serial cancel releases serial disconnect releases serial application shutdown releases serial

Step 5 — Implement PortLeaseManager

Tests:

20 concurrent device contexts → no duplicate systemPort cancel → all leases released host restart → stale leases reclaimed

Step 6 — Appium multi-session

Implementasikan:

one Appium local server N UiAutomator2 sessions

Preflight:

udid unique systemPort unique mjpegServerPort unique chromedriverPort unique when required

Appium UiAutomator2 secara eksplisit mendukung parallel execution dan menetapkan parameter-parameter tersebut untuk menghindari collision. (GitHub)

Step 7 — Farm Scheduler

Implementasikan hanya:

AllDevices SplitIterations

jangan lebih dulu membuat:

priority scheduling predictive scheduling distributed scheduling machine-learning scheduling remote workers

Step 8 — Multi-device replay

Pipeline:

Session ↓ Validate IR ↓ Select DeviceGroup ↓ Preflight all devices ↓ Reserve devices ↓ Allocate ports ↓ Create workers ↓ Run ↓ Collect per-device result ↓ Cleanup ↓ Normalize report

Step 9 — Leader + follower recorder

Tambahkan:

PrimaryDeviceId FollowerDeviceIds[]

Flow:

Record on primary → semantic ActionIR → follower lookup → optional follower replay → compatibility evidence

Jangan memasukkan follower-specific result ke canonical IR.

Step 10 — Multi-device code generation

Generated test tetap satu.

Tambahkan configuration abstraction:

DeviceRunContext

bukan:

SamsungTest.kt PixelTest.kt XiaomiTest.kt

Step 11 — Multi-device report

Folder:

runs/ └─ <farm-run-id>/ ├─ report.html ├─ report.json └─ devices/ ├─ samsung-s24/ │ ├─ stdout.log │ ├─ logcat.log │ ├─ screenshots/ │ └─ iterations/ ├─ pixel-8/ └─ samsung-a54/

Dashboard:

DEVICE PASS FAIL AVG STATUS Samsung S24 20 0 8.1s PASS Pixel 8 19 1 8.5s FAIL Samsung A54 20 0 9.2s PASS Xiaomi 14 18 2 8.9s FAIL ────────────────────────────────────────────── TOTAL 77 3

26. Quality gates Sprint 2

Wajib:

dotnet format AutomatePlus.sln --verify-no-changes dotnet build AutomatePlus.sln --no-restore dotnet test AutomatePlus.sln --no-restore

Sidecar:

npm ci --offline npm run lint npm run typecheck npm test

Generated adapters:

generate → format → lint → compile/typecheck → local smoke → device run

Ini memang sudah menjadi quality-gate resmi project Anda.

27. Test cases wajib Sprint 2

Minimal test matrix:

DEVICE REGISTRY ✓ 1 device ✓ 2 devices ✓ device offline ✓ unauthorized device ✓ reconnect LOCKING ✓ same serial cannot be acquired twice ✓ cancellation releases lock ✓ crash recovery PORTS ✓ unique systemPort ✓ unique MJPEG port ✓ unique Chromedriver port ✓ stale leases recovered SCHEDULER ✓ all-devices ✓ split-iterations ✓ slow device ✓ failed device ✓ disconnect mid-run ✓ cancel all RECORDER ✓ primary tap ✓ follower semantic lookup ✓ orientation difference ✓ resolution difference ✓ fallback locator ✓ follower failure does not corrupt IR REPORTING ✓ separate logs ✓ separate screenshots ✓ iteration IDs unique ✓ aggregate totals correct

Real acceptance minimal:

2 physical Android devices

Unit/component tests dapat menggunakan fake devices, tetapi jangan menyatakan fitur Verified sampai parallel run nyata di setidaknya dua perangkat berhasil. Ini selaras dengan prinsip evidence-based acceptance yang sudah ada dalam PRD Anda.

28. Top 5 repository GitHub terbaik sebagai referensi Sprint 2

Saya mengurutkannya berdasarkan relevansi arsitektur untuk Automate Plus, bukan semata jumlah star.

1. appium/appium-uiautomator2-driver — paling penting

Referensi utama untuk:

multiple Android sessions udid binding systemPort allocation MJPEG isolation Chromedriver isolation device gestures Android hierarchy

UiAutomator2 mendukung native, hybrid dan mobile-web Android pada emulator maupun real device serta menyediakan guidance khusus untuk parallel tests. (GitHub)

Ambil pola: device/session isolation.

Jangan copy source-nya ke Automate Plus.

2. google/mobly — best reference untuk multi-device orchestration

Mobly memang dirancang untuk test yang membutuhkan beberapa device, complex environments atau custom hardware. Contoh use case resminya termasuk dua device melakukan P2P, conference call tiga phone, dan wearable yang berinteraksi dengan phone; host Windows juga didukung. (GitHub)

Sangat bagus untuk mempelajari konsep:

TestBed Controller Device configuration Multi-device lifecycle Per-device logs Cross-device orchestration

Tetapi:

Jangan jadikan Mobly dependency Sprint 2.

Anda sudah mempunyai orchestrator .NET.

Gunakan sebagai architectural reference saja agar tidak menambahkan Python runtime baru hanya untuk device farm.

3. mobile-dev-inc/Maestro — best reference untuk local sharding

Maestro bagus untuk mempelajari:

same suite → many devices split suite → many devices human-readable flow automatic waits per-device artifact naming

CLI-nya mendukung local sharding di perangkat terhubung dengan pendekatan shard-all dan shard-split. (Maestro Docs)

Sangat relevan dengan:

AllDevices SplitIterations

yang saya rekomendasikan untuk Automate Plus.

4. Genymobile/scrcpy — best reference untuk multi-device viewer

Gunakan untuk:

video mirroring low latency serial-based selection keyboard/mouse control USB/TCP-IP Windows support device orientation

scrcpy saat ini secara resmi mendukung pemilihan device melalui serial ketika beberapa ADB device terhubung. (GitHub)

Gunakan sebagai runtime mirror.

Tetap pertahankan aturan DESIGN Anda:

scrcpy ≠ Recorder semantics

yang memang sudah menjadi invariant project.

5. DeviceFarmer/stf — best architectural reference untuk device inventory

STF mempunyai konsep yang sangat relevan:

device inventory device status device ownership groups booking/reservation remote control battery/device health device search

Repo tersebut bahkan mempunyai booking dan partitioning terhadap sekumpulan device. (GitHub)

Namun jangan gunakan STF sebagai runtime/dependency langsung pada Automate Plus Windows. Dokumentasi resminya menyatakan Windows tidak mendapatkan installation support dan deployment mereka lebih berorientasi Linux/BSD; repo itu juga memperingatkan asumsi keamanan internalnya. (GitHub)

Jadi:

Use: device inventory ideas device state model grouping health visualization Don't use: STF runtime RethinkDB ZeroMQ STF web frontend STF authentication architecture

29. Ranking akhir

RankRepositoryGunakan sebagai referensi untuk1appium/appium-uiautomator2-driverparallel physical-device automation2google/moblymulti-device orchestration3mobile-dev-inc/Maestrolocal sharding/scheduling4Genymobile/scrcpymulti-device mirroring/control5DeviceFarmer/stfdevice inventory/pool concepts

Saya juga tetap menyarankan appium/appium sebagai referensi upstream untuk modular driver/server architecture, tetapi untuk Sprint 2, appium-uiautomator2-driver jauh lebih langsung relevan ke masalah Android farm. Appium sendiri memang modular dengan drivers, clients dan plugins sebagai komponen terpisah. (GitHub)

30. Hal yang jangan ditambahkan pada Sprint 2

Untuk benar-benar memenuhi SOLID + DRY + KISS + YAGNI, hindari:

❌ Kubernetes ❌ Docker orchestration ❌ Selenium Grid untuk Android farm lokal ❌ Redis ❌ RabbitMQ ❌ Kafka ❌ ZeroMQ ❌ microservices ❌ remote farm server ❌ WebSocket service antar module ❌ separate database per device ❌ Appium server per device sejak awal ❌ duplicate generated code per device ❌ separate Automation IR per device ❌ hardcoded UDID ❌ hardcoded Appium ports ❌ arbitrary adb shell ❌ adb command tanpa -s <serial> ❌ static sleep ❌ independent simultaneous recorder pada Sprint 2

Semuanya belum diperlukan untuk single-PC offline device farm.

Target akhir Sprint 2

Arsitektur yang saya pilih adalah:

Automate Plus │ WinUI 3 / .NET 8 │ Farm Coordinator │ ┌───────────────┼───────────────┐ │ │ │ Device A Device B Device C │ │ │ Worker A Worker B Worker C │ │ │ Appium Session Appium Session Appium Session │ │ │ └───────────────┬───────────────┘ │ Canonical Android IR │ TypeScript Sidecar │ Generator Registry │ ONE generated project │ ┌─────────────┼─────────────┐ ▼ ▼ ▼ Appium Maestro Espresso │ normalized report │ per-device evidence

Prioritas implementasi Sprint 2 yang paling tepat:

1. Pastikan .NET 8 native gates lulus 2. DeviceRegistry 3. DeviceGroup 4. DeviceLease 5. PortLeaseManager 6. Appium multi-session 7. FarmScheduler 8. AllDevices replay 9. SplitIterations replay 10. Per-device report 11. Leader + Followers recorder 12. Multi-device semantic validation 13. One-project multi-device generation 14. Maestro sharding 15. Espresso physical/GMD integration 16. Offline/runtime/security hardening 17. Acceptance pada ≥2 physical Android devices

Dengan desain ini, Sprint 2 tetap merupakan evolusi langsung dari Sprint 1, bukan rewrite: Anda hanya mengubah Android execution dari one session → one serial menjadi one canonical session → bounded pool of exclusively locked serials, sementara IR, generator, security boundary, offline runtime, dan quality gates yang sudah ada tetap dipertahankan.

