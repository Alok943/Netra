// Future smart cane over Web Bluetooth (ultrasonic sensor + vibration motor). Stub only.
// Web Bluetooth works in Chrome on Android over HTTPS; not available on iOS Safari.
import type { HapticOutput, HapticPattern } from "../reflex/haptics";

// TODO: replace with the UUIDs the cane firmware advertises.
export const CANE_SERVICE_UUID = "0000feed-0000-1000-8000-00805f9b34fb";
export const CANE_DISTANCE_CHAR_UUID = "0000fee1-0000-1000-8000-00805f9b34fb"; // notify: uint16 cm
export const CANE_VIBRATE_CHAR_UUID = "0000fee2-0000-1000-8000-00805f9b34fb"; // write: uint8 level

export interface CaneConnection {
  readonly connected: boolean;
  connect(): Promise<void>;
  /** Ultrasonic distance in metres; feed into ReflexEngine.updateUltrasonic */
  onDistance(cb: (metres: number) => void): void;
  disconnect(): void;
}

export const isWebBluetoothAvailable = () => typeof navigator !== "undefined" && "bluetooth" in navigator;

export class CaneBluetoothStub implements CaneConnection, HapticOutput {
  readonly name = "cane";
  readonly supported = false;
  connected = false;

  async connect(): Promise<void> {
    // Real implementation outline:
    //   const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [CANE_SERVICE_UUID] }] });
    //   const server = await device.gatt.connect();
    //   const svc = await server.getPrimaryService(CANE_SERVICE_UUID);
    //   distance char -> startNotifications(), parse uint16 cm -> metres
    //   vibrate char -> writeValue(Uint8Array.of(level))
    throw new Error("Cane connection not implemented yet");
  }
  onDistance(_cb: (metres: number) => void): void {}
  pulse(_pattern: HapticPattern): void {}
  stop(): void {}
  disconnect(): void {
    this.connected = false;
  }
}
