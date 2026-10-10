# Ultrasonic sensor on ESP32: instructions

**Goal:** an ultrasonic sensor on an ESP32 DevKit gives Netra the **measured distance to the closest object ahead**. That measurement drives the danger vibration; the camera names the object.

> **Update (2026-10-10): the link is Bluetooth.** The owner chose Bluetooth for the phone ↔ ESP32 link. **Section 8 is the spec to build.** The USB cable now only powers the board, and is handy for flashing and debugging on the laptop.
>
> Sections 0 and 3 (USB/Web Serial) are kept for reference. The wiring, the firmware measuring logic, and sections 4–7 still apply, with the new thresholds below.

This is the first piece of the Stage 3 hybrid stick, pulled forward by the owner.

**Owner answers (2026-10-10):**

- **Board:** ESP32 Dev Module with the classic ESP32-WROOM-32 (the "ISM 2.4 GHz 802.11 b/g/n" metal can). Its USB port goes through a bridge chip, CP2102 or CH340. Look at the small chip beside the USB port and record which one it is.
- **Haptics:** only the sensor triggers vibration, based on the closest object's distance. Camera distance estimates never trigger vibration while the sensor is working.
- **Mounting:** attached to the phone for the MVP; on the cane later.
- **Sensor lost:** the camera is the fallback (`cameraFallbackWhenLost: true`).
- **Range:** this sensor reads reliably only up to about 120–130 cm.
- **Thresholds (updated):** gentle "near" pulses start at **80 cm**; the strong "very near" buzz starts at **45 cm**. This reads the owner's "let's say 80 cm" as the near start, with the earlier 45 cm becoming the strong buzz. Confirm with the owner if unsure.
- **The sensor is the truth:** whenever the sensor has a fresh reading, its distance is what Netra uses, for vibration and for any distance it speaks. Camera distance estimates are used only while the sensor is lost.
- **Link:** Bluetooth (section 8).
- **Wi-Fi:** the owner asked about connecting over Wi-Fi. It isn't used while Netra is a web app; see the box below.

> **Why not Wi-Fi (while Netra is a web app):**
>
> - **The browser blocks it.** Netra is served over HTTPS (required for the camera). Chrome won't let an HTTPS page open plain `http://` or `ws://` connections to the ESP32's local address (mixed-content and private-network rules). Giving the ESP32 its own HTTPS certificate means a certificate warning that a blind user can't handle.
> - **Internet loss.** If the ESP32 makes its own Wi-Fi network, the phone joins it and Android may route internet through it, breaking Gemini.
> - **Too slow for alerts.** Routing through a cloud server avoids both problems but adds network delay to danger alerts. That breaks the "danger never uses the network" rule.
> - **Battery.** Wi-Fi also uses more power than Bluetooth on both sides.
>
> Wi-Fi becomes practical only with the native Android app wrapper (Capacitor), which can open local connections freely. Until then: USB cable (Path A), or Bluetooth Classic serial (Path C).

**Done when:** section 8 (Bluetooth) plus sections 1, 2 (measuring and filtering) and 4–7 pass on the real phone. Sections 0 and 3 are only needed if the USB route is ever used. As with every feature, commit only after it works on the phone.

---

## 0. Decide the connection path first (one short test, before any app code)

A web page on Android can't always talk to a USB serial device. It depends on the phone's Chrome version and on **which USB chip the ESP32 board uses**.

**Check the board.** Look at the small chip next to the board's USB port, or the listing where you bought it:

| Board type | USB chip | What it means |
| --- | --- | --- |
| Classic ESP32 DevKit (WROOM-32) | CP2102 or CH340 bridge chip | Web pages can talk to it only through Web Serial, if the phone's Chrome supports wired Web Serial. WebUSB can't easily use these chips. |
| ESP32-S3 or ESP32-C3 DevKit, plugged into the port labelled USB (not UART) | Built into the chip (standard CDC serial) | Works through Web Serial, **or** through WebUSB with Google's `web-serial-polyfill` (WebUSB has worked on Android Chrome for years) |

**Run a quick connection test before building the feature.** Make a small test page with one button. It shows:

- whether `navigator.serial` exists, and tries `navigator.serial.requestPort()`
- whether `navigator.usb` exists, and tries `navigator.usb.requestDevice()` (no filter)

Open it on the phone, plug in the ESP32 and tap the button. Record in `docs/ultrasonic-results.md`: the phone model, the Chrome version, which API listed the ESP32, and the board's USB chip.

**Status as of 2026-10:** Chrome on Android has supported Web Serial over **Bluetooth** since Chrome 137. A Chrome 148 Beta report says Web Serial came to Android, but I couldn't confirm whether it covers wired USB serial chips. This test settles it for your phone.

**For this board** (classic ESP32 with a CP2102/CH340 bridge), there are only two realistic outcomes:

- **Web Serial lists the board** → Path A. Use the cable for power and data.
- **It doesn't** → recommended **Path C: Bluetooth Classic serial**. The classic ESP32 has Bluetooth Classic built in. The firmware sends the same text lines over the ESP32's `BluetoothSerial` (SPP), and the app opens them with Web Serial over Bluetooth, which Chrome on Android supports since version 137. The USB-C cable then only powers the board. Same protocol, same app code apart from the port request. It's also the route the cane will use later.

Confirm C with the owner before building it.

**Pick the path from the result.** Ask the owner before choosing; don't decide alone.

| Result | Path |
| --- | --- |
| Web Serial lists the ESP32 | **Path A: Web Serial.** Simplest. |
| Only WebUSB lists it, and the board has native USB (S3/C3) | **Path B: WebUSB with `web-serial-polyfill`.** Same code shape as Path A. |
| Only WebUSB lists it, and the board is classic with CP2102/CH340 | No good web option. The owner chooses: buy an ESP32-S3 DevKit (cheap, then Path B); use Bluetooth Classic serial (Web Serial over Bluetooth works on Android, and the cable then only powers the board); or move the Android app wrapper (Capacitor plus a native USB-serial library) forward |
| Neither lists it | Check section 1 (power, OTG), then retest |

---

## 1. Hardware and wiring

**Parts:**

- ESP32 DevKit
- HC-SR04 ultrasonic sensor (5 V). If you have an RCWL-1601 (3.3 V version), skip the voltage divider.
- 1 kΩ and 2 kΩ resistors
- jumper wires
- a USB-C cable or an OTG adapter

**Wiring (HC-SR04):**

| HC-SR04 pin | ESP32 pin | Note |
| --- | --- | --- |
| VCC | 5V / VIN (comes from USB) | The sensor needs 5 V |
| GND | GND | |
| TRIG | GPIO 5 | A 3.3 V signal is enough to trigger it |
| ECHO | GPIO 18 **through a divider**: ECHO → 1 kΩ → GPIO 18, and GPIO 18 → 2 kΩ → GND | **Required.** ECHO outputs 5 V, which can damage a 3.3 V ESP32 pin. |

Any free GPIO pins work. Record the ones used in the firmware README.

**Getting the phone to power the board:**

- The phone must act as the USB **host** and supply 5 V. On many Indian-brand phones (Oppo, Vivo, Realme, some Xiaomi), **OTG must be switched on in Settings**, and it may switch itself off after about 10 minutes of no use.
- Many cheap ESP32 boards with a USB-C port lack the resistors that tell a USB-C phone "a device is here", so a **C-to-C cable gives no power**. If the board's power LED stays off, use a **USB-C OTG adapter (C plug to USB-A socket) plus a USB-A to C cable**. That works with any board.
- Expect some extra drain on the phone battery: the board, the sensor and the radio take tens of milliamps. Record the battery drop over 30 minutes in the results file.

**Mounting (MVP):** fix the sensor rigidly next to the phone camera, pointing the same way, at chest height. The sensor's beam is narrow (about 15°), so it only measures what is roughly straight ahead.

---

## 2. Firmware (ESP32, Arduino)

Create `firmware/ultrasonic/` in the repo with the sketch and a `README.md` (board, pins, Arduino core version, how to flash).

**Behaviour:**

1. **Measure about every 50 ms (20 per second).** Send a 10 µs TRIG pulse and time the ECHO pulse with a **10 ms timeout** (about 170 cm), since this sensor reads reliably only to about 120–130 cm. Distance in cm = echo µs ÷ 58.
2. **Filter:** report the **median of the last 3** readings.
   - Treat timeouts, readings under 2 cm and readings over **`MAX_CM` = 130** as "nothing in range".
   - Make `MAX_CM` a constant at the top of the sketch, so a better sensor only needs a one-line change.
3. **Send one line per measurement** over serial at **115200 baud**, plain text ending with a newline:
   - `D,<seq>,<cm>`, for example `D,1042,87`. `seq` counts up from 0 and wraps at 65535. `cm` = 0 means nothing in range.
4. **On boot, and every 5 s:** send `H,NETRA-US,1`. `H` is a heartbeat; `NETRA-US` identifies the device; `1` is the protocol version.
5. **Ignore anything the phone sends**, for now. The same line format will later carry vibration commands to a motor on the stick (Stage 3).
6. **Nothing else on the serial line.** No debug prints, because the app parses every line.

**Verify on the laptop:** open the Arduino serial monitor at 115200. You should see about 20 `D` lines a second, and the distance should change as you move your hand. Check against a tape measure at 0.5, 1, 2 and 3 m, and record the errors.

---

## 3. App: sensor connection module

**New file `src/cane/serialSensor.ts`**, implementing the existing `CaneConnection` interface in `src/cane/caneBluetooth.ts`:

- `connect()`
- `onDistance(cb)` (in metres)
- `connected`
- `disconnect()`

Add `onStatus(cb)` for "connected", "lost" and "reconnected".

**Behaviour:**

- **First connection** needs a user gesture and the system device chooser, so a sighted helper does it once. Add a **"Connect sensor"** button to the debug bar. It calls Path A `navigator.serial.requestPort()` or Path B (the polyfill's `requestPort`), then opens the port at 115200.
- **Later launches** connect with no prompt: on start, check the already-granted devices (`getPorts()`) and open the first one that sends `H,NETRA-US`. Also listen for the device being plugged in or removed, and reconnect automatically.
- **Read lines:** decode text, split on newlines, and ignore lines that don't parse. For each `D` line:
  - convert `cm` to metres
  - report `0` as "nothing in range". Use `null` in the app, not a distance of 0, or it would read as very near.
- **Freshness:** if no `D` line arrives for **500 ms**, the sensor is **lost**:
  - Vibrate a distinct `sensor_lost` pattern, different from `near`, `very_near` and `camera_lost`, and add it to `PATTERNS`.
  - Speak "Distance sensor disconnected" (English and Hindi in `strings.ts`).
  - On recovery, speak "Distance sensor connected".
- Show `sonar: 87 cm` / `sonar: none` / `sonar: off` in the debug bar.

---

## 4. App: feeding the danger engine

`ReflexEngine` in `src/reflex/reflexEngine.ts` already has `updateUltrasonic(metres)`, uses readings up to 500 ms old, and applies the same thresholds (very near < 1.0 m, near < 2.0 m).

1. **Wire it up:** on every sensor reading, call `reflex.updateUltrasonic()`. Pass "nothing in range" as no reading, so the engine treats it as clear.
2. **Run the danger check at sensor speed.** Today the engine only re-evaluates once per camera frame. After each sensor reading, also call `reflex.update()` with the latest camera detections, so sensor alerts arrive within about 50 ms even when the camera is slow.
3. **Camera lost but sensor alive:** Fix 2 in `docs/stage-1-fixes.md` calls `reflex.stop()` when the camera is lost. Change that: if the sensor is connected and fresh, **don't stop**. Keep sensor-driven vibration running, because the sensor alone still protects the user.

**DECIDED (owner): the sensor alone triggers vibration.**

4. While the sensor is connected and fresh, the danger level comes **only** from the sensor's closest-object distance, using **its own thresholds** in a new `CONFIG.sensor` block. The camera's thresholds (1.0 m / 2.0 m) stay unchanged for the fallback.
   - `nearM: 0.80`: gentle pulses start at 80 cm (owner decision)
   - `veryNearM: 0.45`: the strong buzz starts at 45 cm (owner decision)
   - none: above 80 cm, or nothing in range

   Camera detections still feed speech, naming and the router, but never vibration. Add `CONFIG.sensor.cameraTriggersHaptics: false` and make the engine honour it. Don't delete the camera danger path; step 5 uses it.
5. **DECIDED: camera fallback when the sensor is lost** (unplugged, OTG switched off, no data for 500 ms).
   - `CONFIG.sensor.cameraFallbackWhenLost: true`.
   - Camera-based vibration, with the camera thresholds, takes over until the sensor returns. The `sensor_lost` warning has already told the user.
   - When the sensor comes back, switch back to sensor-only on its next fresh reading.

---

## 5. App: putting a name to the measured distance

The sensor knows **how far**; the camera knows **what**. Combine them:

- The sensor beam (about 15°) covers roughly the **central quarter** of the camera picture. Add `CONFIG.sensor.beamFrac: 0.25`, a fraction of frame width centred on the middle; tune it during calibration.
- **The sensor is the truth for distance.** Whenever a fresh reading exists, any distance Netra speaks or shows for the thing straight ahead is the sensor's value, never the camera's estimate.
- Each frame, find the confident detection whose box overlaps that central column most. This decides only the **name**:
  - **If its camera estimate is within ±1 m of the sensor reading** (or it has no estimate), it is taken to be the object the sensor is measuring.
    - Set its `distanceM` to the sensor value and mark it `measured: true` (a new optional field on `Detection` in `src/types.ts`).
    - Speech: "chair ahead, about 70 centimetres".
  - **If the estimates disagree by more than 1 m**, the camera is probably naming something behind what the sensor hits. Say "something ahead, about 70 centimetres", using the sensor distance with no name.
  - **Spoken output** uses the measured value with "measured" wording only in the debug bar. Speech stays the same: "chair ahead, about 1 metre".
- **If the sensor reports something near and no detection is in the central column:** after the vibration eases, the existing "Just now: …" line should say "something ahead, about 0.8 metres" (English and Hindi), so the user knows it was real even though the camera couldn't name it.

---

## 6. Calibration and tests

**Laptop** (USB to the laptop works with desktop Chrome Web Serial; useful for development):

- [ ] Debug bar shows live `sonar` values; unplugging shows "lost" and speaks it; plugging back reconnects without a tap

**Phone** (add to `docs/ultrasonic-results.md`):

| # | Check | Pass when |
| --- | --- | --- |
| U1 | First connect | Helper taps "Connect sensor", chooses the ESP32; `sonar:` values appear |
| U2 | Auto-reconnect | Close and reopen Netra: the sensor connects with no prompt |
| U3 | Accuracy | Wall at 25, 45, 80 and 120 cm (tape measure): sonar within ±5 cm; at 150 cm it reports "none" |
| U4 | Thresholds | Walk slowly at a wall: nothing above 80 cm, gentle pulses from 80 cm, strong buzz below 45 cm. **No camera object needed.** |
| U5 | Named object | Chair straight ahead at 1.5 m: debug shows the chair with the measured distance; speech says the right distance |
| U6 | Unknown object | Cardboard box (not a COCO class) ahead below 1 m: buzz, then "something ahead…" |
| U7 | Unplug | Pull the cable while running: `sensor_lost` pattern plus the spoken warning within 1 s; camera-based alerts take over only if `cameraFallbackWhenLost` is true |
| U11 | Sensor only | Sensor connected; hold the phone so a person is near in the camera view but the sensor beam points past them at open space: **no vibration** |
| U8 | Camera lost, sensor alive | Lock the screen briefly, if the camera stops: the sensor still buzzes near a wall (check after Fix 2) |
| U9 | Power | 30 min running: record the phone battery drop; OTG did not switch itself off |
| U10 | Soft surfaces | A person in loose clothes and a curtain at 1 m: note whether the sensor sees them. Ultrasound can miss soft or angled surfaces; record it so the camera fallback settings can be judged. |

---

## 7. Known limits to record, not fix now

- Ultrasound misses some soft, thin or angled objects, and can give false echoes indoors (reflections). With "sensor only" haptics, a missed echo means no vibration. Check U10 measures how often that happens, so the owner can revisit the choice with data.
- One forward sensor doesn't see head-height obstacles or drop-offs. Those need an upward and a downward sensor (Stage 3).
- With the cable, the phone and the stick are tied together. Bluetooth (Stage 3) removes the cable, and the protocol in section 2 is designed to carry over unchanged.

---

## 8. Bluetooth link: the spec to build

The classic ESP32-WROOM-32 supports both kinds of Bluetooth:

- **BLE** (Bluetooth Low Energy): the phone uses Chrome's **Web Bluetooth**, which has worked on Android for years. This is the preferred option: low power, and the same design the future cane uses (`src/cane/caneBluetooth.ts`).
- **Bluetooth Classic serial (SPP)**: the phone uses **Web Serial over Bluetooth**, in Chrome on Android since version 137.

**The one thing that decides between them: reconnecting with no tap.** A blind user can't use Chrome's device chooser on every launch, so Netra must reconnect on its own after a helper connects it once.

- **Web Bluetooth** needs `navigator.bluetooth.getDevices()` to do that. It has existed behind a flag for years, and I couldn't confirm it is on by default in Chrome for Android.
- **Web Serial** has `navigator.serial.getPorts()` as a standard part of the API.

So **test both first** (8.1), and build the one that reconnects silently.

### 8.1 Reconnect test (before building the feature)

Flash a throwaway firmware that does **both**: a BLE server named `NETRA-US` with the service from 8.2, and `BluetoothSerial` named `NETRA-US-SPP`. It sends a counter once a second.

Make a test page with three buttons and a log:

1. **"Pair BLE":** `navigator.bluetooth.requestDevice` filtered on the 8.2 service UUID, then connect and log notifications.
2. **"Pair serial":**
   - Pair `NETRA-US-SPP` in **Android Settings → Bluetooth** first; Classic serial needs the phone's own pairing.
   - Then call `navigator.serial.requestPort` allowing the standard serial-port service class `00001101-0000-1000-8000-00805f9b34fb`, open it at any baud, and log the lines.
3. **"Silent reconnect":** with **no** chooser:
   - call `navigator.bluetooth.getDevices()` (if it exists), then `device.gatt.connect()`
   - call `navigator.serial.getPorts()`, then `open()`
   - log which one connects

**Run it:**

- Pair both.
- **Close Chrome fully**, reopen the page, and press "Silent reconnect".
- Also power-cycle the ESP32 and press it again.

Record in `docs/ultrasonic-results.md`: the phone, the Chrome version, and whether each one reconnected without a prompt.

| Result | Build |
| --- | --- |
| BLE reconnects silently | **BLE** (8.2–8.4). Preferred. |
| Only serial reconnects silently | **Bluetooth Classic serial.** Same text protocol as section 2 over `BluetoothSerial`; app code as in section 3 but requesting the Bluetooth port. |
| Neither | Stop and tell the owner. The options are a one-time chooser at every start (not acceptable for a blind user alone) or bringing the Android app wrapper forward. |

### 8.2 Firmware (BLE)

- **Library:** NimBLE-Arduino. It's lighter than the default BLE stack, and the ESP32's memory matters.
- **Name:** advertise as `NETRA-US`. While no phone is connected, advertise continuously at a fast interval (about 100 ms) **including the service UUID**, so the phone finds it quickly.
- **UUIDs:** generate **one random 128-bit base** once (any UUID generator). Use it for the service and the characteristics below. Put them in the firmware README and in `CONFIG.sensor.ble` in the app.
  - Replace the placeholder `0000feed…` UUIDs in `src/cane/caneBluetooth.ts`. `0xFEED` belongs to the Bluetooth SIG's assigned range and must not be used.

| Characteristic | Properties | Payload |
| --- | --- | --- |
| `distance` | notify (and read) | 4 bytes, little-endian: `uint16 seq`, `uint16 cm`. `cm = 0` means nothing in range. Sent after every measurement (about 20 per second), same filtering and `MAX_CM = 130` as section 2. |
| `info` | read | ASCII `NETRA-US,1`: device id and protocol version |
| `command` | write | Reserved for the cane's vibration motor (Stage 3). Ignore writes for now. |

- **Connection interval:** after connecting, request 15–30 ms, so notifications arrive with low delay.
- **On disconnect:** go straight back to advertising. Keep measuring all the time. Later, the stick's own motor (Stage 3) will use these readings even with no phone.
- **Power:** keep the USB cable from the phone (OTG) or a small power bank. Bluetooth doesn't carry power.

**Verify on the laptop:** a free BLE scanner app on any phone (for example nRF Connect) shows `NETRA-US`, and subscribing to `distance` shows the cm value changing as you move your hand.

### 8.3 App: `src/cane/bleSensor.ts`

Implement the existing `CaneConnection` interface (`connect`, `onDistance`, `connected`, `disconnect`), plus `onStatus(cb)` with "connected", "lost" and "reconnected" as in section 3.

- **First connection (helper, once):**
  - A **"Connect sensor"** button in the debug bar calls `requestDevice({ filters: [{ services: [SERVICE_UUID] }] })`.
  - Connect GATT, read `info` (must start with `NETRA-US`), and start notifications on `distance`.
  - Store the device id in `localStorage` (`netra.sensorId`), wrapped in try/catch.
- **Every later start (no chooser):**
  - Inside the existing Start flow, `getDevices()` → the device with the stored id → `gatt.connect()`.
  - If it's out of range or powered off, retry every 2 s in the background. Never block Start: the camera fallback covers the gap.
- **Notifications:** parse the 4 bytes.
  - `cm = 0` → "nothing in range", sent as a fresh **clear** reading (not lost, not 0 m).
  - Otherwise → metres.
  - Hand every reading to the same `onDistance` path as sections 4–5.
- **Losing the link:** on `gattserverdisconnected`, or no notification for **500 ms**:
  - status "lost", the `sensor_lost` vibration and the spoken warning (section 3)
  - the camera fallback takes over
  - keep retrying `gatt.connect()` every 2 s; on success, "Distance sensor connected"
- **Debug bar:** `sonar: 72 cm (ble)` / `sonar: none` / `sonar: lost` / `sonar: off`.
- **One module at a time:** `bleSensor.ts` and the USB `serialSensor.ts` (section 3) share the interface. The app picks the one in `CONFIG.sensor.link` (`"ble"` | `"bt-serial"` | `"usb"`), set from the 8.1 result.

### 8.4 Extra phone checks for Bluetooth

| # | Check | Pass when |
| --- | --- | --- |
| B1 | Delay | Hand moved quickly to 30 cm from the sensor: the strong buzz starts with no noticeable lag (aim under 150 ms; record it with a slow-motion phone video) |
| B2 | Silent reconnect | Close Netra fully, reopen, tap once to start: the sensor connects **with no chooser** |
| B3 | ESP32 restart | Power-cycle the ESP32 while Netra runs: "lost", camera fallback, then "Distance sensor connected" within about 5 s of power returning |
| B4 | Out of range | Walk the ESP32 about 10 m away: "lost" within 1 s; reconnects on return |
| B5 | 30-minute run | No drops; record the phone's battery drop with Bluetooth on |

## Owner decisions collected

1. **Connection path**, after the step 0 test: Path A (wired Web Serial) if the phone supports it, otherwise Path C (Bluetooth Classic serial) recommended. *Open.*
2. ~~Camera triggers haptics?~~ **Decided: sensor only** (`cameraTriggersHaptics: false`).
3. ~~Camera fallback when the sensor is lost~~ **Decided:** yes (`cameraFallbackWhenLost: true`).
5. ~~Wi-Fi link~~ **Not while Netra is a web app** (see the box at the top); possible after the Android app wrapper.
6. ~~Sensor thresholds~~ **Decided:** near from 80 cm, very near from 45 cm.
7. ~~Link~~ **Decided: Bluetooth.** BLE or Bluetooth Classic serial is chosen by the section 8 test (*open until tested*).
8. ~~Sensor vs camera distance~~ **Decided:** the sensor is the truth.
4. ~~Mounting~~ **Decided:** attached to the phone for the MVP, on the cane in future.
