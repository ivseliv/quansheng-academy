export type Bank = "A" | "B";
export type RadioKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "MENU"
  | "EXIT"
  | "UP"
  | "DOWN"
  | "F"
  | "STAR"
  | "SK1"
  | "SK2";
export type MenuValue = string | number;
export interface ChannelConfig {
  frequency: number;
  step: number;
  bandwidth: "WIDE" | "NARROW";
  rxCtcss: number | null;
  rxDcs: string | null;
  txCtcss: number | null;
  txDcs: string | null;
  power: "LOW" | "MID" | "HIGH";
  offset: number;
  shift: "OFF" | "ADD" | "SUB";
  am: boolean;
  list1: boolean;
  list2: boolean;
  reverse: boolean;
}
export interface MemoryChannel extends ChannelConfig {
  name: string;
}
export interface BankState {
  mode: "VFO" | "MR";
  vfo: ChannelConfig;
  channel: number;
}
export interface RadioSettings {
  sql: number;
  tdr: "OFF" | "CHAN_A" | "CHAN_B";
  scanResume: "TO" | "CO" | "SE";
  scanList: 1 | 2;
  beep: boolean;
  abr: number;
  autoLock: boolean;
  displayMode: "FREQ" | "CH" | "NAME";
  callChannel: number;
}
export interface ScanState {
  active: boolean;
  direction: 1 | -1;
  paused: boolean;
  elapsed: number;
  foundFrequency: number | null;
  stepElapsed: number;
}
export interface RadioState {
  version: 1;
  power: boolean;
  volume: number;
  active: Bank;
  banks: Record<Bank, BankState>;
  memories: Record<number, MemoryChannel>;
  settings: RadioSettings;
  ui: {
    screen: "main" | "menu" | "tone-search";
    menuId: number;
    menuPhase: "browse" | "edit" | "confirm";
    draft: MenuValue;
    input: string;
    functionPending: boolean;
    notice: string;
    lastMenuId: number;
  };
  locked: boolean;
  monitor: boolean;
  flashlight: boolean;
  ptt: boolean;
  alarm: boolean;
  scan: ScanState | null;
  clockMs: number;
  lastActionMs: number;
  history: string[];
  toneSearch: {
    found: boolean;
    failed: boolean;
    ctcss: number | null;
    dcs: string | null;
    elapsed: number;
  } | null;
}
export type RadioAction =
  | { type: "KEY"; key: RadioKey; long?: boolean }
  | { type: "PTT"; down: boolean }
  | { type: "POWER"; on: boolean }
  | { type: "VOLUME"; value: number }
  | { type: "TICK"; ms: number }
  | { type: "LOAD"; state: RadioState };
export interface MenuDefinition {
  id: number;
  name: string;
  title: string;
  description: string;
  implemented: boolean;
  readOnly?: boolean;
}
export interface Reception {
  bank: Bank;
  frequency: number;
  carrier: boolean;
  audible: boolean;
  strength: number;
  stationId: string | null;
  stationName: string;
  message: string;
  reason: string;
  quality: number;
  noise: boolean;
  ctcss: number | null;
  dcs: string | null;
}
