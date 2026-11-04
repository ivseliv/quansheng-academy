import { describe, it, expect } from "vitest";
import { createInitialState, radioReducer, getActiveChannel } from "./radio";
import type { RadioKey, RadioState } from "./types";
const key = (s: RadioState, k: RadioKey, long = false) =>
  radioReducer(s, { type: "KEY", key: k, long });
const powered = () =>
  radioReducer(createInitialState(), { type: "POWER", on: true });
describe("vertical slice: stock controls", () => {
  it("off blocks keys; power and volume work", () => {
    let s = createInitialState();
    expect(key(s, "MENU")).toEqual(s);
    s = radioReducer(s, { type: "POWER", on: true });
    expect(s.power).toBe(true);
    expect(radioReducer(s, { type: "VOLUME", value: 0.3 }).volume).toBe(0.3);
  });
  it("six digits set a valid frequency, invalid input does not corrupt it", () => {
    let s = powered();
    for (const k of "300150") s = key(s, k as RadioKey);
    expect(getActiveChannel(s).frequency).toBe(300150000);
    for (const k of "999999") s = key(s, k as RadioKey);
    expect(getActiveChannel(s).frequency).toBe(300150000);
  });
  it("F3 toggles MR and preserves VFO independently for each bank", () => {
    let s = powered();
    for (const k of ["F", "3", "F", "2"] as RadioKey[]) s = key(s, k);
    expect(s.banks.A.mode).toBe("MR");
    expect(s.banks.B.mode).toBe("VFO");
    expect(s.active).toBe("B");
  });
  it("SQL is a draft until M confirms; EXIT cancels", () => {
    let s = powered();
    s = key(key(key(s, "MENU"), "MENU"), "DOWN");
    expect(s.ui.draft).toBe(3);
    expect(s.settings.sql).toBe(4);
    s = key(s, "EXIT");
    expect(s.settings.sql).toBe(4);
    s = key(key(key(s, "MENU"), "2"), "MENU");
    expect(s.settings.sql).toBe(2);
  });
  it("reducer does not mutate previous state", () => {
    const s = powered();
    const copy = JSON.stringify(s);
    key(key(s, "MENU"), "MENU");
    expect(JSON.stringify(s)).toBe(copy);
  });
});
