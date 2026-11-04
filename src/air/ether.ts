import type { ChannelConfig, Reception, Bank } from "../model/types";

export interface VirtualStation {
  id: string;
  name: string;
  frequency: number;
  strength: number;
  ctcss: number | null;
  dcs: string | null;
  modulation: "FM" | "AM";
  bandwidth: "WIDE" | "NARROW";
  period: number;
  duration: number;
  phase: number;
  messages: string[];
}
export interface StationSignal extends Omit<VirtualStation, "messages"> {
  active: boolean;
  message: string;
}
// Entirely fictional. Frequencies are teaching targets, not a directory of actual users.
export const STATIONS: VirtualStation[] = [
  {
    id: "training",
    name: "Учебная станция",
    frequency: 300150000,
    strength: 7,
    ctcss: null,
    dcs: null,
    modulation: "FM",
    bandwidth: "WIDE",
    period: 12000,
    duration: 5000,
    phase: 0,
    messages: [
      "«Учебная станция, проверка связи. Как слышно?»",
      "«Принимаю хорошо. Следующий сеанс по расписанию.»",
      "«Проверка завершена, переходим на приём.»",
    ],
  },
  {
    id: "park",
    name: "Парк · учебная группа",
    frequency: 145500000,
    strength: 6,
    ctcss: 88.5,
    dcs: null,
    modulation: "FM",
    bandwidth: "NARROW",
    period: 16000,
    duration: 6000,
    phase: 4000,
    messages: [
      "«Группа Альфа, условная точка достигнута.»",
      "«Пост Бета, принимаю ваш учебный сигнал.»",
    ],
  },
  {
    id: "workshop",
    name: "Мастерская · макет",
    frequency: 433500000,
    strength: 5,
    ctcss: null,
    dcs: "023N",
    modulation: "FM",
    bandwidth: "NARROW",
    period: 14000,
    duration: 4000,
    phase: 7000,
    messages: [
      "«Первый стенд готов. Это учебный обмен.»",
      "«Второй стенд подтвердил приём.»",
    ],
  },
  {
    id: "weak",
    name: "Дальний учебный маяк",
    frequency: 300200000,
    strength: 3,
    ctcss: 100,
    dcs: null,
    modulation: "FM",
    bandwidth: "NARROW",
    period: 18000,
    duration: 7000,
    phase: 2000,
    messages: ["«Тестовый маяк. Слабый сигнал для проверки SQL.»"],
  },
  {
    id: "air",
    name: "Авиационный учебный стенд",
    frequency: 125000000,
    strength: 8,
    ctcss: null,
    dcs: null,
    modulation: "AM",
    bandwidth: "WIDE",
    period: 15000,
    duration: 5000,
    phase: 5000,
    messages: ["«Учебная вышка вызывает виртуальный борт. Это имитация.»"],
  },
  {
    id: "noise",
    name: "Импульсная помеха",
    frequency: 300125000,
    strength: 1,
    ctcss: null,
    dcs: null,
    modulation: "FM",
    bandwidth: "WIDE",
    period: 9000,
    duration: 600,
    phase: 3000,
    messages: ["Короткий всплеск помехи, без речи."],
  },
];
export function getAirSnapshot(clockMs: number): StationSignal[] {
  return STATIONS.map((s) => {
    const t = Math.max(0, clockMs) + s.phase;
    return {
      ...s,
      active: t % s.period < s.duration,
      message: s.messages[Math.floor(t / s.period) % s.messages.length],
    };
  });
}
export function receiveChannel(
  channel: ChannelConfig,
  frequency: number,
  bank: Bank,
  clockMs: number,
  sql: number,
  monitor: boolean,
  volume: number,
): Reception {
  const tolerance = channel.bandwidth === "NARROW" ? 3000 : 6000;
  const matches = getAirSnapshot(clockMs)
    .filter((x) => x.active && Math.abs(x.frequency - frequency) <= tolerance)
    .sort((a, b) => b.strength - a.strength);
  const station = matches[0];
  const base: Reception = {
    bank,
    frequency,
    carrier: !!station,
    audible: false,
    strength: station?.strength ?? 0,
    stationId: station?.id ?? null,
    stationName: station?.name ?? "Тишина",
    message: "",
    reason: "На этой частоте сейчас нет передачи.",
    quality: 0,
    noise: false,
    ctcss: station?.ctcss ?? null,
    dcs: station?.dcs ?? null,
  };
  if (volume === 0) return { ...base, reason: "Регулятор громкости на нуле." };
  if (!station) {
    if (monitor || sql === 0)
      return {
        ...base,
        audible: true,
        noise: true,
        quality: 0.1,
        reason: monitor
          ? "MONITOR: шумоподавитель принудительно открыт."
          : "SQL=0: слышен шум при отсутствии передачи.",
      };
    return base;
  }
  if (!monitor && station.strength < sql)
    return {
      ...base,
      reason: `Сигнал ${station.strength}/9 ниже учебного порога SQL ${sql}.`,
    };
  if (!monitor && channel.rxCtcss !== null && channel.rxCtcss !== station.ctcss)
    return { ...base, reason: "Сигнал есть, но приёмный CTCSS не совпадает." };
  if (!monitor && channel.rxDcs !== null && channel.rxDcs !== station.dcs)
    return { ...base, reason: "Сигнал есть, но приёмный DCS не совпадает." };
  const expectedAM =
    channel.am && frequency >= 108000000 && frequency < 136000000;
  const modulationMatches = expectedAM === (station.modulation === "AM");
  const quality =
    (station.strength / 9) *
    (channel.bandwidth === station.bandwidth ? 1 : 0.65) *
    (modulationMatches ? 1 : 0.15);
  return {
    ...base,
    audible: true,
    quality,
    noise: station.id === "noise" || !modulationMatches,
    message: modulationMatches
      ? station.message
      : "Неразборчивый сигнал: неверная модуляция.",
    reason: !modulationMatches
      ? "Несовпадение AM/FM."
      : channel.bandwidth !== station.bandwidth
        ? "Полоса W/N отличается: учебное ухудшение качества."
        : monitor
          ? "MONITOR обходит SQL и приёмные тоны."
          : "Шумоподавитель открыт; условия приёма совпали.",
  };
}
