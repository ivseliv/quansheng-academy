import {
  createChannel,
  createInitialState,
  getActiveChannel,
  getReception,
  type MemoryChannel,
  type RadioState,
} from "../model/radio";

export interface LessonContext {
  /** Actual downloaded simulator data; never a boolean confirming a click. */
  backupJson?: string;
  exportCsv?: string;
}

export interface LessonTask {
  id: string;
  title: string;
  description: string;
  hints: [string, string, string];
  explanation: string;
  setup: (previous: RadioState) => RadioState;
  check: (state: RadioState, context?: LessonContext) => boolean;
}

export interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  tasks: LessonTask[];
}

function base(previous: RadioState): RadioState {
  const s = createInitialState();
  s.power = true;
  s.memories = structuredClone(previous.memories);
  s.ui.notice = "Учебная начальная ситуация загружена.";
  return s;
}

const ready = (s: RadioState) => s.power && s.ui.screen === "main";
const RIVER = 300150000;
const clearTones = (s: RadioState) =>
  getActiveChannel(s).rxCtcss === null && getActiveChannel(s).rxDcs === null;

function river(previous: RadioState): RadioState {
  const s = base(previous);
  s.banks.A.vfo = createChannel(RIVER);
  s.settings.sql = 2;
  return s;
}

function memory(
  s: RadioState,
  slot: number,
  frequency = RIVER,
  patch: Partial<MemoryChannel> = {},
) {
  s.memories[slot] = {
    ...createChannel(frequency),
    name: `TRAIN-${slot}`,
    ...patch,
  };
}

function storedRiver(s: RadioState, slot = 12): boolean {
  const c = s.memories[slot];
  return (
    !!c &&
    c.frequency === RIVER &&
    c.bandwidth === "WIDE" &&
    c.rxCtcss === null &&
    c.rxDcs === null
  );
}

function scanFixture(previous: RadioState): RadioState {
  const s = river(previous);
  s.banks.A.vfo.frequency = 300100000;
  return s;
}

function dualFixture(previous: RadioState): RadioState {
  const s = river(previous);
  s.banks.A.vfo.frequency = 145525000;
  s.banks.B.vfo = createChannel(RIVER);
  return s;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Study table, deliberately not presented as a radio image or CHIRP import file. */
export function buildTrainingCsv(s: RadioState): string {
  const rows = Object.entries(s.memories)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([slot, c]) =>
      [
        slot,
        c.name,
        (c.frequency / 1e6).toFixed(6),
        c.am ? "AM" : c.bandwidth === "NARROW" ? "NFM" : "FM",
        c.rxCtcss ?? "OFF",
        c.rxDcs ?? "OFF",
        c.list1 ? 1 : 0,
        c.list2 ? 1 : 0,
      ]
        .map(csvCell)
        .join(","),
    );
  return (
    ["Location,Name,Frequency,Mode,R-CTCSS,R-DCS,List1,List2", ...rows].join(
      "\r\n",
    ) + "\r\n"
  );
}

function matchingBackup(s: RadioState, text?: string): boolean {
  if (!text || !storedRiver(s)) return false;
  try {
    const saved: unknown = JSON.parse(text);
    if (
      !saved ||
      typeof saved !== "object" ||
      !("version" in saved) ||
      saved.version !== 1 ||
      !("memories" in saved)
    )
      return false;
    if (!saved.memories || typeof saved.memories !== "object") return false;
    const savedMemories = saved.memories as Record<string, unknown>;
    const slots = Object.keys(s.memories).sort();
    return (
      JSON.stringify(Object.keys(savedMemories).sort()) ===
        JSON.stringify(slots) &&
      slots.every(
        (slot) =>
          JSON.stringify(savedMemories[slot]) ===
          JSON.stringify(s.memories[Number(slot)]),
      )
    );
  } catch {
    return false;
  }
}

export const CHAPTERS: Chapter[] = [
  {
    id: "controls",
    title: "Органы управления и экран",
    subtitle: "Питание, активная строка, меню и блокировка",
    tasks: [
      {
        id: "power",
        title: "Оживите радиостанцию",
        description:
          "Включите радиостанцию верхним регулятором и установите громкость между 35% и 80%.",
        hints: [
          "Питание и громкость на настоящей рации объединены в одном верхнем регуляторе.",
          "Найдите регулятор справа от антенны. Положение OFF выключает прибор.",
          "Нажмите на верхнюю ручку питания, затем передвиньте ползунок громкости под рацией примерно на 55%.",
        ],
        explanation:
          "Регулятор управляет питанием и уровнем звука в динамике. Громкость не увеличивает чувствительность приёмника и не меняет мощность передачи. Экран должен включиться даже в тишине.",
        setup: (previous) => {
          const s = base(previous);
          s.power = false;
          s.volume = 0;
          return s;
        },
        check: (s) => s.power && s.volume >= 0.35 && s.volume <= 0.8,
      },
      {
        id: "active-b",
        title: "Выберите нижнюю строку",
        description:
          "Сделайте строку B активной. Проверьте положение стрелки рядом с частотой.",
        hints: [
          "Две частоты на экране не означают, что вы редактируете обе сразу. Стрелка указывает активную строку.",
          "На цифровой клавише 2 есть вторичная функция A/B. Её вызывает клавиша F.",
          "Коротко нажмите F, затем 2. Стрелка должна перейти к строке B.",
        ],
        explanation:
          "A и B — две независимые строки настройки. F → 2 выбирает строку, к которой применятся ввод частоты и многие пункты меню. Dual Watch включается отдельно: само наличие двух строк его не включает.",
        setup: (previous) => base(previous),
        check: (s) => ready(s) && s.active === "B",
      },
      {
        id: "sql-two",
        title: "Первое изменение в меню",
        description:
          "Установите SQL = 2, подтвердите новое значение и вернитесь к экрану частот.",
        hints: [
          "SQL — порог открытия шумоподавителя. Нужно сохранить значение, а не только увидеть его во время редактирования.",
          "Это пункт 01 SQL. M открывает меню и входит в редактирование; стрелки меняют значение.",
          "Нажмите M → M → ↓ → ↓ → M → EXIT. Исходное значение в этом задании равно 4.",
        ],
        explanation:
          "Шумоподавитель закрывает динамик при слабом сигнале. Меньший SQL позволяет услышать более слабые станции, но иногда пропускает шум. M подтверждает изменение, EXIT отменяет несохранённую правку.",
        setup: (previous) => base(previous),
        check: (s) => ready(s) && s.settings.sql === 2,
      },
      {
        id: "keypad-lock",
        title: "Защитите настройку",
        description:
          "Заблокируйте клавиатуру. Частота и активная строка должны остаться прежними.",
        hints: [
          "Блокировка защищает от случайного ввода. Для неё используется длительное нажатие.",
          "Ищите F/# в правом нижнем углу клавиатуры. Короткое нажатие включает вторичные функции.",
          "Удерживайте F/# около секунды. На экране появится индикатор блокировки. Такое же удержание снимает её.",
        ],
        explanation:
          "Клавиатурная блокировка не выключает приёмник. Регулятор и боковые органы управления по-прежнему доступны. Короткое F и удержание F имеют разные назначения.",
        setup: (previous) => base(previous),
        check: (s) =>
          ready(s) &&
          s.locked &&
          s.active === "A" &&
          s.banks.A.vfo.frequency === 145500000,
      },
    ],
  },
  {
    id: "frequency",
    title: "VFO, MR и выбор частоты",
    subtitle: "Прямая настройка и выбор сохранённого канала",
    tasks: [
      {
        id: "vfo-mode",
        title: "Из памяти — в VFO",
        description:
          "Строка A находится в MR. Переключите её в режим ручного ввода VFO.",
        hints: [
          "MR выбирает готовые ячейки, VFO позволяет задавать частоту.",
          "Вторичная функция VFO/MR подписана на клавише 3.",
          "Коротко нажмите F → 3. Рядом со строкой A больше не должно быть номера канала памяти.",
        ],
        explanation:
          "В MR цифры означают номер ячейки, а в VFO — частоту. Поэтому перед прямым вводом важно проверить режим именно активной строки.",
        setup: (previous) => {
          const s = base(previous);
          memory(s, 1, 145500000);
          s.banks.A.mode = "MR";
          return s;
        },
        check: (s) => ready(s) && s.active === "A" && s.banks.A.mode === "VFO",
      },
      {
        id: "river-frequency",
        title: "Речной канал около Долгопрудного",
        description:
          "Настройте строку A на 300.150 МГц в VFO. Название сценария и все его переговоры вымышлены.",
        hints: [
          "Частота задаёт положение приёмника в спектре. Здесь нужна точная настройка 300.150 МГц.",
          "Убедитесь, что выбрана строка A и режим VFO. Точка при вводе не нужна.",
          "Введите 3 → 0 → 0 → 1 → 5 → 0. На экране появится 300.150.",
        ],
        explanation:
          "Мегагерц — миллион колебаний в секунду. Разница 0.025 МГц равна 25 кГц. Сценарий помогает освоить настройку приёма; он не подтверждает, что на этой частоте сейчас работают реальные станции.",
        setup: (previous) => base(previous),
        check: (s) =>
          ready(s) &&
          s.active === "A" &&
          s.banks.A.mode === "VFO" &&
          getActiveChannel(s).frequency === RIVER,
      },
      {
        id: "memory-number",
        title: "Три цифры вместо частоты",
        description:
          "В MR выберите заранее подготовленную ячейку 012 с частотой 300.150 МГц.",
        hints: [
          "В канальном режиме вводится номер ячейки, а не частота.",
          "Нужная ячейка — 12. Номер на клавиатуре вводится тремя цифрами.",
          "В текущем MR нажмите 0 → 1 → 2. Проверьте номер 012 и частоту 300.150.",
        ],
        explanation:
          "Ячейка хранит частоту вместе с настройками канала. Ввод 012 выбирает всю сохранённую конфигурацию, в том числе полосу и фильтрацию тонов.",
        setup: (previous) => {
          const s = base(previous);
          memory(s, 1, 145500000);
          memory(s, 12);
          s.banks.A.mode = "MR";
          return s;
        },
        check: (s) =>
          ready(s) &&
          s.active === "A" &&
          s.banks.A.mode === "MR" &&
          s.banks.A.channel === 12 &&
          getActiveChannel(s).frequency === RIVER,
      },
      {
        id: "second-vfo",
        title: "Сохраните первую настройку",
        description:
          "Оставьте A на 300.150 МГц, а строку B настройте на 300.175 МГц. Завершите на активной строке B.",
        hints: [
          "Для второй частоты не нужно стирать первую: выберите другую строку.",
          "F → 2 меняет активную строку. Обе строки в этом задании находятся в VFO.",
          "Нажмите F → 2, затем 3 → 0 → 0 → 1 → 7 → 5. Проверьте обе строки.",
        ],
        explanation:
          "Каждая строка имеет собственную частоту и режим VFO/MR. Это удобно для подготовки двух направлений приёма; автоматическое наблюдение за ними включается отдельным пунктом TDR.",
        setup: (previous) => river(previous),
        check: (s) =>
          ready(s) &&
          s.active === "B" &&
          s.banks.A.vfo.frequency === RIVER &&
          s.banks.B.mode === "VFO" &&
          s.banks.B.vfo.frequency === 300175000,
      },
    ],
  },
  {
    id: "receiver",
    title: "Шаг и настройки приёмника",
    subtitle: "STEP, полоса, SQL и фильтрация тонов",
    tasks: [
      {
        id: "step-tune",
        title: "Один шаг — 25 кГц",
        description:
          "Установите STEP = 25 кГц и поднимитесь с 300.150 до 300.175 МГц.",
        hints: [
          "STEP определяет расстояние между соседними настройками при нажатии стрелки.",
          "Нужен пункт 02 STEP. Изменение шага само по себе не меняет текущую частоту.",
          "M → 0 → 2 → M; выберите 25K стрелками → M → EXIT. Затем нажмите ↑ один раз.",
        ],
        explanation:
          "Шаг 25 кГц — это 0.025 МГц. Он влияет на настройку стрелками и частотное сканирование. Шаг не равен ширине принимаемого сигнала: для полосы есть отдельное меню W/N.",
        setup: (previous) => river(previous),
        check: (s) =>
          ready(s) &&
          getActiveChannel(s).step === 25000 &&
          getActiveChannel(s).frequency === 300175000,
      },
      {
        id: "narrow-band",
        title: "Выберите узкую полосу",
        description:
          "Для подготовленного учебного канала установите W/N = NARROW и вернитесь к частотам.",
        hints: [
          "Полоса определяет, какую ширину спектра пропускает приёмник.",
          "Пункт 10 W/N выбирает WIDE или NARROW.",
          "M → 1 → 0 → M → ↑ → M → EXIT. На LCD появится N.",
        ],
        explanation:
          "WIDE и NARROW — разные полосы приёма FM. Несоответствие полосе передающей станции меняет громкость, искажения и восприимчивость к соседним сигналам. W/N не переключает FM на AM.",
        setup: (previous) => river(previous),
        check: (s) => ready(s) && getActiveChannel(s).bandwidth === "NARROW",
      },
      {
        id: "clear-tones",
        title: "Слушайте без фильтра по тону",
        description:
          "В приёмнике включён DCS. Отключите фильтрацию: R_DCS = OFF и R_CTCS = OFF.",
        hints: [
          "Сильный сигнал может оставаться беззвучным, если приёмник ожидает другой служебный тон.",
          "Приёмные фильтры — пункты 04 R_DCS и 05 R_CTCS. Передающие T_DCS/T_CTCS здесь не помогут.",
          "Откройте M → 0 → 4 → M, выберите OFF → M → EXIT. Проверьте, что 05 R_CTCS также OFF.",
        ],
        explanation:
          "CTCSS — непрерывный низкочастотный тон, DCS — цифровой код. Они управляют открытием звука, но не шифруют речь и не создают отдельную частоту. В этой модели, как в формате заводского канала CHIRP, на приём выбирается один тип кода.",
        setup: (previous) => {
          const s = river(previous);
          s.banks.A.vfo.rxDcs = "023N";
          return s;
        },
        check: (s) => ready(s) && clearTones(s),
      },
      {
        id: "squelch-reception",
        title: "Откройте приём сигнала",
        description:
          "На 300.150 МГц SQL слишком высок. Установите SQL = 2 и дождитесь слышимого учебного сеанса.",
        hints: [
          "Снижение SQL помогает слабому сигналу открыть динамик. Сеансы сменяются тишиной.",
          "Пункт 01 SQL сейчас равен 9. Нужен уровень 2, Monitor должен оставаться выключенным.",
          "M → M; выберите 2 стрелками → M → EXIT. Дождитесь очередного сеанса в пределах 12 секунд.",
        ],
        explanation:
          "Индикатор несущей и слышимый звук — разные признаки. Кроме SQL, звуку могут мешать тоновый фильтр, нулевая громкость или неверная модуляция. Здесь эти параметры уже исправны.",
        setup: (previous) => {
          const s = river(previous);
          s.settings.sql = 9;
          return s;
        },
        check: (s) =>
          ready(s) &&
          !s.monitor &&
          s.settings.sql === 2 &&
          getReception(s).audible &&
          getReception(s).frequency === RIVER,
      },
    ],
  },
  {
    id: "memories",
    title: "Память каналов",
    subtitle: "Запись, вызов, копирование и удаление",
    tasks: [
      {
        id: "save-channel",
        title: "Запишите канал 012",
        description:
          "Сохраните подготовленную частоту 300.150 МГц с WIDE и выключенными приёмными тонами в свободную ячейку 012.",
        hints: [
          "Память сохраняет текущую конфигурацию активной строки. До записи ячейка 012 в этом упражнении пуста.",
          "Используйте пункт 13 MEM-CH. Последнее подтверждение SURE? обязательно.",
          "M → 1 → 3 → M → 0 → 1 → 2 → M. На SURE? нажмите M ещё раз, затем EXIT.",
        ],
        explanation:
          "MEM-CH копирует частоту и параметры активного канала в выбранную ячейку. Появление SURE? ещё не означает, что запись произошла: её подтверждает следующее M.",
        setup: (previous) => {
          const s = river(previous);
          delete s.memories[12];
          return s;
        },
        check: (s) => ready(s) && storedRiver(s),
      },
      {
        id: "recall-channel",
        title: "Вызовите сохранённое",
        description:
          "Перейдите из VFO в MR и выберите ячейку 012. Её учебная запись уже подготовлена.",
        hints: [
          "Сохранение канала не требует постоянно оставаться на его частоте в VFO.",
          "F → 3 переключает режим, затем можно ввести номер памяти.",
          "F → 3, затем 0 → 1 → 2. Убедитесь, что выбран MR, канал 012 и 300.150 МГц.",
        ],
        explanation:
          "Вызов памяти восстанавливает и частоту, и связанные с ней настройки. Переключение обратно в VFO возвращает ранее сохранённую настройку VFO этой строки.",
        setup: (previous) => {
          const s = base(previous);
          memory(s, 1, 145500000);
          memory(s, 12);
          return s;
        },
        check: (s) =>
          ready(s) &&
          s.banks.A.mode === "MR" &&
          s.banks.A.channel === 12 &&
          getActiveChannel(s).frequency === RIVER,
      },
      {
        id: "copy-channel",
        title: "Создайте вторую копию",
        description:
          "Не выходя из MR, скопируйте выбранный канал 012 в свободную ячейку 021.",
        hints: [
          "MEM-CH работает и в MR: источником становится выбранная запись памяти.",
          "Откройте 13 MEM-CH и в качестве назначения укажите 021.",
          "M → 1 → 3 → M → 0 → 2 → 1 → M → M → EXIT. Исходный канал 012 должен сохраниться.",
        ],
        explanation:
          "Копия занимает другую ячейку. Это удобно, если одной частоте нужны разные тоновые фильтры или разные списки сканирования. Номер канала не является частотой.",
        setup: (previous) => {
          const s = river(previous);
          memory(s, 12);
          delete s.memories[21];
          s.banks.A.mode = "MR";
          s.banks.A.channel = 12;
          return s;
        },
        check: (s) => ready(s) && storedRiver(s, 12) && storedRiver(s, 21),
      },
      {
        id: "delete-channel",
        title: "Удалите только копию",
        description:
          "Удалите ячейку 021 через меню. Сохраните исходную запись 012.",
        hints: [
          "Для удаления одной ячейки не нужен общий RESET.",
          "Пункт 50 DEL_CH удаляет выбранную запись после подтверждения.",
          "M → 5 → 0 → M → 0 → 2 → 1 → M → M → EXIT. Ячейка 021 должна стать пустой.",
        ],
        explanation:
          "DEL_CH очищает конкретную ячейку памяти. Это отдельная операция с подтверждением, чтобы обычное перемещение по списку не уничтожало сохранённые настройки.",
        setup: (previous) => {
          const s = river(previous);
          memory(s, 12);
          memory(s, 21);
          s.banks.A.mode = "MR";
          s.banks.A.channel = 12;
          return s;
        },
        check: (s) => ready(s) && !s.memories[21] && storedRiver(s, 12),
      },
    ],
  },
  {
    id: "scanning",
    title: "Сканирование эфира",
    subtitle: "Поиск активности и два списка памяти",
    tasks: [
      {
        id: "scan-frequency",
        title: "Найдите активную частоту",
        description:
          "Начните частотное сканирование с 300.100 МГц и найдите учебную станцию на 300.150 МГц.",
        hints: [
          "Сканер перебирает частоты с выбранным STEP. В этом упражнении шаг и SQL уже подготовлены.",
          "Сканирование запускается удержанием *. F → * ищет субтоны и здесь не подходит.",
          "Удерживайте * около секунды. При направлении вниз нажмите ↑. Если прошли 300.150 во время тишины: EXIT → 300100; во вкладке «Эфир» дождитесь сеанса и повторите удержание *.",
        ],
        explanation:
          "В VFO сканируется последовательность частот внутри текущего диапазона. Станция обнаруживается только во время передачи. Пропущенный в тишине канал может появиться при следующем проходе.",
        setup: (previous) => scanFixture(previous),
        check: (s) =>
          ready(s) &&
          s.scan?.foundFrequency === RIVER &&
          getActiveChannel(s).frequency === RIVER,
      },
      {
        id: "scan-membership",
        title: "Добавьте запись в список 2",
        description:
          "Для выбранного канала памяти 012 включите участие в списке 2. Участие в списке 1 сохраните.",
        hints: [
          "Каждый канал может входить в один или сразу два списка.",
          "Пункт 26 S-ADD2 меняет участие текущей записи в списке 2; 25 S-ADD1 отвечает за список 1.",
          "M → 2 → 6 → M → ↑ → M → EXIT. У ячейки 012 должны быть включены оба списка.",
        ],
        explanation:
          "S-ADD1 и S-ADD2 задают состав списков. S-LIST выбирает, какой из них будет сканироваться. Добавление канала в список ещё не запускает поиск.",
        setup: (previous) => {
          const s = river(previous);
          memory(s, 12, RIVER, { list1: true, list2: false });
          s.banks.A.mode = "MR";
          s.banks.A.channel = 12;
          return s;
        },
        check: (s) =>
          ready(s) && !!s.memories[12]?.list1 && !!s.memories[12]?.list2,
      },
      {
        id: "scan-memory",
        title: "Просканируйте список 2",
        description:
          "Выберите S-LIST = LIST2 и запустите сканирование памяти. Найдите канал 012 на 300.150 МГц.",
        hints: [
          "В MR сканер перебирает сохранённые записи, включённые в выбранный список.",
          "Нужен пункт 31 S-LIST. В списке 2 этого упражнения подготовлены только каналы 012 и 013.",
          "M → 3 → 1 → M → ↑ → M → EXIT; удерживайте *. Дождитесь обнаружения канала 012.",
        ],
        explanation:
          "Если нужный канал не входит в выбранный список, MR-сканер его не проверит. Для проверки состава на рации есть пункты 32 SLIST1 и 33 SLIST2.",
        setup: (previous) => {
          const s = river(previous);
          s.memories = {};
          memory(s, 12, RIVER, { list2: true });
          memory(s, 13, 300175000, { list2: true });
          s.banks.A.mode = "MR";
          s.banks.A.channel = 13;
          return s;
        },
        check: (s) =>
          ready(s) &&
          s.settings.scanList === 2 &&
          s.banks.A.mode === "MR" &&
          s.banks.A.channel === 12 &&
          s.scan?.foundFrequency === RIVER,
      },
      {
        id: "scan-stop",
        title: "Остановитесь после обнаружения",
        description:
          "Установите SC-REV = SE, затем найдите 300.150 МГц сканированием. Сканер должен завершить поиск на сигнале.",
        hints: [
          "Режим возобновления определяет, продолжится ли поиск после найденной передачи.",
          "Пункт 22 SC-REV: TO — пауза 5 секунд, CO — ожидание конца сигнала, SE — завершение поиска.",
          "M → 2 → 2 → M; выберите SE → M → EXIT. Запустите удержанием * во время сеанса (виден во вкладке «Эфир»). Если пропустили частоту: EXIT → 300100 и повторите.",
        ],
        explanation:
          "SE фиксирует найденную частоту и прекращает сканирование. В CO сканер ждёт исчезновения сигнала, а TO возобновляет поиск после пятисекундной паузы.",
        setup: (previous) => scanFixture(previous),
        check: (s) =>
          ready(s) &&
          s.settings.scanResume === "SE" &&
          s.scan?.active === false &&
          s.scan.foundFrequency === RIVER &&
          getActiveChannel(s).frequency === RIVER,
      },
    ],
  },
  {
    id: "dual-watch",
    title: "Два канала и Dual Watch",
    subtitle: "Две настройки, один приёмный тракт",
    tasks: [
      {
        id: "dual-prepare",
        title: "Подготовьте вторую частоту",
        description:
          "Оставьте A на 145.525 МГц, установите B на 300.150 МГц и снова сделайте A активной.",
        hints: [
          "У каждой строки своя настройка, но изменение применяется только к активной.",
          "Сначала F → 2 выберет B; после ввода снова выберите A.",
          "F → 2 → 3 → 0 → 0 → 1 → 5 → 0 → F → 2. Проверьте обе частоты и стрелку A.",
        ],
        explanation:
          "Две строки заранее готовят два направления приёма. По умолчанию с выключенным TDR прослушивается активная строка. Для автоматического наблюдения за обеими нужна следующая настройка.",
        setup: (previous) => {
          const s = base(previous);
          s.banks.A.vfo.frequency = 145525000;
          return s;
        },
        check: (s) =>
          ready(s) &&
          s.active === "A" &&
          getActiveChannel(s, "A").frequency === 145525000 &&
          getActiveChannel(s, "B").frequency === RIVER,
      },
      {
        id: "dual-enable",
        title: "Включите Dual Watch",
        description:
          "Включите TDR = CHAN_A. Обе частоты уже настроены; строка A должна остаться активной.",
        hints: [
          "Dual Watch поочерёдно наблюдает за двумя строками. Это не два одновременных приёмника.",
          "Пункт 17 TDR имеет значения OFF, CHAN_A и CHAN_B.",
          "M → 1 → 7 → M → ↑ → M → EXIT. На LCD появится DW.",
        ],
        explanation:
          "CHAN_A включает наблюдение за A и B и задаёт A как канал передачи по умолчанию в подтверждённой заводской логике. В этом приложении PTT остаётся только симуляцией.",
        setup: (previous) => dualFixture(previous),
        check: (s) =>
          ready(s) && s.active === "A" && s.settings.tdr === "CHAN_A",
      },
      {
        id: "dual-hear-b",
        title: "Услышьте B, оставаясь на A",
        description:
          "TDR включён, но у B неверный CTCSS. Снимите его, вернитесь на A и дождитесь слышимого сеанса на B.",
        hints: [
          "Тоновые фильтры принадлежат конкретной строке. Исправление фильтра A не поможет строке B.",
          "Выберите B и отключите 05 R_CTCS. Затем снова выберите A.",
          "F → 2; M → 0 → 5 → M, выберите OFF → M → EXIT; F → 2. Дождитесь приёма B.",
        ],
        explanation:
          "Приём на B возможен, когда активная для управления строка A молчит. В тренажёре единый приёмник отдаёт приоритет активной строке, а затем проверяет вторую; радиофизические задержки переключения упрощены.",
        setup: (previous) => {
          const s = dualFixture(previous);
          s.settings.tdr = "CHAN_A";
          s.banks.B.vfo.rxCtcss = 88.5;
          return s;
        },
        check: (s) =>
          ready(s) &&
          s.active === "A" &&
          s.settings.tdr === "CHAN_A" &&
          s.banks.B.vfo.rxCtcss === null &&
          getReception(s).bank === "B" &&
          getReception(s).audible,
      },
      {
        id: "dual-disable",
        title: "Вернитесь к одному каналу",
        description:
          "Отключите TDR, сохранив A = 145.525 и B = 300.150 МГц. Активной оставьте A.",
        hints: [
          "Отключение наблюдения не должно стирать вторую настройку.",
          "В пункте 17 TDR выберите OFF.",
          "M → 1 → 7 → M → ↓ → M → EXIT. Индикатор DW исчезнет, обе частоты останутся.",
        ],
        explanation:
          "Когда TDR выключен, для приёма другой строки её нужно выбрать через F → 2. Это позволяет осознанно сосредоточиться на одном канале.",
        setup: (previous) => {
          const s = dualFixture(previous);
          s.settings.tdr = "CHAN_A";
          return s;
        },
        check: (s) =>
          ready(s) &&
          s.active === "A" &&
          s.settings.tdr === "OFF" &&
          getActiveChannel(s, "A").frequency === 145525000 &&
          getActiveChannel(s, "B").frequency === RIVER,
      },
    ],
  },
  {
    id: "diagnostics",
    title: "Поиск и устранение ошибок",
    subtitle: "Сигнал есть, а звука нет: четыре причины",
    tasks: [
      {
        id: "fix-volume",
        title: "Проверьте звуковой тракт",
        description:
          "Радиостанция включена и настроена на 300.150 МГц. Восстановите громкость до 35–80%, не меняя частоту.",
        hints: [
          "Начинайте диагностику с простых причин. Дисплей может работать при почти закрытой громкости.",
          "Проверьте верхний регулятор громкости.",
          "Установите громкость около 55%. Частота должна остаться 300.150 МГц.",
        ],
        explanation:
          "Громкость управляет уровнем в динамике после приёма сигнала. Высокий SQL или несовпадение тона этим регулятором не исправить; здесь единственная неисправность — нулевая громкость.",
        setup: (previous) => {
          const s = river(previous);
          s.volume = 0;
          return s;
        },
        check: (s) =>
          ready(s) &&
          s.volume >= 0.35 &&
          s.volume <= 0.8 &&
          getActiveChannel(s).frequency === RIVER,
      },
      {
        id: "fix-squelch",
        title: "Верните разумный порог",
        description:
          "SQL = 9 закрывает динамик. Установите SQL = 2, сохранив 300.150 МГц и выключенный Monitor.",
        hints: [
          "SQL не усиливает сигнал: он решает, когда разрешить звук.",
          "Исправьте пункт 01 SQL. Monitor обходит фильтры, но не исправляет саму настройку.",
          "M → M; выберите 2 → M → EXIT. Не включайте боковой Monitor.",
        ],
        explanation:
          "В диагностике Monitor полезен для проверки наличия звука, но постоянно обходить им проблему неудобно. Правильное решение здесь — подобрать порог шумоподавителя.",
        setup: (previous) => {
          const s = river(previous);
          s.settings.sql = 9;
          return s;
        },
        check: (s) =>
          ready(s) &&
          !s.monitor &&
          s.settings.sql === 2 &&
          getActiveChannel(s).frequency === RIVER,
      },
      {
        id: "fix-ctcss",
        title: "Уберите чужой субтон",
        description:
          "На речном учебном канале ожидается CTCSS 88.5 Гц, которого в сигнале нет. Отключите приёмный фильтр.",
        hints: [
          "Индикатор сигнала может появляться, хотя тоновый фильтр не открывает динамик.",
          "Исправьте именно 05 R_CTCS; T_CTCS влияет только на передаваемый тон.",
          "M → 0 → 5 → M; выберите OFF → M → EXIT. R_DCS также должен остаться OFF.",
        ],
        explanation:
          "Приёмник с R_CTCS = 88.5 воспроизводит только сигналы с соответствующим тоном. Если он неизвестен или отсутствует, приёмный тон отключают. Это не настройка приватности.",
        setup: (previous) => {
          const s = river(previous);
          s.banks.A.vfo.rxCtcss = 88.5;
          return s;
        },
        check: (s) =>
          ready(s) &&
          !s.monitor &&
          clearTones(s) &&
          getActiveChannel(s).frequency === RIVER,
      },
      {
        id: "fix-frequency",
        title: "Исправьте соседнюю частоту",
        description:
          "Приёмник оказался на 300.175 МГц. Верните 300.150 МГц, сохранив STEP = 25 кГц, SQL = 2 и выключенные тоны.",
        hints: [
          "Неверную частоту не исправят громкость, мощность или субтоны.",
          "До нужной настройки один шаг вниз: текущий STEP равен 25 кГц.",
          "Нажмите ↓ один раз. Проверьте 300.150 МГц, STEP 25K и SQL 2.",
        ],
        explanation:
          "Соседние каналы разделены по частоте. Шаг стрелки помогает исправить небольшую ошибку настройки. Мощность TXP не улучшает приём и в этой ситуации не нужна.",
        setup: (previous) => {
          const s = river(previous);
          s.banks.A.vfo.frequency = 300175000;
          s.banks.A.vfo.step = 25000;
          return s;
        },
        check: (s) =>
          ready(s) &&
          getActiveChannel(s).frequency === RIVER &&
          getActiveChannel(s).step === 25000 &&
          s.settings.sql === 2 &&
          clearTones(s),
      },
    ],
  },
  {
    id: "chirp",
    title: "Подготовка к работе с CHIRP",
    subtitle: "Данные каналов, копия настроек и порядок чтения",
    tasks: [
      {
        id: "chirp-memory",
        title: "Подготовьте запись для таблицы",
        description:
          "Запишите 300.150 МГц с WIDE и без приёмных тонов в ячейку 012. Она станет примером строки таблицы CHIRP.",
        hints: [
          "CHIRP работает с сохранёнными каналами и настройками устройства. Сначала подготовьте понятную запись.",
          "Проверьте активную VFO-конфигурацию и используйте 13 MEM-CH.",
          "M → 1 → 3 → M → 0 → 1 → 2 → M → M → EXIT.",
        ],
        explanation:
          "В таблице CHIRP номер, частота, модуляция и тоновый режим — отдельные поля. Для выбранных заводских UV-K5/UV-K5(8) используется соответствующий драйвер Quansheng UV-K5. Драйверы альтернативных прошивок сюда не подмешиваются.",
        setup: (previous) => {
          const s = river(previous);
          delete s.memories[12];
          return s;
        },
        check: (s) => ready(s) && storedRiver(s),
      },
      {
        id: "chirp-backup",
        title: "Сохраните исходные данные",
        description:
          "Скачайте JSON-копию текущего симулятора кнопкой «Копия JSON» в панели памяти. Она должна содержать подготовленный канал 012.",
        hints: [
          "До изменений полезно иметь копию исходной конфигурации. Здесь проверяется содержимое скачиваемых данных.",
          "В панели памяти есть отдельная команда «Копия JSON». Это файл тренажёра.",
          "Откройте панель памяти и нажмите «Копия JSON». Если меняли каналы после копии, скачайте её заново.",
        ],
        explanation:
          "На реальной рации сначала выполняют Radio → Download From Radio, затем сохраняют исходный образ .img. В тренажёре скачивается собственный JSON; это не EEPROM, не прошивка и не образ для записи в радиостанцию.",
        setup: (previous) => {
          const s = river(previous);
          memory(s, 12);
          return s;
        },
        check: (s, context) => matchingBackup(s, context?.backupJson),
      },
      {
        id: "chirp-power",
        title: "Подготовьте рацию к чтению",
        description:
          "Включите радиостанцию, оставьте PTT отпущенной и клавиатуру разблокированной. Кабель в этом приложении не подключается.",
        hints: [
          "У заводского драйвера есть конкретный порядок: сначала включить прибор, затем вставить программирующий кабель в mic/spkr.",
          "Сейчас прибор выключен. Для чтения с компьютера нужна включённая рация в состоянии приёма.",
          "Включите верхний регулятор. Не удерживайте PTT. Если виден замок, удержанием F/# снимите блокировку.",
        ],
        explanation:
          "Подсказка драйвера uvk5.py требует включить рацию до подключения mic/spkr-кабеля. В CHIRP затем выбирают фактический последовательный порт, производителя и подходящую модель, выполняют Download From Radio и сохраняют .img. Обычный USB-C у рассмотренной классической модели служит зарядке.",
        setup: (previous) => {
          const s = river(previous);
          s.power = false;
          return s;
        },
        check: (s) => ready(s) && !s.ptt && !s.locked,
      },
      {
        id: "chirp-export",
        title: "Выгрузите таблицу каналов",
        description:
          "Экспортируйте текущую память в учебный CSV кнопкой «Таблица CSV». Проверьте в файле ячейку 012 и частоту 300.150.",
        hints: [
          "Таблица каналов и полный образ радиостанции решают разные задачи.",
          "В панели памяти выберите «Таблица CSV». Выгружаются реальные записи памяти симулятора.",
          "Нажмите «Таблица CSV». Файл должен содержать колонку Frequency и строку для 012 с 300.150000.",
        ],
        explanation:
          "Этот CSV — учебная таблица, а не готовый образ или файл импорта CHIRP. В самом CHIRP CSV импортируют в считанный образ своей рации; напрямую загрузить CSV в устройство нельзя. Копия .img хранит больше настроек, чем список каналов.",
        setup: (previous) => {
          const s = river(previous);
          memory(s, 12);
          return s;
        },
        check: (s, context) =>
          storedRiver(s) &&
          typeof context?.exportCsv === "string" &&
          context.exportCsv === buildTrainingCsv(s),
      },
    ],
  },
];

export function evaluateTask(
  task: LessonTask,
  state: RadioState,
  context: LessonContext = {},
): boolean {
  return task.check(state, context);
}

export function getTaskById(id: string): LessonTask | undefined {
  return CHAPTERS.flatMap((chapter) => chapter.tasks).find(
    (task) => task.id === id,
  );
}
