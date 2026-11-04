import {
  createInitialState,
  createChannel,
  isValidFrequency,
  STEPS,
} from "./radio";
import { CTCSS_TONES, DCS_TONES } from "./menus";
import type { ChannelConfig, RadioState } from "./types";

type Data = Record<string, unknown>;
const object = (v: unknown): Data =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {};
const number = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : fallback;
const integer = (v: unknown, min: number, max: number, fallback: number) =>
  Number.isInteger(v) ? number(v, min, max, fallback) : fallback;
const boolean = (v: unknown, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;
function choice<T>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}
function channel(raw: unknown, fallback: ChannelConfig): ChannelConfig {
  const c = object(raw);
  const result: ChannelConfig = {
    frequency:
      typeof c.frequency === "number" && isValidFrequency(c.frequency)
        ? c.frequency
        : fallback.frequency,
    step: choice(c.step, STEPS, fallback.step),
    bandwidth: choice(c.bandwidth, ["WIDE", "NARROW"], fallback.bandwidth),
    rxCtcss: choice(c.rxCtcss, [null, ...CTCSS_TONES], null),
    txCtcss: choice(c.txCtcss, [null, ...CTCSS_TONES], null),
    rxDcs: choice(c.rxDcs, [null, ...DCS_TONES], null),
    txDcs: choice(c.txDcs, [null, ...DCS_TONES], null),
    power: choice(c.power, ["LOW", "MID", "HIGH"], fallback.power),
    offset: integer(c.offset, 0, 999999900, fallback.offset),
    shift: choice(c.shift, ["OFF", "ADD", "SUB"], fallback.shift),
    am: boolean(c.am, fallback.am),
    list1: boolean(c.list1, fallback.list1),
    list2: boolean(c.list2, fallback.list2),
    reverse: boolean(c.reverse, fallback.reverse),
  };
  if (result.rxDcs !== null) result.rxCtcss = null;
  if (result.txDcs !== null) result.txCtcss = null;
  return result;
}
/** No transient menu, PTT, scan, alarm or monitor survives a page reload. */
export function serializeRadio(state: RadioState): string {
  const { version, power, volume, active, banks, memories, settings, locked } =
    state;
  return JSON.stringify({
    version,
    power,
    volume,
    active,
    banks,
    memories,
    settings,
    locked,
  });
}
export function deserializeRadio(raw: string | null | undefined): RadioState {
  const s = createInitialState();
  if (!raw) return s;
  try {
    const data = object(JSON.parse(raw));
    if (data.version !== 1) return s;
    s.power = boolean(data.power, s.power);
    s.volume = number(data.volume, 0, 1, s.volume);
    s.active = choice(data.active, ["A", "B"], s.active);
    s.locked = boolean(data.locked, false);
    const banks = object(data.banks);
    for (const b of ["A", "B"] as const) {
      const v = object(banks[b]);
      s.banks[b] = {
        mode: choice(v.mode, ["VFO", "MR"], "VFO"),
        channel: integer(v.channel, 1, 200, s.banks[b].channel),
        vfo: channel(v.vfo, s.banks[b].vfo),
      };
    }
    if (data.memories !== undefined) {
      s.memories = {};
      for (const [key, value] of Object.entries(object(data.memories))) {
        const n = Number(key);
        const m = object(value);
        if (
          !Number.isInteger(n) ||
          n < 1 ||
          n > 200 ||
          typeof m.frequency !== "number" ||
          !isValidFrequency(m.frequency)
        )
          continue;
        s.memories[n] = {
          ...channel(m, createChannel(m.frequency)),
          name:
            typeof m.name === "string"
              ? m.name.slice(0, 10)
              : `CH-${String(n).padStart(3, "0")}`,
        };
      }
    }
    for (const b of ["A", "B"] as const) {
      if (s.banks[b].mode === "MR" && !s.memories[s.banks[b].channel]) {
        const slot = Object.keys(s.memories)[0];
        if (slot) s.banks[b].channel = Number(slot);
        else s.banks[b].mode = "VFO";
      }
    }
    const settings = object(data.settings);
    s.settings = {
      sql: integer(settings.sql, 0, 9, s.settings.sql),
      tdr: choice(settings.tdr, ["OFF", "CHAN_A", "CHAN_B"], s.settings.tdr),
      scanResume: choice(
        settings.scanResume,
        ["TO", "CO", "SE"],
        s.settings.scanResume,
      ),
      scanList: choice(settings.scanList, [1, 2], s.settings.scanList),
      beep: boolean(settings.beep, s.settings.beep),
      abr: integer(settings.abr, 0, 5, s.settings.abr),
      autoLock: false,
      displayMode: choice(
        settings.displayMode,
        ["FREQ", "CH", "NAME"],
        s.settings.displayMode,
      ),
      callChannel: integer(
        settings.callChannel,
        1,
        200,
        s.settings.callChannel,
      ),
    };
    s.ui.notice = "Локальные настройки восстановлены.";
    return s;
  } catch {
    return s;
  }
}
