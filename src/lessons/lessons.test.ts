import { describe, expect, it } from "vitest";
import {
  createInitialState,
  radioReducer,
  type RadioKey,
  type RadioState,
} from "../model/radio";
import { CHAPTERS, evaluateTask, getTaskById } from "./index";

function key(s: RadioState, value: RadioKey, long = false) {
  return radioReducer(s, { type: "KEY", key: value, long });
}

describe("first chapter assessment", () => {
  it("does not award any task in its starting state", () => {
    for (const task of CHAPTERS[0].tasks) {
      expect(
        evaluateTask(task, task.setup(createInitialState())),
        task.id,
      ).toBe(false);
    }
  });

  it("requires power and usable volume, not just a power click", () => {
    const task = getTaskById("power")!;
    let s = task.setup(createInitialState());
    s = radioReducer(s, { type: "POWER", on: true });
    expect(evaluateTask(task, s)).toBe(false);
    s = radioReducer(s, { type: "VOLUME", value: 0.5 });
    expect(evaluateTask(task, s)).toBe(true);
  });

  it("evaluates actual selected bank", () => {
    const task = getTaskById("active-b")!;
    let s = task.setup(createInitialState());
    s = key(key(s, "F"), "2");
    expect(evaluateTask(task, s)).toBe(true);
    s = key(key(s, "F"), "2");
    expect(evaluateTask(task, s)).toBe(false);
  });

  it("only accepts SQL after confirmation and exiting the menu", () => {
    const task = getTaskById("sql-two")!;
    let s = task.setup(createInitialState());
    for (const value of ["MENU", "MENU", "DOWN", "DOWN"] as RadioKey[])
      s = key(s, value);
    expect(evaluateTask(task, s)).toBe(false);
    const cancelled = key(key(s, "EXIT"), "EXIT");
    expect(evaluateTask(task, cancelled)).toBe(false);
    s = key(s, "MENU");
    expect(evaluateTask(task, s)).toBe(false);
    s = key(s, "EXIT");
    expect(evaluateTask(task, s)).toBe(true);
  });

  it("short F does not pass the locking exercise", () => {
    const task = getTaskById("keypad-lock")!;
    let s = task.setup(createInitialState());
    s = key(s, "F");
    expect(evaluateTask(task, s)).toBe(false);
    s = key(s, "F", true);
    expect(evaluateTask(task, s)).toBe(true);
  });
});
