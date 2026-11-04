import { describe, it, expect } from "vitest";
import {
  createInitialState,
  createChannel,
  radioReducer,
  getActiveChannel,
  getReception,
  getScanChannels,
  getTransmitBank,
  isBacklightOn,
  CTCSS_TONES,
  DCS_TONES,
  MENUS,
} from "./radio";
import { serializeRadio, deserializeRadio } from "./persistence";
import type { RadioKey, RadioState } from "./types";
const key = (s: RadioState, k: RadioKey, long = false) =>
  radioReducer(s, { type: "KEY", key: k, long });
function keys(s: RadioState, sequence: string[]) {
  return sequence.reduce((s, k) => key(s, k as RadioKey), s);
}
function menu(s: RadioState, id: number, value: string[]) {
  return keys(s, [
    "MENU",
    ...String(id).padStart(2, "0"),
    "MENU",
    ...value,
    "MENU",
    "EXIT",
  ]);
}
function river() {
  const s = createInitialState();
  s.power = true;
  s.banks.A.vfo = createChannel(300150000);
  s.settings.sql = 2;
  return s;
}
const tick = (s: RadioState, ms: number) =>
  radioReducer(s, { type: "TICK", ms });

describe("memory transactions and receiver settings", () => {
  it("requires SURE confirmation, cancels overwrite, clones complete channel config", () => {
    let s = river();
    s.banks.A.vfo = {
      ...s.banks.A.vfo,
      rxCtcss: 88.5,
      step: 6250,
      bandwidth: "NARROW",
      list2: true,
      offset: 600000,
      shift: "ADD",
    };
    s = keys(s, ["MENU", "1", "3", "MENU", "0", "1", "2", "MENU"]);
    expect(s.ui.menuPhase).toBe("confirm");
    expect(s.memories[12]).toBeUndefined();
    const cancelled = key(s, "EXIT");
    expect(cancelled.memories[12]).toBeUndefined();
    s = keys(s, ["MENU", "EXIT"]);
    expect(s.memories[12]).toMatchObject(s.banks.A.vfo);
    s = key(s, "UP");
    expect(s.memories[12].frequency).toBe(300150000);
    expect(s.banks.A.vfo.frequency).toBe(300156250);
    s = keys(s, ["F", "3", "0", "1", "2"]);
    expect(getActiveChannel(s).rxCtcss).toBe(88.5);
    const before = structuredClone(s.memories[12]);
    s = keys(s, [
      "MENU",
      "1",
      "3",
      "MENU",
      "0",
      "2",
      "1",
      "MENU",
      "MENU",
      "EXIT",
    ]);
    const { name: _name, ...parameters } = before;
    expect(s.memories[21]).toMatchObject(parameters);
    expect(s.memories[12]).toEqual(before);
  });
  it("deletes only confirmed memory and handles selected last channel safely", () => {
    let s = river();
    s.memories = { 12: { ...s.banks.A.vfo, name: "RIVER" } };
    s.banks.A.mode = "MR";
    s.banks.A.channel = 12;
    s = keys(s, ["MENU", "5", "0", "MENU", "0", "1", "2", "MENU"]);
    expect(s.memories[12]).toBeDefined();
    s = keys(s, ["MENU", "EXIT"]);
    expect(s.memories).toEqual({});
    expect(s.banks.A.mode).toBe("VFO");
    s = keys(s, ["F", "3"]);
    expect(s.banks.A.mode).toBe("VFO");
    expect(s.ui.notice).toContain("Память пуста");
  });
  it("rejects empty MR selection and preserves independent VFO when switching back", () => {
    let s = river();
    s = keys(s, ["F", "3", "1", "9", "9"]);
    expect(s.banks.A.channel).toBe(1);
    s = keys(s, ["F", "3"]);
    expect(getActiveChannel(s).frequency).toBe(300150000);
  });
  it("STEP supports exact fractional kHz without floating drift", () => {
    let s = menu(river(), 2, ["2"]);
    expect(getActiveChannel(s).step).toBe(6250);
    s = keys(s, Array(16).fill("UP"));
    expect(getActiveChannel(s).frequency).toBe(300250000);
  });
  it("RX tone types exclude one another while TX tones remain independent", () => {
    let s = river();
    s = menu(s, 5, ["1", "3"]);
    expect(getActiveChannel(s).rxCtcss).toBe(100);
    s = menu(s, 4, ["1"]);
    expect(getActiveChannel(s).rxDcs).toBe("023N");
    expect(getActiveChannel(s).rxCtcss).toBeNull();
    s = menu(s, 7, ["1"]);
    expect(getActiveChannel(s).txCtcss).toBe(67);
    expect(getActiveChannel(s).rxDcs).toBe("023N");
    expect(CTCSS_TONES).toHaveLength(50);
    expect(DCS_TONES).toHaveLength(208);
  });
  it("unsupported menus cannot silently save and all51 numbers remain intact", () => {
    const s = keys(river(), ["MENU", "1", "1", "MENU"]);
    expect(s.ui.menuPhase).toBe("browse");
    expect(s.ui.notice).toContain("не реализовано");
    expect(MENUS).toHaveLength(51);
  });
  it("M long recalls last menu, EXIT long cancels the current draft", () => {
    let s = keys(river(), ["MENU", "1", "0", "MENU", "UP"]);
    expect(getActiveChannel(s).bandwidth).toBe("WIDE");
    s = key(s, "EXIT", true);
    expect(s.ui.screen).toBe("main");
    s = key(s, "MENU", true);
    expect(s.ui.menuId).toBe(10);
    s = key(s, "EXIT");
    s = key(s, "MENU");
    expect(s.ui.menuId).toBe(1);
  });
  it("AM menu only applies in aviation band, and reverse changes reception", () => {
    let s = menu(river(), 48, ["UP"]);
    expect(getActiveChannel(s).am).toBe(false);
    s.banks.A.vfo = createChannel(125000000);
    s = menu(s, 48, ["UP"]);
    expect(getActiveChannel(s).am).toBe(true);
    s = river();
    s.banks.A.vfo.offset = 50000;
    s.banks.A.vfo.shift = "ADD";
    s = keys(s, ["F", "8"]);
    expect(getReception(s).frequency).toBe(300200000);
  });
});
describe("deterministic virtual ether and scan", () => {
  it("contains bursts, silence, noise, SQL and tone gating with monitor bypass", () => {
    let s = river();
    expect(getReception(s)).toMatchObject({
      carrier: true,
      audible: true,
      stationId: "training",
    });
    s.settings.sql = 9;
    expect(getReception(s)).toMatchObject({ carrier: true, audible: false });
    s.settings.sql = 2;
    s.banks.A.vfo.rxCtcss = 88.5;
    expect(getReception(s).audible).toBe(false);
    s = key(s, "SK1");
    expect(getReception(s).audible).toBe(true);
    s = key(s, "SK1");
    s.banks.A.vfo.rxCtcss = null;
    s = tick(s, 6000);
    expect(getReception(s).carrier).toBe(false);
    s.settings.sql = 0;
    expect(getReception(s)).toMatchObject({ audible: true, noise: true });
    s.volume = 0;
    expect(getReception(s).audible).toBe(false);
  });
  it("finds exact 300.150 via VFO scan; CO resumes after carrier ends", () => {
    let s = river();
    s.banks.A.vfo.frequency = 300100000;
    s = key(s, "STAR", true);
    s = tick(s, 1200);
    expect(s.scan).toMatchObject({
      active: true,
      paused: true,
      foundFrequency: 300150000,
    });
    expect(getActiveChannel(s).frequency).toBe(300150000);
    s = tick(s, 5000);
    expect(getActiveChannel(s).frequency).toBeGreaterThan(300150000);
  });
  it("TO waits a five-second pause; SE remains on found frequency", () => {
    let s = river();
    s.settings.scanResume = "TO";
    s = key(s, "STAR", true);
    s = tick(s, 100);
    expect(s.scan?.paused).toBe(true);
    s = tick(s, 4900);
    expect(s.scan?.paused).toBe(true);
    s = tick(s, 100);
    expect(s.scan?.paused).toBe(false);
    s = river();
    s.settings.scanResume = "SE";
    s = key(s, "STAR", true);
    s = tick(s, 1000);
    expect(s.scan).toMatchObject({ active: false, foundFrequency: 300150000 });
    s = tick(s, 15000);
    expect(getActiveChannel(s).frequency).toBe(300150000);
  });
  it("MR scans only members of selected list and refuses an empty list", () => {
    let s = river();
    s.memories = {
      1: { ...createChannel(145500000), name: "OUT", list2: false },
      12: { ...createChannel(300150000), name: "IN", list2: true },
      13: { ...createChannel(300175000), name: "SILENT", list2: true },
    };
    s.banks.A.mode = "MR";
    s.banks.A.channel = 13;
    s.settings.scanList = 2;
    expect(getScanChannels(s)).toEqual([12, 13]);
    s = key(s, "STAR", true);
    s = tick(s, 600);
    expect(s.scan?.foundFrequency).toBe(300150000);
    expect(s.banks.A.channel).toBe(12);
    s = key(s, "EXIT");
    s.memories[12].list2 = false;
    s.memories[13].list2 = false;
    s = key(s, "STAR", true);
    expect(s.scan?.active).toBe(false);
    expect(s.ui.notice).toContain("пуст");
  });
  it("scan cancellation and direction use real controls", () => {
    let s = river();
    s.banks.A.vfo.frequency = 300100000;
    s = key(s, "STAR", true);
    s = key(s, "DOWN");
    expect(s.scan?.direction).toBe(-1);
    s = key(s, "EXIT");
    expect(s.scan?.active).toBe(false);
    s = key(s, "STAR", true);
    s = radioReducer(s, { type: "PTT", down: true });
    expect(s.scan?.active).toBe(false);
    expect(s.ptt).toBe(false);
  });
  it("Dual Watch receives B only when enabled and returns one signal", () => {
    let s = river();
    s.banks.A.vfo.frequency = 145525000;
    s.banks.B.vfo = createChannel(300150000);
    expect(getReception(s).audible).toBe(false);
    s.settings.tdr = "CHAN_A";
    expect(getReception(s)).toMatchObject({ bank: "B", audible: true });
    expect(getTransmitBank(s)).toBe("A");
    s.banks.A.vfo = createChannel(145500000);
    expect(getReception(s).bank).toBe("A");
  });
  it("tone search is distinct from scan and requires M to adopt a found tone", () => {
    let s = river();
    s.banks.A.vfo = createChannel(145500000);
    s = keys(s, ["F", "STAR"]);
    expect(s.scan).toBeNull();
    s = tick(s, 100);
    expect(s.toneSearch).toMatchObject({ found: true, ctcss: 88.5 });
    expect(getActiveChannel(s).rxCtcss).toBeNull();
    s = key(s, "MENU");
    expect(getActiveChannel(s).rxCtcss).toBe(88.5);
    expect(s.ui.screen).toBe("main");
  });
});
describe("locking, lights, persistence, purity", () => {
  it("locking blocks keypad but retains side controls and PTT simulation", () => {
    let s = river();
    s = key(s, "F", true);
    const f = getActiveChannel(s).frequency;
    s = keys(s, ["UP", "2", "MENU"]);
    expect(getActiveChannel(s).frequency).toBe(f);
    expect(s.ui.screen).toBe("main");
    s = key(s, "SK1");
    expect(s.monitor).toBe(true);
    s = key(s, "SK2");
    expect(s.flashlight).toBe(true);
    s = radioReducer(s, { type: "PTT", down: true });
    expect(s.ptt).toBe(true);
    expect(getReception(s).audible).toBe(false);
    s = radioReducer(s, { type: "PTT", down: false });
    expect(s.ptt).toBe(false);
  });
  it("ABR timeout and disabled backlight behave separately from LCD power", () => {
    let s = river();
    expect(isBacklightOn(s)).toBe(true);
    s = tick(s, 7000);
    expect(s.power).toBe(true);
    expect(isBacklightOn(s)).toBe(false);
    s = key(s, "UP");
    expect(isBacklightOn(s)).toBe(true);
    s.settings.abr = 0;
    expect(isBacklightOn(s)).toBe(false);
  });
  it("roundtrips settings and channels but clears transient PTT/menu/scan", () => {
    let s = river();
    s.memories[12] = { ...s.banks.A.vfo, name: "RIVER" };
    s = menu(s, 2, ["2"]);
    s = radioReducer(s, { type: "PTT", down: true });
    const restored = deserializeRadio(serializeRadio(s));
    expect(restored.memories).toEqual(s.memories);
    expect(restored.banks).toEqual(s.banks);
    expect(restored.settings).toEqual(s.settings);
    expect(restored.ptt).toBe(false);
    expect(restored.ui.screen).toBe("main");
    expect(restored.scan).toBeNull();
  });
  it("validates corrupt or malicious persisted data without crashing", () => {
    expect(deserializeRadio("{broken")).toEqual(createInitialState());
    const s = deserializeRadio(
      JSON.stringify({
        version: 1,
        volume: 5,
        banks: {
          A: { mode: "MR", channel: 999, vfo: { frequency: -2, step: 9 } },
        },
        memories: {
          999: { frequency: 300150000 },
          12: { frequency: 300150000, name: "x", rxCtcss: 999, rxDcs: "023N" },
        },
        settings: { sql: 55 },
      }),
    );
    expect(s.volume).toBe(0.55);
    expect(s.settings.sql).toBe(4);
    expect(s.banks.A.channel).toBe(12);
    expect(s.memories[999]).toBeUndefined();
    expect(s.memories[12].rxCtcss).toBeNull();
  });
  it("every action leaves a deeply frozen input state untouched", () => {
    const freeze = (x: unknown): void => {
      if (x && typeof x === "object") {
        Object.freeze(x);
        Object.values(x).forEach(freeze);
      }
    };
    let s = river();
    for (const k of [
      "MENU",
      "1",
      "3",
      "MENU",
      "0",
      "1",
      "2",
      "MENU",
      "MENU",
      "EXIT",
      "F",
      "3",
      "UP",
      "SK1",
      "SK2",
    ] as RadioKey[]) {
      freeze(s);
      expect(() => {
        s = key(s, k);
      }).not.toThrow();
    }
    freeze(s);
    expect(() => tick(s, 1000)).not.toThrow();
  });
});

describe("auxiliary edge cases", () => {
  it("keypad under PTT cannot retune; unsupported Air Copy is explicitly reported", () => {
    let s = radioReducer(river(), { type: "PTT", down: true });
    s = keys(s, [..."145500", "UP"]);
    expect(getActiveChannel(s).frequency).toBe(300150000);
    expect(s.ui.notice).toContain("DTMF");
    s = key(s, "SK2");
    expect(s.flashlight).toBe(false);
    expect(s.ui.notice).toContain("Air Copy");
  });
  it("tone search stops on timeout until the user restarts it", () => {
    let s = river();
    s.banks.A.vfo = createChannel(145500000);
    s.clockMs = 2200; // Park is quiet until 12000ms.
    s = keys(s, ["F", "STAR"]);
    s.banks.A.vfo.frequency = 145525000;
    s = tick(s, 10000);
    expect(s.toneSearch?.failed).toBe(true);
    s.banks.A.vfo.frequency = 145500000;
    s = tick(s, 5000);
    expect(s.toneSearch?.found).toBe(false);
    s = key(s, "EXIT");
    expect(s.ui.screen).toBe("main");
  });
  it("VFO reset preserves memory; ALL reset clears it after confirmation", () => {
    let s = river();
    s.memories[12] = { ...s.banks.A.vfo, name: "RIVER" };
    s = keys(s, ["MENU", "5", "1", "MENU", "MENU"]);
    expect(s.memories[12]).toBeDefined();
    s = key(s, "MENU");
    expect(s.memories[12]).toBeDefined();
    expect(s.banks.A.vfo.frequency).toBe(145500000);
    s = keys(s, ["MENU", "5", "1", "MENU", "UP", "MENU", "MENU"]);
    expect(s.memories).toEqual({});
    expect(s.ui.screen).toBe("main");
  });
});

describe("invalid memory input", () => {
  it("does not commit an unintended partial channel after out-of-range input", () => {
    let s = keys(river(), ["MENU", "1", "3", "MENU", ..."201", "MENU"]);
    expect(s.ui.menuPhase).toBe("edit");
    expect(s.ui.notice).toContain("001–200");
    expect(s.memories[20]).toBeUndefined();
    s = keys(s, [..."012", "MENU", "MENU", "EXIT"]);
    expect(s.memories[12].frequency).toBe(300150000);
  });
});
