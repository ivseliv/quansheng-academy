import type {
  Bank,
  ChannelConfig,
  MenuValue,
  RadioAction,
  RadioState,
  Reception,
} from "./types";
import { MENUS, CTCSS_TONES, DCS_TONES } from "./menus";
import { receiveChannel } from "../air/ether";
export * from "./types";
export { MENUS, CTCSS_TONES, DCS_TONES } from "./menus";

export const STEPS = [2500, 5000, 6250, 10000, 12500, 25000];
export const BANDS = [
  [50000000, 76000000],
  [108000000, 136000000],
  [136000000, 174000000],
  [174000000, 350000000],
  [350000000, 400000000],
  [400000000, 470000000],
  [470000000, 600000000],
] as const;
export function createChannel(frequency = 145500000): ChannelConfig {
  return {
    frequency,
    step: 12500,
    bandwidth: "WIDE",
    rxCtcss: null,
    rxDcs: null,
    txCtcss: null,
    txDcs: null,
    power: "HIGH",
    offset: 0,
    shift: "OFF",
    am: false,
    list1: true,
    list2: false,
    reverse: false,
  };
}
export function createInitialState(): RadioState {
  return {
    version: 1,
    power: false,
    volume: 0.55,
    active: "A",
    banks: {
      A: { mode: "VFO", vfo: createChannel(), channel: 1 },
      B: { mode: "VFO", vfo: createChannel(433500000), channel: 2 },
    },
    memories: {
      1: { ...createChannel(145500000), name: "TRAIN-1" },
      2: { ...createChannel(433500000), name: "TRAIN-2" },
    },
    settings: {
      sql: 4,
      tdr: "OFF",
      scanResume: "CO",
      scanList: 1,
      beep: true,
      abr: 5,
      autoLock: false,
      displayMode: "FREQ",
      callChannel: 1,
    },
    ui: {
      screen: "main",
      menuId: 1,
      menuPhase: "browse",
      draft: 4,
      input: "",
      functionPending: false,
      notice: "Поверните регулятор питания.",
      lastMenuId: 1,
    },
    locked: false,
    monitor: false,
    flashlight: false,
    ptt: false,
    alarm: false,
    scan: null,
    clockMs: 0,
    lastActionMs: 0,
    history: [],
    toneSearch: null,
  };
}
export function getActiveChannel(
  s: RadioState,
  bank: Bank = s.active,
): ChannelConfig {
  const b = s.banks[bank];
  return b.mode === "MR" && s.memories[b.channel]
    ? s.memories[b.channel]
    : b.vfo;
}
export function isValidFrequency(f: number): boolean {
  return Number.isInteger(f) && BANDS.some(([a, b]) => f >= a && f < b);
}
export function formatFrequency(f: number): string {
  return (f / 1000000).toFixed(f % 1000 === 0 ? 3 : f % 100 === 0 ? 4 : 5);
}
export function getReceiveFrequency(c: ChannelConfig): number {
  return (
    c.frequency +
    (c.reverse
      ? c.shift === "ADD"
        ? c.offset
        : c.shift === "SUB"
          ? -c.offset
          : 0
      : 0)
  );
}
export function getTransmitFrequency(c: ChannelConfig): number {
  return c.reverse
    ? c.frequency
    : c.frequency +
        (c.shift === "ADD" ? c.offset : c.shift === "SUB" ? -c.offset : 0);
}
export function getTransmitBank(s: RadioState): Bank {
  return s.settings.tdr === "OFF"
    ? s.active
    : s.settings.tdr === "CHAN_A"
      ? "A"
      : "B";
}
export function getScanChannels(
  s: RadioState,
  list: 1 | 2 = s.settings.scanList,
): number[] {
  return Object.keys(s.memories)
    .map(Number)
    .filter((n) => (list === 1 ? s.memories[n].list1 : s.memories[n].list2))
    .sort((a, b) => a - b);
}
export function getReception(s: RadioState): Reception {
  const c = getActiveChannel(s);
  const base = receiveChannel(
    c,
    getReceiveFrequency(c),
    s.active,
    s.clockMs,
    s.settings.sql,
    s.monitor,
    s.volume,
  );
  if (!s.power || s.ptt || s.alarm)
    return {
      ...base,
      carrier: false,
      audible: false,
      strength: 0,
      message: "",
      reason: !s.power
        ? "Питание выключено."
        : s.ptt
          ? "PTT: имитация передачи, приём прерван."
          : "Локальная учебная тревога.",
    };
  if (s.settings.tdr !== "OFF" && !s.scan?.active && !base.audible) {
    const bank = s.active === "A" ? "B" : "A";
    const other = getActiveChannel(s, bank);
    const rx = receiveChannel(
      other,
      getReceiveFrequency(other),
      bank,
      s.clockMs,
      s.settings.sql,
      s.monitor,
      s.volume,
    );
    if (rx.audible || (!base.carrier && rx.carrier)) return rx;
  }
  return base;
}
export function isBacklightOn(s: RadioState): boolean {
  return (
    s.power &&
    s.settings.abr > 0 &&
    (s.clockMs - s.lastActionMs < s.settings.abr * 1000 ||
      getReception(s).audible ||
      s.ptt)
  );
}
export function getMenuValue(s: RadioState, id: number): MenuValue {
  const c = getActiveChannel(s);
  switch (id) {
    case 1:
      return s.settings.sql;
    case 2:
      return c.step;
    case 3:
      return c.power;
    case 4:
      return c.rxDcs ?? "OFF";
    case 5:
      return c.rxCtcss ?? "OFF";
    case 6:
      return c.txDcs ?? "OFF";
    case 7:
      return c.txCtcss ?? "OFF";
    case 8:
      return c.shift;
    case 9:
      return c.offset;
    case 10:
      return c.bandwidth;
    case 13:
      return s.banks[s.active].channel;
    case 16:
      return s.settings.abr === 0 ? "OFF" : s.settings.abr;
    case 17:
      return s.settings.tdr;
    case 19:
      return s.settings.beep ? "ON" : "OFF";
    case 22:
      return s.settings.scanResume;
    case 23:
      return s.settings.displayMode;
    case 25:
      return c.list1 ? "ON" : "OFF";
    case 26:
      return c.list2 ? "ON" : "OFF";
    case 30:
      return s.settings.callChannel;
    case 31:
      return `LIST ${s.settings.scanList}`;
    case 32:
      return getScanChannels(s, 1)[0] ?? "EMPTY";
    case 33:
      return getScanChannels(s, 2)[0] ?? "EMPTY";
    case 47:
      return "7.6 V";
    case 48:
      return c.am ? "ON" : "OFF";
    case 50:
      return s.banks[s.active].channel;
    case 51:
      return "VFO";
    default:
      return "НЕ РЕАЛИЗОВАНО";
  }
}
export function getMenuOptions(s: RadioState, id: number): MenuValue[] {
  switch (id) {
    case 1:
      return Array.from({ length: 10 }, (_, i) => i);
    case 2:
      return STEPS;
    case 3:
      return ["LOW", "MID", "HIGH"];
    case 4:
    case 6:
      return ["OFF", ...DCS_TONES];
    case 5:
    case 7:
      return ["OFF", ...CTCSS_TONES];
    case 8:
      return ["OFF", "ADD", "SUB"];
    case 10:
      return ["WIDE", "NARROW"];
    case 13:
    case 50:
      return Array.from({ length: 200 }, (_, i) => i + 1);
    case 16:
      return ["OFF", 1, 2, 3, 4, 5];
    case 17:
      return ["OFF", "CHAN_A", "CHAN_B"];
    case 19:
    case 25:
    case 26:
    case 48:
      return ["OFF", "ON"];
    case 22:
      return ["TO", "CO", "SE"];
    case 23:
      return ["FREQ", "CH", "NAME"];
    case 30:
      return Object.keys(s.memories)
        .map(Number)
        .sort((a, b) => a - b);
    case 31:
      return ["LIST 1", "LIST 2"];
    case 32:
      return getScanChannels(s, 1);
    case 33:
      return getScanChannels(s, 2);
    case 51:
      return ["VFO", "ALL"];
    default:
      return [];
  }
}
export function formatMenuValue(
  id: number,
  v: MenuValue,
  s?: RadioState,
): string {
  if (id === 2) return `${Number(v) / 1000} K`;
  if (id === 9) return `${(Number(v) / 1000000).toFixed(4)}`;
  if ([13, 30, 32, 33, 50].includes(id) && typeof v === "number")
    return `${s?.memories[v] ? "CH-" : ""}${String(v).padStart(3, "0")}`;
  if ([5, 7].includes(id) && typeof v === "number") return v.toFixed(1);
  if ([4, 6].includes(id) && v !== "OFF") return `D${v}`;
  return String(v);
}
function clone(s: RadioState): RadioState {
  return {
    ...s,
    banks: {
      A: { ...s.banks.A, vfo: { ...s.banks.A.vfo } },
      B: { ...s.banks.B, vfo: { ...s.banks.B.vfo } },
    },
    memories: { ...s.memories },
    settings: { ...s.settings },
    ui: { ...s.ui },
    history: [...s.history],
    scan: s.scan ? { ...s.scan } : null,
    toneSearch: s.toneSearch ? { ...s.toneSearch } : null,
  };
}
function record(s: RadioState, message: string) {
  s.ui.notice = message;
  s.history = [message, ...s.history].slice(0, 50);
}
function home(s: RadioState) {
  s.ui.screen = "main";
  s.ui.menuPhase = "browse";
  s.ui.input = "";
  s.ui.functionPending = false;
  s.toneSearch = null;
}
function changeChannel(s: RadioState, patch: Partial<ChannelConfig>) {
  const b = s.banks[s.active];
  if (b.mode === "MR" && s.memories[b.channel])
    s.memories[b.channel] = { ...s.memories[b.channel], ...patch };
  else b.vfo = { ...b.vfo, ...patch };
}
function applyMenu(s: RadioState) {
  const { menuId: id, draft: v } = s.ui;
  switch (id) {
    case 1:
      s.settings.sql = Number(v);
      break;
    case 2:
      changeChannel(s, { step: Number(v) });
      break;
    case 3:
      changeChannel(s, { power: v as ChannelConfig["power"] });
      break;
    case 4:
      changeChannel(s, {
        rxDcs: v === "OFF" ? null : String(v),
        ...(v !== "OFF" ? { rxCtcss: null } : {}),
      });
      break;
    case 5:
      changeChannel(s, {
        rxCtcss: v === "OFF" ? null : Number(v),
        ...(v !== "OFF" ? { rxDcs: null } : {}),
      });
      break;
    case 6:
      changeChannel(s, {
        txDcs: v === "OFF" ? null : String(v),
        ...(v !== "OFF" ? { txCtcss: null } : {}),
      });
      break;
    case 7:
      changeChannel(s, {
        txCtcss: v === "OFF" ? null : Number(v),
        ...(v !== "OFF" ? { txDcs: null } : {}),
      });
      break;
    case 8:
      changeChannel(s, { shift: v as ChannelConfig["shift"] });
      break;
    case 9:
      changeChannel(s, { offset: Number(v) });
      break;
    case 10:
      changeChannel(s, { bandwidth: v as ChannelConfig["bandwidth"] });
      break;
    case 13: {
      const n = Number(v);
      s.memories[n] = {
        ...getActiveChannel(s),
        name: s.memories[n]?.name ?? `CH-${String(n).padStart(3, "0")}`,
      };
      s.banks[s.active].channel = n;
      break;
    }
    case 16:
      s.settings.abr = v === "OFF" ? 0 : Number(v);
      break;
    case 17:
      s.settings.tdr = v as RadioState["settings"]["tdr"];
      break;
    case 19:
      s.settings.beep = v === "ON";
      break;
    case 22:
      s.settings.scanResume = v as RadioState["settings"]["scanResume"];
      break;
    case 23:
      s.settings.displayMode = v as RadioState["settings"]["displayMode"];
      break;
    case 25:
      changeChannel(s, { list1: v === "ON" });
      break;
    case 26:
      changeChannel(s, { list2: v === "ON" });
      break;
    case 30:
      s.settings.callChannel = Number(v);
      break;
    case 31:
      s.settings.scanList = v === "LIST 2" ? 2 : 1;
      break;
    case 48: {
      const c = getActiveChannel(s);
      if (c.frequency < 108000000 || c.frequency >= 136000000) {
        record(s, "AM действует только в диапазоне 108–136 МГц.");
        return;
      }
      changeChannel(s, { am: v === "ON" });
      break;
    }
    case 50: {
      const n = Number(v);
      delete s.memories[n];
      for (const bank of ["A", "B"] as Bank[]) {
        const b = s.banks[bank];
        if (b.mode === "MR" && !s.memories[b.channel]) {
          const next = Object.keys(s.memories).map(Number)[0];
          if (next) b.channel = next;
          else b.mode = "VFO";
        }
      }
      break;
    }
    case 51: {
      const fresh = createInitialState();
      fresh.power = true;
      fresh.volume = s.volume;
      fresh.memories = v === "ALL" ? {} : s.memories;
      fresh.clockMs = s.clockMs;
      fresh.lastActionMs = s.clockMs;
      fresh.history = s.history;
      Object.assign(s, fresh);
      record(s, `RESET ${v}: сброс выполнен`);
      return;
    }
  }
  record(
    s,
    `${MENUS[id - 1].name} = ${formatMenuValue(id, v, s)}${id === 13 ? " — канал сохранён" : id === 50 ? " — канал удалён" : ""}`,
  );
}
function stepFrequency(c: ChannelConfig, direction: 1 | -1): number {
  const band =
    BANDS.find(([a, b]) => c.frequency >= a && c.frequency < b) ?? BANDS[2];
  const f = c.frequency + direction * c.step;
  return f >= band[1] ? band[0] : f < band[0] ? band[1] - c.step : f;
}
function stepMain(s: RadioState, direction: 1 | -1, scanning = false) {
  const b = s.banks[s.active];
  if (b.mode === "MR") {
    const slots = scanning
      ? getScanChannels(s)
      : Object.keys(s.memories)
          .map(Number)
          .sort((a, b) => a - b);
    if (slots.length) {
      const idx = slots.indexOf(b.channel);
      b.channel =
        slots[
          idx < 0
            ? direction > 0
              ? 0
              : slots.length - 1
            : (idx + direction + slots.length) % slots.length
        ];
    }
  } else
    changeChannel(s, {
      frequency: stepFrequency(getActiveChannel(s), direction),
    });
}
function toggleScan(s: RadioState) {
  if (s.scan?.active) {
    s.scan.active = false;
    record(s, "Сканирование остановлено");
    return;
  }
  if (s.banks[s.active].mode === "MR" && getScanChannels(s).length === 0) {
    record(
      s,
      `LIST ${s.settings.scanList} пуст: добавьте канал через S-ADD${s.settings.scanList}.`,
    );
    return;
  }
  home(s);
  s.monitor = false;
  s.scan = {
    active: true,
    direction: 1,
    paused: false,
    elapsed: 0,
    foundFrequency: null,
    stepElapsed: 0,
  };
  if (
    s.banks[s.active].mode === "MR" &&
    !getScanChannels(s).includes(s.banks[s.active].channel)
  )
    stepMain(s, 1, true);
  record(
    s,
    `Сканирование ${s.banks[s.active].mode}${s.banks[s.active].mode === "MR" ? ` / LIST ${s.settings.scanList}` : ""}`,
  );
}
function tickStep(s: RadioState, ms: number) {
  s.clockMs += ms;
  if (!s.power) return;
  if (s.ui.functionPending && s.clockMs - s.lastActionMs >= 5000)
    s.ui.functionPending = false;
  if (s.toneSearch && !s.toneSearch.found && !s.toneSearch.failed) {
    s.toneSearch.elapsed += ms;
    const c = getActiveChannel(s);
    const rx = receiveChannel(
      c,
      getReceiveFrequency(c),
      s.active,
      s.clockMs,
      0,
      true,
      1,
    );
    if (rx.carrier && (rx.ctcss !== null || rx.dcs !== null)) {
      if (!s.toneSearch.found)
        record(s, `SCAN CMP: ${rx.dcs ?? `${rx.ctcss} Hz`}`);
      s.toneSearch.found = true;
      s.toneSearch.ctcss = rx.ctcss;
      s.toneSearch.dcs = rx.dcs;
    } else if (!s.toneSearch.found && s.toneSearch.elapsed >= 10000) {
      s.ui.notice =
        "SCAN FAIL: за учебный интервал тон не найден. EXIT — выход.";
      s.toneSearch.elapsed = 10000;
      s.toneSearch.failed = true;
    }
  }
  const scan = s.scan;
  if (!scan?.active || s.ptt) return;
  const c = getActiveChannel(s);
  const rx = receiveChannel(
    c,
    getReceiveFrequency(c),
    s.active,
    s.clockMs,
    s.settings.sql,
    false,
    1,
  );
  const detected = rx.carrier && rx.audible;
  if (scan.paused) {
    scan.elapsed += ms;
    if (s.settings.scanResume === "CO" && detected) return;
    if (s.settings.scanResume === "TO" && scan.elapsed < 5000) return;
    scan.paused = false;
    scan.elapsed = 0;
    scan.stepElapsed = 0;
    stepMain(s, scan.direction, true);
    return;
  }
  if (detected) {
    scan.foundFrequency = c.frequency;
    scan.paused = true;
    scan.elapsed = 0;
    record(s, `SCAN: найден сигнал ${formatFrequency(c.frequency)} МГц`);
    if (s.settings.scanResume === "SE") {
      scan.active = false;
      scan.paused = false;
    }
    return;
  }
  scan.stepElapsed += ms;
  if (scan.stepElapsed >= 200) {
    scan.stepElapsed -= 200;
    stepMain(s, scan.direction, true);
  }
}
export function radioReducer(
  previous: RadioState,
  action: RadioAction,
): RadioState {
  if (action.type === "LOAD") return clone(action.state);
  const s = clone(previous);
  if (action.type === "TICK") {
    if (!Number.isFinite(action.ms) || action.ms <= 0) return previous;
    let remaining = Math.min(action.ms, 60000);
    while (remaining > 0) {
      const dt = Math.min(remaining, 100);
      tickStep(s, dt);
      remaining -= dt;
    }
    return s;
  }
  s.lastActionMs = s.clockMs;
  if (action.type === "POWER") {
    s.power = action.on;
    s.ptt = false;
    s.scan = null;
    s.monitor = false;
    s.alarm = false;
    s.flashlight = false;
    home(s);
    record(s, s.power ? "Питание включено" : "Питание выключено");
    return s;
  }
  if (action.type === "VOLUME") {
    if (!Number.isFinite(action.value)) return previous;
    s.volume = Math.max(0, Math.min(1, action.value));
    record(s, `Громкость ${Math.round(s.volume * 100)}%`);
    return s;
  }
  if (!s.power) return previous;
  if (action.type === "PTT") {
    if (s.scan?.active) {
      s.scan.active = false;
      s.ptt = false;
      record(
        s,
        "PTT: сканирование остановлено. Следующее нажатие имитирует передачу.",
      );
      return s;
    }
    if (s.ui.screen === "tone-search") {
      home(s);
      return s;
    }
    s.ptt = action.down;
    home(s);
    record(
      s,
      action.down
        ? "PTT: только симуляция. Радиопередачи нет."
        : "PTT отпущена: приём",
    );
    return s;
  }
  const { key, long } = action;
  if (s.ptt && key === "SK2") {
    record(
      s,
      "PTT + SK2: Air Copy в этой версии не реализован. Радиообмена нет.",
    );
    return s;
  }
  if (s.ptt && key !== "SK1") {
    record(
      s,
      "Клавиши при PTT относятся к DTMF. DTMF не реализован; частота не меняется.",
    );
    return s;
  }
  if (s.alarm) {
    s.alarm = false;
    record(s, "Учебная тревога выключена");
    return s;
  }
  if (key === "SK1") {
    if (long) record(s, "1750 Hz: учебная имитация. Радиопередачи нет.");
    else {
      s.monitor = !s.monitor;
      record(
        s,
        s.monitor
          ? "MONITOR: SQL и приёмные тоны отключены до выхода"
          : "MONITOR выключен",
      );
    }
    return s;
  }
  if (key === "SK2") {
    if (long) {
      s.alarm = true;
      record(
        s,
        "Локальная учебная тревога. Любая кнопка — выход. Радиопередачи нет.",
      );
    } else {
      s.flashlight = !s.flashlight;
      record(s, s.flashlight ? "Фонарик включён" : "Фонарик выключен");
    }
    return s;
  }
  if (key === "F" && long) {
    s.locked = !s.locked;
    home(s);
    record(
      s,
      s.locked ? "Клавиатура заблокирована" : "Клавиатура разблокирована",
    );
    return s;
  }
  if (s.locked) {
    s.ui.notice =
      "Клавиатура заблокирована. Удерживайте F/# для разблокировки.";
    return s;
  }
  if (key === "EXIT") {
    if (s.scan?.active) {
      s.scan.active = false;
      record(s, "Сканирование остановлено");
    }
    if (long || s.ui.screen !== "menu" || s.ui.menuPhase === "browse") home(s);
    else {
      s.ui.menuPhase = "browse";
      s.ui.input = "";
      record(s, "Изменение отменено");
    }
    return s;
  }
  if (key === "MENU") {
    if (s.ui.screen === "tone-search") {
      if (s.toneSearch?.found) {
        changeChannel(s, {
          rxCtcss: s.toneSearch.ctcss,
          rxDcs: s.toneSearch.dcs,
        });
        record(s, "Найденный приёмный тон сохранён");
        home(s);
      } else record(s, "Тон ещё не обнаружен");
      return s;
    }
    if (s.scan?.active) {
      s.ui.notice = "Сначала остановите сканирование: EXIT или удержание *.";
      return s;
    }
    if (s.ui.screen !== "menu") {
      s.ui.screen = "menu";
      s.ui.menuId = long ? s.ui.lastMenuId : 1;
      s.ui.menuPhase = "browse";
      s.ui.input = "";
      s.ui.functionPending = false;
    } else if (s.ui.menuPhase === "browse") {
      if (!MENUS[s.ui.menuId - 1].implemented) {
        record(
          s,
          `${MENUS[s.ui.menuId - 1].name}: не реализовано. Откройте контекстную справку.`,
        );
        return s;
      }
      s.ui.draft = getMenuValue(s, s.ui.menuId);
      s.ui.menuPhase = "edit";
      s.ui.input = "";
    } else if (
      s.ui.menuPhase === "edit" &&
      [13, 50, 51].includes(s.ui.menuId)
    ) {
      if (
        [13, 50].includes(s.ui.menuId) &&
        s.ui.input.length === 3 &&
        (Number(s.ui.input) < 1 || Number(s.ui.input) > 200)
      ) {
        record(
          s,
          "Номер ячейки должен быть 001–200. Введите номер заново или выберите стрелками.",
        );
        return s;
      }
      if (s.ui.menuId === 50 && !s.memories[Number(s.ui.draft)]) {
        record(s, "Эта ячейка уже пуста");
        return s;
      }
      s.ui.menuPhase = "confirm";
      s.ui.input = "";
    } else {
      if (!MENUS[s.ui.menuId - 1].readOnly) applyMenu(s);
      s.ui.menuPhase = "browse";
      s.ui.input = "";
    }
    s.ui.lastMenuId = s.ui.menuId;
    return s;
  }
  if (s.ui.screen === "menu") {
    if (s.ui.menuPhase === "confirm") return s;
    if (key === "UP" || key === "DOWN") {
      const d = key === "UP" ? 1 : -1;
      if (s.ui.menuPhase === "browse")
        s.ui.menuId = ((s.ui.menuId - 1 + d + 51) % 51) + 1;
      else if (s.ui.menuId === 9)
        s.ui.draft = (Number(s.ui.draft) + d * 2500 + 1000000000) % 1000000000;
      else {
        const opts = getMenuOptions(s, s.ui.menuId);
        if (opts.length)
          s.ui.draft =
            opts[(opts.indexOf(s.ui.draft) + d + opts.length) % opts.length];
      }
      s.ui.input = "";
    } else if (/^\d$/.test(key)) {
      const max =
        s.ui.menuPhase === "browse"
          ? 2
          : s.ui.menuId === 9
            ? 6
            : [4, 5, 6, 7, 13, 30, 50].includes(s.ui.menuId)
              ? 3
              : 1;
      s.ui.input = (s.ui.input.length >= max ? "" : s.ui.input) + key;
      const n = Number(s.ui.input);
      if (s.ui.menuPhase === "browse") {
        if (n >= 1 && n <= 51) s.ui.menuId = n;
      } else if ([13, 30, 50].includes(s.ui.menuId)) {
        if (n >= 1 && n <= 200 && (s.ui.menuId !== 30 || s.memories[n]))
          s.ui.draft = n;
      } else if (s.ui.menuId === 9) {
        if (s.ui.input.length === 6) s.ui.draft = n * 1000;
      } else if (!MENUS[s.ui.menuId - 1].readOnly) {
        const opts = getMenuOptions(s, s.ui.menuId);
        if (n < opts.length) s.ui.draft = opts[n];
      }
    }
    s.ui.lastMenuId = s.ui.menuId;
    return s;
  }
  if (s.ui.screen === "tone-search") return s;
  if (key === "F") {
    s.ui.functionPending = true;
    s.ui.input = "";
    return s;
  }
  if (s.ui.functionPending) {
    s.ui.functionPending = false;
    s.ui.input = "";
    if (s.scan?.active) {
      s.ui.notice = "Сначала остановите сканирование.";
      return s;
    }
    if (key === "1") {
      const c = getActiveChannel(s);
      const index = BANDS.findIndex(
        ([a, b]) => c.frequency >= a && c.frequency < b,
      );
      if (s.banks[s.active].mode === "VFO") {
        changeChannel(s, { frequency: BANDS[(index + 1) % BANDS.length][0] });
        record(s, `Диапазон F${((index + 1) % BANDS.length) + 1}`);
      } else record(s, "BAND используется в VFO");
    } else if (key === "2") {
      s.active = s.active === "A" ? "B" : "A";
      record(s, `Выбран ${s.active}`);
    } else if (key === "3") {
      const b = s.banks[s.active];
      if (b.mode === "VFO" && Object.keys(s.memories).length === 0) {
        record(s, "Память пуста: сначала сохраните канал через MEM-CH.");
        return s;
      }
      b.mode = b.mode === "VFO" ? "MR" : "VFO";
      if (b.mode === "MR" && !s.memories[b.channel])
        b.channel = Number(Object.keys(s.memories)[0]);
      record(s, `${s.active}: ${b.mode}`);
    } else if (key === "6") {
      const levels: ChannelConfig["power"][] = ["LOW", "MID", "HIGH"];
      const p = levels[(levels.indexOf(getActiveChannel(s).power) + 1) % 3];
      changeChannel(s, { power: p });
      record(s, `TXP = ${p}; только симуляция`);
    } else if (key === "8") {
      changeChannel(s, { reverse: !getActiveChannel(s).reverse });
      record(
        s,
        getActiveChannel(s).reverse
          ? "Reverse включён: RX/TX поменялись местами"
          : "Reverse выключен",
      );
    } else if (key === "9") {
      if (s.memories[s.settings.callChannel]) {
        s.banks[s.active].mode = "MR";
        s.banks[s.active].channel = s.settings.callChannel;
        record(s, `Быстрый канал ${s.settings.callChannel}`);
      } else record(s, "Ячейка 1-CALL пуста");
    } else if (key === "STAR") {
      s.ui.screen = "tone-search";
      s.toneSearch = {
        found: false,
        failed: false,
        ctcss: null,
        dcs: null,
        elapsed: 0,
      };
      record(s, "Поиск CTCSS/DCS на текущей частоте");
    } else {
      const label =
        key === "0"
          ? "FM-радио"
          : key === "4"
            ? "Fast Copy"
            : key === "5"
              ? "NOAA"
              : key === "7"
                ? "VOX"
                : "Комбинация";
      record(s, `${label}: в этой версии не реализовано. См. справку.`);
    }
    return s;
  }
  if (key === "STAR") {
    if (long) toggleScan(s);
    else
      record(
        s,
        "Короткая * — DTMF-набор. DTMF в этой версии не реализован. Для сканирования удерживайте *.",
      );
    return s;
  }
  if (s.scan?.active) {
    if (key === "UP" || key === "DOWN") {
      s.scan.direction = key === "UP" ? 1 : -1;
      s.scan.paused = false;
      s.scan.elapsed = 0;
      stepMain(s, s.scan.direction, true);
      record(s, `Сканирование ${key === "UP" ? "вверх" : "вниз"}`);
    }
    return s;
  }
  const b = s.banks[s.active];
  if (key === "UP" || key === "DOWN") {
    stepMain(s, key === "UP" ? 1 : -1);
    s.ui.input = "";
    record(
      s,
      `${s.active}: ${formatFrequency(getActiveChannel(s).frequency)} МГц`,
    );
  } else if (/^\d$/.test(key)) {
    s.ui.input += key;
    if (b.mode === "VFO" && s.ui.input.length === 6) {
      const f = Number(s.ui.input) * 1000;
      s.ui.input = "";
      if (isValidFrequency(f)) {
        changeChannel(s, { frequency: f });
        record(s, `Частота ${formatFrequency(f)} МГц`);
      } else record(s, "Частота вне диапазона приёма");
    } else if (b.mode === "MR" && s.ui.input.length === 3) {
      const n = Number(s.ui.input);
      s.ui.input = "";
      if (s.memories[n]) {
        b.channel = n;
        record(s, `Канал ${n}`);
      } else record(s, `Канал ${n} пуст`);
    }
  }
  return s;
}
