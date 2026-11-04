import { useEffect, useRef, useState, useReducer } from "react";
import {
  RadioTower,
  Volume2,
  VolumeX,
  CircleHelp,
  ArrowRight,
  Check,
  RotateCcw,
  Lightbulb,
  BookOpen,
  Download,
  Upload,
  ChevronRight,
  X,
  Activity,
  HardDrive,
  Keyboard,
  Headphones,
  Radio as RadioIcon,
} from "lucide-react";
import { Radio, frequencyText } from "./components/Radio";
import { KEY_HELP } from "./components/keyHelp";
import {
  createInitialState,
  createChannel,
  radioReducer,
  getActiveChannel,
  getReception,
  MENUS,
  type RadioState,
  type RadioAction,
} from "./model/radio";
import { deserializeRadio, serializeRadio } from "./model/persistence";
import { getAirSnapshot } from "./air/ether";
import { RadioAudio } from "./air/audio";
import {
  CHAPTERS,
  evaluateTask,
  buildTrainingCsv,
  type LessonContext,
} from "./lessons";
import { useRadioKeyboard } from "./hooks/useRadioKeyboard";
import sourcesUrl from "../docs/SOURCES.md?url";
import mapUrl from "../docs/CONTROL_MAP.md?url";

type Mode = "learn" | "free";
type Panel = "lesson" | "air" | "memory" | "reference";
const PREFIX = "quansheng-academy:v1:";
function read(key: string) {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}
function progress() {
  try {
    const p = JSON.parse(read("progress") || "{}");
    return {
      mode: p.mode === "free" ? ("free" as Mode) : ("learn" as Mode),
      chapter:
        Number.isInteger(p.chapter) &&
        p.chapter >= 0 &&
        p.chapter < CHAPTERS.length
          ? p.chapter
          : 0,
      task: Number.isInteger(p.task) && p.task >= 0 && p.task < 4 ? p.task : 0,
      completed: Array.isArray(p.completed)
        ? (Array.from(
            new Set(
              p.completed.filter(
                (x: unknown) =>
                  typeof x === "string" &&
                  CHAPTERS.some((c) => c.tasks.some((t) => t.id === x)),
              ),
            ),
          ) as string[])
        : [],
    };
  } catch {
    return {
      mode: "learn" as Mode,
      chapter: 0,
      task: 0,
      completed: [] as string[],
    };
  }
}
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const TOTAL = CHAPTERS.reduce((n, c) => n + c.tasks.length, 0);

export default function App() {
  const [initial] = useState(progress);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [chapterIndex, setChapter] = useState(initial.chapter);
  const [taskIndex, setTask] = useState(initial.task);
  const [completed, setCompleted] = useState<string[]>(initial.completed);
  const chapter = CHAPTERS[chapterIndex],
    task = chapter.tasks[taskIndex];
  const [state, dispatch] = useReducer(radioReducer, undefined, () => {
    const saved = read(`radio-${initial.mode}`);
    return saved
      ? deserializeRadio(saved)
      : initial.mode === "learn"
        ? task.setup(createInitialState())
        : createInitialState();
  });
  const [panel, setPanel] = useState<Panel>(
    mode === "learn" ? "lesson" : "air",
  );
  const [hint, setHint] = useState(0),
    [theory, setTheory] = useState(false),
    [done, setDone] = useState(false);
  const [context, setContext] = useState<LessonContext>({});
  const [helpMode, setHelpMode] = useState(false),
    [help, setHelp] = useState("");
  const [audioOn, setAudioOn] = useState(false),
    [toast, setToast] = useState("");
  const [storageOK, setStorageOK] = useState(true),
    [sidebar, setSidebar] = useState(false);
  const [referenceSearch, setReferenceSearch] = useState("");
  const [revealAir, setRevealAir] = useState(false);
  const audio = useRef<RadioAudio | null>(null),
    fileRef = useRef<HTMLInputElement>(null);
  const current = useRef(state);
  current.current = state;
  const rx = getReception(state);
  const menu = MENUS[state.ui.menuId - 1];
  const persistent = serializeRadio(state);
  const snapshots = getAirSnapshot(state.clockMs);

  useEffect(() => {
    setStorageOK(write(`radio-${mode}`, persistent));
  }, [mode, persistent]);
  useEffect(() => {
    write(
      "progress",
      JSON.stringify({
        mode,
        chapter: chapterIndex,
        task: taskIndex,
        completed,
      }),
    );
  }, [mode, chapterIndex, taskIndex, completed]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) dispatch({ type: "TICK", ms: 100 });
    }, 100);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (mode === "learn" && !done && evaluateTask(task, state, context)) {
      setDone(true);
      setCompleted((list) =>
        list.includes(task.id) ? list : [...list, task.id],
      );
      audio.current?.beep(1400, 0.14, 0.1);
    }
  }, [state, mode, task, done, context]);
  useEffect(() => {
    if (audioOn)
      audio.current?.update(
        rx,
        document.hidden ? 0 : state.volume,
        state.clockMs,
        state.alarm,
      );
  }, [
    audioOn,
    rx.audible,
    rx.noise,
    rx.quality,
    state.volume,
    state.clockMs,
    state.alarm,
  ]);
  useEffect(() => {
    const silence = () => {
      if (document.hidden)
        audio.current?.update(
          { ...getReception(current.current), audible: false },
          0,
          current.current.clockMs,
          false,
        );
    };
    document.addEventListener("visibilitychange", silence);
    return () => document.removeEventListener("visibilitychange", silence);
  }, []);
  useEffect(
    () => () => {
      void audio.current?.stop();
    },
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const send = (a: RadioAction) => {
    if (a.type === "KEY" && helpMode) {
      setHelp(KEY_HELP[a.key]);
      return;
    }
    if (a.type === "KEY" && state.power && state.settings.beep)
      audio.current?.beep(a.long ? 800 : 1100);
    if (state.power && a.type === "KEY" && a.key === "SK1" && a.long)
      audio.current?.beep(1750, 0.35, 0.15);
    dispatch(a);
  };
  useRadioKeyboard(send, () =>
    dispatch({ type: "POWER", on: !current.current.power }),
  );
  const startTask = (ci: number, ti: number) => {
    if (mode === "free") write("radio-free", serializeRadio(state));
    setMode("learn");
    setChapter(ci);
    setTask(ti);
    setPanel("lesson");
    setHint(0);
    setTheory(false);
    setDone(false);
    setContext({});
    setHelpMode(false);
    setSidebar(false);
    dispatch({ type: "LOAD", state: CHAPTERS[ci].tasks[ti].setup(state) });
  };
  const changeMode = (next: Mode) => {
    if (next === mode) return;
    write(`radio-${mode}`, serializeRadio(state));
    setMode(next);
    setHelpMode(false);
    setPanel(next === "learn" ? "lesson" : "air");
    const saved = read(`radio-${next}`);
    dispatch({
      type: "LOAD",
      state: saved
        ? deserializeRadio(saved)
        : next === "learn"
          ? task.setup(state)
          : createInitialState(),
    });
    setDone(false);
    setContext({});
  };
  const nextTask = () => {
    if (taskIndex + 1 < chapter.tasks.length)
      startTask(chapterIndex, taskIndex + 1);
    else if (chapterIndex + 1 < CHAPTERS.length) startTask(chapterIndex + 1, 0);
    else {
      setToast("Все главы пройдены. Свободная лаборатория открыта.");
      changeMode("free");
    }
  };
  const toggleAudio = async () => {
    if (audioOn) {
      await audio.current?.stop();
      setAudioOn(false);
    } else {
      try {
        audio.current ??= new RadioAudio();
        await audio.current.start();
        setAudioOn(true);
      } catch {
        setToast("Браузер не разрешил аудио. Нажмите «Звук» ещё раз.");
      }
    }
  };
  const riverScenario = () => {
    const s = createInitialState();
    s.power = true;
    s.volume = 0.55;
    s.banks.A.vfo = createChannel(300150000);
    s.banks.B.vfo = createChannel(300200000);
    s.settings.sql = 2;
    s.memories = structuredClone(state.memories);
    s.ui.notice =
      "Речной канал около Долгопрудного · 300.150 МГц. Все реплики вымышлены.";
    dispatch({ type: "LOAD", state: s });
    setToast("Речной сценарий загружен. Приём: 5 с, пауза: 7 с.");
  };
  const backup = () => {
    const json = serializeRadio(state);
    download(json, "quansheng-academy-backup.json", "application/json");
    setContext((c) => ({ ...c, backupJson: json }));
    setToast("JSON-копия симулятора подготовлена к скачиванию.");
  };
  const exportCsv = () => {
    const csv = buildTrainingCsv(state);
    download(
      "\uFEFF" + csv,
      "quansheng-academy-channels.csv",
      "text/csv;charset=utf-8",
    );
    setContext((c) => ({ ...c, exportCsv: csv }));
    setToast("Учебная таблица каналов подготовлена к скачиванию.");
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 1000000) throw Error("Файл слишком большой.");
      const text = await file.text(),
        parsed = JSON.parse(text);
      if (parsed.version !== 1 || !parsed.banks || !parsed.memories)
        throw Error("Нужна JSON-копия Quansheng Academy v1.");
      write("before-import", serializeRadio(state));
      dispatch({ type: "LOAD", state: deserializeRadio(text) });
      setToast(
        "Копия восстановлена. Предыдущие настройки доступны по кнопке отмены импорта.",
      );
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Не удалось прочитать файл.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const progressPercent = Math.round((completed.length / TOTAL) * 100);
  return (
    <div className="academy">
      <header className="app-header">
        <button
          className="mobile-menu"
          onClick={() => setSidebar(!sidebar)}
          aria-label="Открыть главы"
        >
          <BookOpen size={20} />
        </button>
        <div className="brand">
          <div className="brand-mark">
            <RadioTower size={22} />
          </div>
          <div>
            <b>
              QUANSHENG <em>ACADEMY</em>
            </b>
            <small>ПРАКТИЧЕСКАЯ ШКОЛА РАДИОСВЯЗИ</small>
          </div>
        </div>
        <div className="mode-switch" aria-label="Режим приложения">
          <button
            className={mode === "learn" ? "active" : ""}
            onClick={() => changeMode("learn")}
          >
            Обучение
          </button>
          <button
            className={mode === "free" ? "active" : ""}
            onClick={() => changeMode("free")}
          >
            Свободный эфир
          </button>
        </div>
        <div className="local-status">
          <i /> ЛОКАЛЬНО <span> / </span> STOCK FW
        </div>
      </header>
      <div className="workspace">
        <nav
          className={`curriculum ${sidebar ? "mobile-open" : ""}`}
          aria-label="Учебные главы"
        >
          <div className="device-badge">
            <RadioIcon size={19} />
            <div>
              <strong>UV-K5 / UV-K5(8)</strong>
              <small>Заводское управление · 2023</small>
            </div>
          </div>
          <div className="curriculum-label">
            ПРОГРАММА <span>08 ГЛАВ</span>
          </div>
          <div className="chapter-list">
            {CHAPTERS.map((c, ci) => {
              const count = c.tasks.filter((t) =>
                completed.includes(t.id),
              ).length;
              return (
                <button
                  key={c.id}
                  className={`chapter-button ${mode === "learn" && ci === chapterIndex ? "active" : ""}`}
                  onClick={() => startTask(ci, 0)}
                >
                  <span
                    className={`chapter-number ${count === c.tasks.length ? "finished" : ""}`}
                  >
                    {count === c.tasks.length ? (
                      <Check size={15} />
                    ) : (
                      String(ci + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>
                    {c.title}
                    <small>
                      {count}/{c.tasks.length} практики
                    </small>
                  </span>
                  {ci === chapterIndex && mode === "learn" && (
                    <ChevronRight size={14} />
                  )}
                </button>
              );
            })}
          </div>
          <div className="course-progress">
            <div>
              <span>Ваш прогресс</span>
              <b>{progressPercent}%</b>
            </div>
            <div className="progress-track">
              <i style={{ width: `${progressPercent}%` }} />
            </div>
            <small>
              {completed.length} из {TOTAL} практик выполнено
            </small>
          </div>
          <div className="sidebar-bottom">
            <button
              onClick={() => {
                setPanel("reference");
                setSidebar(false);
              }}
            >
              <BookOpen size={15} /> Справочник управления
            </button>
            <a href={sourcesUrl} target="_blank" rel="noreferrer">
              Источники и достоверность ↗
            </a>
            <span>
              Радиопередача отсутствует.
              <br />
              Весь эфир создан для обучения.
            </span>
          </div>
        </nav>
        <main className="bench">
          <div className="bench-heading">
            <div>
              <span className="eyebrow">
                {mode === "learn"
                  ? `${String(chapterIndex + 1).padStart(2, "0")} / УЧЕБНАЯ ПРАКТИКА`
                  : "ЛАБОРАТОРИЯ / СВОБОДНЫЙ РЕЖИМ"}
              </span>
              <h1>
                {mode === "learn" ? chapter.title : "Эфир начинается с частоты"}
              </h1>
              <p>
                {mode === "learn"
                  ? chapter.subtitle
                  : "Настраивайте, слушайте, экспериментируйте."}
              </p>
            </div>
            <span className="hardware-tag">
              UV-K5
              <br />
              <b>STOCK</b>
            </span>
          </div>
          <div className="mobile-task-summary">
            {mode === "learn" && (
              <details>
                <summary>
                  {done ? "✓ " : "Практика: "}
                  {task.title}
                </summary>
                <p>{task.description}</p>
                <button
                  onClick={() => {
                    setHelp(task.hints[Math.min(hint, 2)]);
                    setHint(Math.min(hint + 1, 3));
                  }}
                >
                  Подсказка
                </button>
                {done && <button onClick={nextTask}>Дальше →</button>}
              </details>
            )}
          </div>
          <div className="bench-toolbar">
            <button className={audioOn ? "selected" : ""} onClick={toggleAudio}>
              {audioOn ? <Volume2 size={15} /> : <VolumeX size={15} />} Звук{" "}
              {audioOn ? "вкл." : "выкл."}
            </button>
            <button
              className={helpMode ? "selected" : ""}
              onClick={() => setHelpMode(!helpMode)}
            >
              <CircleHelp size={15} />{" "}
              {helpMode ? "Выберите клавишу" : "Справка по кнопке"}
            </button>
          </div>
          <div className="device-stage">
            <div className="stage-label left">
              <span>01—</span> ПРИЁМНИК
              <br />
              ОДИН КАНАЛ ЗА РАЗ
            </div>
            <Radio
              state={state}
              dispatch={send}
              reception={rx}
              menus={MENUS}
              helpMode={helpMode}
              onHelp={setHelp}
            />
            <div className="stage-label right">
              {state.power ? "ПИТАНИЕ ВКЛ." : "ПИТАНИЕ ВЫКЛ."}
              <br />
              <span>
                {state.power
                  ? `${Math.round(state.volume * 100)}% VOL`
                  : "ПОВЕРНИТЕ РУЧКУ"}
              </span>
            </div>
          </div>
          <div className="volume-control">
            <VolumeX size={14} />
            <input
              aria-label="Громкость"
              type="range"
              min="0"
              max="100"
              value={Math.round(state.volume * 100)}
              onChange={(e) =>
                send({ type: "VOLUME", value: Number(e.target.value) / 100 })
              }
            />
            <Volume2 size={16} />
            <output>{Math.round(state.volume * 100)}%</output>
          </div>
          <div className="bench-note">
            <Keyboard size={13} /> Цифры · ↑ ↓ · M · Esc · F → цифра
            <br />
            <span>Удержание: 0,65 с · Пробел: PTT · Q / E: боковые</span>
          </div>
          <div
            className={`device-notice ${state.ptt ? "transmitting" : ""}`}
            role="status"
          >
            <span className="notice-indicator" />
            <span>
              {state.ptt
                ? state.ui.notice
                : state.ui.screen === "menu"
                  ? `${String(menu.id).padStart(2, "0")} ${menu.name} · ${menu.title}${!menu.implemented ? " — не реализовано" : ""}`
                  : state.ui.notice}
            </span>
            {state.ui.screen === "menu" && (
              <button
                aria-label="Справка по текущему меню"
                onClick={() =>
                  setHelp(`${menu.name} — ${menu.title}. ${menu.description}`)
                }
              >
                <CircleHelp size={16} />
              </button>
            )}
          </div>
          {!storageOK && (
            <p className="storage-warning">
              Браузер запретил локальное сохранение. Используйте копию JSON.
            </p>
          )}
          <div className="bench-footer">
            <span>ПРОФИЛЬ ЗАВОДСКОЙ ПРОШИВКИ</span>
            <span>ПЕРЕДАТЧИК: ИМИТАЦИЯ</span>
          </div>
        </main>
        <aside className="instructor">
          <div
            className="panel-tabs"
            role="tablist"
            aria-label="Панели инструментов"
          >
            {(
              [
                ["lesson", "Урок"],
                ["air", "Эфир"],
                ["memory", "Память"],
                ["reference", "Справка"],
              ] as [Panel, string][]
            ).map(([p, label]) => (
              <button
                key={p}
                role="tab"
                aria-selected={panel === p}
                className={panel === p ? "active" : ""}
                onClick={() => setPanel(p)}
              >
                {label}
                {p === "lesson" && done && <i />}
              </button>
            ))}
          </div>
          <div className="panel-content">
            {panel === "lesson" && (
              <>
                {mode === "learn" ? (
                  <>
                    <div className="section-kicker">
                      <span className="eyebrow">ИНСТРУКТОР</span>
                      <span>
                        {String(taskIndex + 1).padStart(2, "0")} /{" "}
                        {String(chapter.tasks.length).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="task-steps">
                      {chapter.tasks.map((t, i) => (
                        <button
                          key={t.id}
                          onClick={() => startTask(chapterIndex, i)}
                          className={`${i === taskIndex ? "active" : ""} ${completed.includes(t.id) ? "complete" : ""}`}
                          aria-label={`Практика ${i + 1}: ${t.title}`}
                        >
                          {completed.includes(t.id) ? (
                            <Check size={13} />
                          ) : (
                            String(i + 1).padStart(2, "0")
                          )}
                        </button>
                      ))}
                    </div>
                    <h2>{task.title}</h2>
                    <p className="task-description">{task.description}</p>
                    <div
                      className={`task-status ${done ? "complete" : ""}`}
                      aria-live="polite"
                    >
                      <span>
                        {done ? <Check size={17} /> : <Activity size={17} />}
                      </span>
                      <div>
                        <strong>
                          {done
                            ? "Задание выполнено"
                            : "Ждём нужного состояния"}
                        </strong>
                        <small>
                          {done
                            ? "Параметры симулятора проверены."
                            : "Управляйте кнопками на корпусе."}
                        </small>
                      </div>
                    </div>
                    {done && (
                      <button className="primary next-task" onClick={nextTask}>
                        {chapterIndex === CHAPTERS.length - 1 && taskIndex === 3
                          ? "Завершить курс"
                          : "Следующая практика"}
                        <ArrowRight size={17} />
                      </button>
                    )}
                    <div className="instructor-actions">
                      <button
                        onClick={() => setHint(Math.min(3, hint + 1))}
                        disabled={hint === 3}
                      >
                        <Lightbulb size={16} /> Подсказка{" "}
                        <small>{hint}/3</small>
                      </button>
                      <button
                        onClick={() => setTheory(!theory)}
                        aria-expanded={theory}
                      >
                        <BookOpen size={16} /> Почему это работает?
                      </button>
                    </div>
                    {hint > 0 && (
                      <div className="hint-block">
                        {task.hints.slice(0, hint).map((h, i) => (
                          <p key={h}>
                            <b>0{i + 1}</b>
                            {h}
                          </p>
                        ))}
                      </div>
                    )}
                    {theory && (
                      <div className="theory-block">
                        <span className="eyebrow">ПРИНЦИП РАБОТЫ</span>
                        <p>{task.explanation}</p>
                      </div>
                    )}
                    <button
                      className="text-button restart"
                      onClick={() => startTask(chapterIndex, taskIndex)}
                    >
                      <RotateCcw size={13} /> Начать практику заново
                    </button>
                    <p className="small-print">
                      Каждая практика подготавливает исходные настройки. Память
                      свободного режима хранится отдельно.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="eyebrow">ОТКРЫТАЯ ЛАБОРАТОРИЯ</span>
                    <h2>Исследуйте рацию</h2>
                    <p>
                      Здесь нет заданий. Настройте любую частоту, откройте меню,
                      сохраните канал и запустите сканирование.
                    </p>
                    <button
                      className="primary"
                      onClick={() => startTask(chapterIndex, taskIndex)}
                    >
                      Вернуться к практике <ArrowRight size={16} />
                    </button>
                  </>
                )}
                <History entries={state.history} />
              </>
            )}
            {panel === "air" && (
              <>
                <div className="section-kicker">
                  <span className="eyebrow">ВИРТУАЛЬНЫЙ ЭФИР</span>
                  <span className="live-dot">SIM</span>
                </div>
                <h2>
                  Речной канал
                  <br />
                  около Долгопрудного
                </h2>
                <p className="subtle">300.150 МГц · вымышленный сценарий</p>
                <p>
                  Условные «Вектор» и «Берег» выходят на связь каждые 12 секунд.
                  Передача длится 5 секунд, затем наступает тишина.
                </p>
                {mode === "free" && (
                  <button
                    className="outline-button full-width"
                    onClick={riverScenario}
                  >
                    <RadioTower size={15} /> Загрузить речной сценарий
                  </button>
                )}
                <div className="reception-panel">
                  <div>
                    <span>
                      {state.ptt
                        ? "TX · ИМИТАЦИЯ"
                        : rx.audible
                          ? "RX · ЗВУК ОТКРЫТ"
                          : rx.carrier
                            ? "RX · ЗВУК ЗАКРЫТ"
                            : "ОЖИДАНИЕ СИГНАЛА"}
                    </span>
                    <b>{rx.strength}/9</b>
                  </div>
                  <div className="rx-bars">
                    {Array.from({ length: 9 }, (_, i) => (
                      <i key={i} className={i < rx.strength ? "on" : ""} />
                    ))}
                  </div>
                  <strong>
                    {frequencyText(rx.frequency)} <small>МГц / {rx.bank}</small>
                  </strong>
                  <p>{rx.reason}</p>
                </div>
                {rx.audible && rx.message && (
                  <div className="transcript">
                    <Headphones size={16} />
                    <div>
                      <span>ВЫМЫШЛЕННАЯ РЕПЛИКА</span>
                      <p>{rx.message}</p>
                    </div>
                  </div>
                )}
                <button
                  className="text-button air-reveal"
                  onClick={() => setRevealAir(!revealAir)}
                >
                  {revealAir
                    ? "Скрыть станции"
                    : "Показать карту учебного эфира"}
                  <ChevronRight size={14} />
                </button>
                {revealAir && (
                  <div className="station-list">
                    {snapshots.map((s) => {
                      const phase = (state.clockMs + s.phase) % s.period;
                      return (
                        <div key={s.id}>
                          <i className={s.active ? "on" : ""} />
                          <div>
                            <strong>
                              {frequencyText(s.frequency)} <small>МГц</small>
                            </strong>
                            <span>{s.name}</span>
                            <small>
                              {s.active
                                ? "Передаёт"
                                : `Сеанс через ${Math.ceil((s.period - phase) / 1000)} с`}{" "}
                              · {s.strength}/9 ·{" "}
                              {s.ctcss
                                ? `CT ${s.ctcss}`
                                : s.dcs
                                  ? `D${s.dcs}`
                                  : "без тонов"}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="technical-note">
                  Звук — синтетический шум и сигналы приёма. Реплики показаны
                  текстом. Это не запись эфира. Уровни SQL и распространение
                  сигналов — учебная модель.
                </div>
              </>
            )}
            {panel === "memory" && (
              <>
                <div className="section-kicker">
                  <span className="eyebrow">ПАМЯТЬ РАДИОСТАНЦИИ</span>
                  <HardDrive size={15} />
                </div>
                <h2>Каналы и данные</h2>
                <p>
                  Сохраняйте через <b>13 MEM-CH</b>, удаляйте через{" "}
                  <b>50 DEL_CH</b>. Операции требуют подтверждения <b>SURE?</b>.
                </p>
                <div className="memory-count">
                  <b>{Object.keys(state.memories).length}</b>
                  <span> / 200 ячеек занято</span>
                </div>
                <div className="memory-table">
                  <table>
                    <thead>
                      <tr>
                        <th>CH</th>
                        <th>МГц / параметры</th>
                        <th>Списки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(state.memories)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([slot, c]) => (
                          <tr
                            key={slot}
                            className={
                              state.banks[state.active].mode === "MR" &&
                              state.banks[state.active].channel === Number(slot)
                                ? "selected"
                                : ""
                            }
                          >
                            <td>{slot.padStart(3, "0")}</td>
                            <td>
                              <strong>{frequencyText(c.frequency)}</strong>
                              <small>
                                {c.name} ·{" "}
                                {c.bandwidth === "NARROW" ? "N" : "W"} ·{" "}
                                {c.rxCtcss
                                  ? `CT ${c.rxCtcss}`
                                  : c.rxDcs
                                    ? `D${c.rxDcs}`
                                    : "RX OFF"}
                              </small>
                            </td>
                            <td>
                              {c.list1 ? "Ⅰ" : "—"} {c.list2 ? "Ⅱ" : ""}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!Object.keys(state.memories).length && (
                    <p>Память пуста. Сохраните частоту в MEM-CH.</p>
                  )}
                </div>
                <div className="file-actions">
                  <button className="outline-button" onClick={backup}>
                    <Download size={15} /> Копия JSON
                  </button>
                  <button className="outline-button" onClick={exportCsv}>
                    <Download size={15} /> Таблица CSV
                  </button>
                  <button
                    className="outline-button"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={15} /> Восстановить JSON
                  </button>
                </div>
                <input
                  type="file"
                  ref={fileRef}
                  accept=".json,application/json"
                  className="hidden"
                  aria-label="Загрузить JSON-копию"
                  onChange={(e) => void importBackup(e.target.files?.[0])}
                />
                {read("before-import") && (
                  <button
                    className="text-button"
                    onClick={() => {
                      const previous = read("before-import");
                      if (previous) {
                        dispatch({
                          type: "LOAD",
                          state: deserializeRadio(previous),
                        });
                        setToast("Восстановлены настройки до импорта.");
                      }
                    }}
                  >
                    <RotateCcw size={13} /> Отменить импорт
                  </button>
                )}
                <div className="technical-note">
                  <strong>Подготовка к CHIRP</strong>
                  <p>
                    JSON — копия тренажёра, CSV — учебная таблица. Они не
                    являются образом .img и не предназначены для записи в
                    настоящую рацию.
                  </p>
                  <p>
                    На устройстве: включить питание → подключить кабель mic/spkr
                    → Download From Radio → сохранить исходный .img. USB-C
                    классической модели служит зарядке.
                  </p>
                </div>
              </>
            )}
            {panel === "reference" && (
              <>
                <span className="eyebrow">СПРАВОЧНИК / STOCK FW</span>
                <h2>Знать, что меняешь</h2>
                <p>
                  Справка открывается поверх тренажёра. Эфир и текущее состояние
                  продолжают работать.
                </p>
                <details className="reference-details">
                  <summary>
                    <Keyboard size={16} /> Клавиши и сочетания
                  </summary>
                  <p>
                    На компьютере: M / Enter — меню; Esc — выход; F — функция; *
                    — SCAN; Q / E — боковые кнопки; пробел — PTT; P — питание.
                    Цифры и стрелки соответствуют клавиатуре рации.
                  </p>
                  <div className="help-key-list">
                    {Object.entries(KEY_HELP).map(([key, text]) => (
                      <button key={key} onClick={() => setHelp(text)}>
                        {key === "STAR" ? "*" : key}
                      </button>
                    ))}
                  </div>
                </details>
                <input
                  className="reference-search"
                  aria-label="Найти пункт меню"
                  placeholder="Номер, название или назначение…"
                  value={referenceSearch}
                  onChange={(e) => setReferenceSearch(e.target.value)}
                />
                <div className="menu-reference">
                  {MENUS.filter((m) =>
                    `${m.id} ${m.name} ${m.title}`
                      .toLocaleLowerCase()
                      .includes(referenceSearch.toLocaleLowerCase()),
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() =>
                        setHelp(
                          `${String(m.id).padStart(2, "0")} ${m.name} — ${m.title}. ${m.description}${!m.implemented ? " Функция не реализована в этой версии." : ""}`,
                        )
                      }
                    >
                      <span>{String(m.id).padStart(2, "0")}</span>
                      <div>
                        <strong>{m.name}</strong>
                        <small>{m.title}</small>
                      </div>
                      {!m.implemented ? (
                        <span className="not-modeled">—</span>
                      ) : (
                        <ChevronRight size={13} />
                      )}
                    </button>
                  ))}
                </div>
                <p className="small-print">
                  «—» — функция видна в заводском меню, но не моделируется.
                  Расширения Egzumer, IJV и F4HWN отсутствуют.
                </p>
                <div className="source-links">
                  <a href={mapUrl} target="_blank" rel="noreferrer">
                    Полная карта управления ↗
                  </a>
                  <a href={sourcesUrl} target="_blank" rel="noreferrer">
                    Источники и различия ревизий ↗
                  </a>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
      {help && (
        <div
          className="help-popover"
          role="dialog"
          aria-label="Контекстная справка"
        >
          <div>
            <CircleHelp size={18} />
            <span>КОНТЕКСТНАЯ СПРАВКА</span>
            <button aria-label="Закрыть справку" onClick={() => setHelp("")}>
              <X size={18} />
            </button>
          </div>
          <p>{help}</p>
          <small>
            Симуляция продолжается. Чтобы снова управлять кнопками, выключите
            режим справки.
          </small>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function History({ entries }: { entries: string[] }) {
  return (
    <div className="history">
      <div className="section-kicker">
        <span className="eyebrow">ЖУРНАЛ ДЕЙСТВИЙ</span>
        <span>{entries.length.toString().padStart(2, "0")}</span>
      </div>
      {entries.length ? (
        <ol>
          {entries.slice(0, 8).map((entry, i) => (
            <li key={`${i}-${entry}`}>
              <span>{String(entries.length - i).padStart(2, "0")}</span>
              {entry}
            </li>
          ))}
        </ol>
      ) : (
        <p className="subtle">Здесь появятся изменения настроек.</p>
      )}
    </div>
  );
}
