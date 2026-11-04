import { describe, it, expect } from "vitest";
import {
  CHAPTERS,
  evaluateTask,
  buildTrainingCsv,
  type LessonContext,
} from "./index";
import {
  createInitialState,
  radioReducer,
  type RadioState,
  type RadioKey,
} from "../model/radio";
import { serializeRadio } from "../model/persistence";
const press = (s: RadioState, key: RadioKey, long = false) =>
  radioReducer(s, { type: "KEY", key, long });
function sequence(s: RadioState, ...keys: string[]) {
  return keys.reduce((s, k) => press(s, k as RadioKey), s);
}
function setting(s: RadioState, n: number, value: string) {
  return sequence(
    s,
    "MENU",
    ...String(n).padStart(2, "0"),
    "MENU",
    ...value,
    "MENU",
    "EXIT",
  );
}
function save(s: RadioState, n: number, slot: string) {
  return sequence(
    s,
    "MENU",
    ...String(n),
    "MENU",
    ...slot,
    "MENU",
    "MENU",
    "EXIT",
  );
}
function found(s: RadioState) {
  return radioReducer(press(s, "STAR", true), { type: "TICK", ms: 1500 });
}
const solutions: Record<string, (s: RadioState) => RadioState> = {
  power: (s) =>
    radioReducer(radioReducer(s, { type: "POWER", on: true }), {
      type: "VOLUME",
      value: 0.55,
    }),
  "active-b": (s) => sequence(s, "F", "2"),
  "sql-two": (s) => setting(s, 1, "2"),
  "keypad-lock": (s) => press(s, "F", true),
  "vfo-mode": (s) => sequence(s, "F", "3"),
  "river-frequency": (s) => sequence(s, ..."300150"),
  "memory-number": (s) => sequence(s, ..."012"),
  "second-vfo": (s) => sequence(s, "F", "2", ..."300175"),
  "step-tune": (s) => press(setting(s, 2, "5"), "UP"),
  "narrow-band": (s) => setting(s, 10, "1"),
  "clear-tones": (s) => setting(s, 4, "0"),
  "squelch-reception": (s) => setting(s, 1, "2"),
  "save-channel": (s) => save(s, 13, "012"),
  "recall-channel": (s) => sequence(s, "F", "3", ..."012"),
  "copy-channel": (s) => save(s, 13, "021"),
  "delete-channel": (s) => save(s, 50, "021"),
  "scan-frequency": found,
  "scan-membership": (s) => setting(s, 26, "1"),
  "scan-memory": (s) => found(setting(s, 31, "1")),
  "scan-stop": (s) => found(setting(s, 22, "2")),
  "dual-prepare": (s) => sequence(s, "F", "2", ..."300150", "F", "2"),
  "dual-enable": (s) => setting(s, 17, "1"),
  "dual-hear-b": (s) =>
    sequence(setting(sequence(s, "F", "2"), 5, "0"), "F", "2"),
  "dual-disable": (s) => setting(s, 17, "0"),
  "fix-volume": (s) => radioReducer(s, { type: "VOLUME", value: 0.55 }),
  "fix-squelch": (s) => setting(s, 1, "2"),
  "fix-ctcss": (s) => setting(s, 5, "0"),
  "fix-frequency": (s) => press(s, "DOWN"),
  "chirp-memory": (s) => save(s, 13, "012"),
  "chirp-backup": (s) => s,
  "chirp-power": (s) => radioReducer(s, { type: "POWER", on: true }),
  "chirp-export": (s) => s,
};
describe("complete curriculum", () => {
  it("has eight chapters with four practical tasks and progressive explanations", () => {
    expect(CHAPTERS).toHaveLength(8);
    for (const c of CHAPTERS) {
      expect(c.tasks).toHaveLength(4);
      for (const t of c.tasks) {
        expect(t.hints).toHaveLength(3);
        expect(t.explanation.length).toBeGreaterThan(70);
      }
    }
  });
  for (const chapter of CHAPTERS)
    for (const task of chapter.tasks) {
      it(`${chapter.id}/${task.id}: does not pass initially and can be solved through radio controls`, () => {
        const initial = task.setup(createInitialState());
        expect(evaluateTask(task, initial), `${task.id} initially`).toBe(false);
        expect(solutions[task.id]).toBeTypeOf("function");
        const final = solutions[task.id](initial);
        const context: LessonContext =
          task.id === "chirp-backup"
            ? { backupJson: serializeRadio(final) }
            : task.id === "chirp-export"
              ? { exportCsv: buildTrainingCsv(final) }
              : {};
        expect(evaluateTask(task, final, context), task.description).toBe(true);
      });
    }
  it("rejects stale or invented file checkpoints", () => {
    const task = CHAPTERS[7].tasks[1],
      s = task.setup(createInitialState());
    expect(evaluateTask(task, s, { backupJson: "{}" })).toBe(false);
    const old = serializeRadio(s);
    s.memories[12].frequency += 25000;
    expect(evaluateTask(task, s, { backupJson: old })).toBe(false);
    const csvTask = CHAPTERS[7].tasks[3],
      csvState = csvTask.setup(createInitialState());
    expect(evaluateTask(csvTask, csvState, { exportCsv: "300.150000" })).toBe(
      false,
    );
  });
});
