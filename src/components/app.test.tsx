// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  fireEvent,
  screen,
  act,
  cleanup,
} from "@testing-library/react";
import App from "../App";
const press = (label: string) =>
  fireEvent.click(screen.getByRole("button", { name: label }));
function hardwareKey(id: string) {
  const el = document.querySelector(`[data-radio-key="${id}"]`)!;
  fireEvent.click(el);
}
function computerKey(code: string, key: string) {
  fireEvent.keyDown(document.body, { code, key });
  fireEvent.keyUp(document.body, { code, key });
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  Element.prototype.setPointerCapture = vi.fn();
  window.PointerEvent = MouseEvent as typeof PointerEvent;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("interactive application integration", () => {
  it("finishes first lesson only after real power and volume changes, then advances", () => {
    render(<App />);
    expect(screen.getByRole("img", { name: "Рация выключена" })).toBeDefined();
    press("Питание");
    expect(screen.queryByText("Задание выполнено")).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: "Громкость" }), {
      target: { value: "55" },
    });
    expect(screen.getByText("Задание выполнено")).toBeDefined();
    press("Следующая практика");
    expect(
      screen.getByRole("heading", { name: "Выберите нижнюю строку" }),
    ).toBeDefined();
    hardwareKey("F");
    hardwareKey("2");
    expect(screen.getByText("Задание выполнено")).toBeDefined();
  });
  it("physical keypad enters frequency and preserves state on remount", () => {
    const view = render(<App />);
    press("Свободный эфир");
    press("Питание");
    for (const n of "300150") hardwareKey(n);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "300.150",
    );
    hardwareKey("F");
    hardwareKey("3");
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("MR");
    hardwareKey("F");
    hardwareKey("3");
    view.unmount();
    render(<App />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "300.150",
    );
  });
  it("keyboard chords, long locking and unlock work; release avoids stuck PTT", () => {
    render(<App />);
    computerKey("KeyP", "p");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "55" } });
    fireEvent.keyDown(document.body, { code: "KeyF", key: "f" });
    computerKey("Digit2", "2");
    fireEvent.keyUp(document.body, { code: "KeyF", key: "f" });
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("B,");
    fireEvent.keyDown(document.body, { code: "KeyF", key: "f" });
    act(() => vi.advanceTimersByTime(660));
    fireEvent.keyUp(document.body, { code: "KeyF", key: "f" });
    expect(
      screen.getAllByText(/Клавиатура заблокирована/).length,
    ).toBeGreaterThan(0);
    fireEvent.keyDown(document.body, { code: "Space", key: " " });
    expect(screen.getByText("TX")).toBeDefined();
    fireEvent.blur(window);
    expect(screen.queryByText("TX")).toBeNull();
  });
  it("pointer long press starts scan once; pointer cancel releases PTT", () => {
    render(<App />);
    press("Свободный эфир");
    press("Питание");
    const star = document.querySelector('[data-radio-key="STAR"]')!;
    fireEvent.pointerDown(star, { button: 0, pointerId: 1 });
    act(() => vi.advanceTimersByTime(660));
    fireEvent.pointerUp(star, { button: 0, pointerId: 1 });
    expect(screen.getAllByText(/Сканирование VFO/).length).toBeGreaterThan(0);
    hardwareKey("EXIT");
    const ptt = document.querySelector('[data-radio-key="PTT"]')!;
    fireEvent.pointerDown(ptt, { button: 0, pointerId: 2 });
    expect(screen.getByText("TX")).toBeDefined();
    fireEvent.pointerCancel(ptt, { pointerId: 2 });
    expect(screen.queryByText("TX")).toBeNull();
  });
  it("menu draft cancellation, saving and SURE work through real UI", () => {
    render(<App />);
    press("Свободный эфир");
    press("Питание");
    for (const n of "300150") hardwareKey(n);
    for (const n of ["MENU", "MENU", "2", "EXIT", "EXIT"]) hardwareKey(n);
    let saved = JSON.parse(
      localStorage.getItem("quansheng-academy:v1:radio-free")!,
    );
    expect(saved.settings.sql).toBe(4);
    for (const n of ["MENU", "1", "3", "MENU", "0", "1", "2", "MENU"])
      hardwareKey(n);
    expect(screen.getByText("SURE?")).toBeDefined();
    saved = JSON.parse(
      localStorage.getItem("quansheng-academy:v1:radio-free")!,
    );
    expect(saved.memories["12"]).toBeUndefined();
    hardwareKey("MENU");
    hardwareKey("EXIT");
    fireEvent.click(screen.getByRole("tab", { name: "Память" }));
    expect(screen.getByText("012")).toBeDefined();
  });
  it("context help leaves frequency unchanged and reference search is usable", () => {
    render(<App />);
    press("Свободный эфир");
    press("Питание");
    press("Справка по кнопке");
    hardwareKey("2");
    expect(
      screen.getByRole("dialog", { name: "Контекстная справка" }),
    ).toBeDefined();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("A,");
    fireEvent.click(screen.getByRole("tab", { name: "Справка" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Найти пункт меню" }),
      { target: { value: "R_DCS" } },
    );
    expect(screen.getByText("R_DCS")).toBeDefined();
    expect(screen.queryByText("MEM-CH")).toBeNull();
  });
  it("restores free lab after independently prepared lessons", () => {
    render(<App />);
    press("Свободный эфир");
    press("Питание");
    for (const n of "300175") hardwareKey(n);
    press("Обучение");
    press("Свободный эфир");
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "300.175",
    );
  });
  it("multitouch F plus 2 is a single combination and does not leave F pending", () => {
    render(<App />);
    press("Свободный эфир");
    press("Питание");
    const f = document.querySelector('[data-radio-key="F"]')!,
      two = document.querySelector('[data-radio-key="2"]')!;
    fireEvent.pointerDown(f, { button: 0, pointerId: 1 });
    fireEvent.pointerDown(two, { button: 0, pointerId: 2 });
    fireEvent.pointerUp(two, { button: 0, pointerId: 2 });
    fireEvent.pointerUp(f, { button: 0, pointerId: 1 });
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("B,");
    const saved = JSON.parse(
      localStorage.getItem("quansheng-academy:v1:radio-free")!,
    );
    expect(saved.active).toBe("B");
    hardwareKey("3");
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("VFO");
  });
  it("exports actual local JSON and CSV data from memory panel", () => {
    const urls: string[] = [];
    const create = vi.fn((blob: Blob) => {
      urls.push(blob.type);
      return "blob:unit-test";
    });
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = create;
        static revokeObjectURL = vi.fn();
      },
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Память" }));
    press("Копия JSON");
    press("Таблица CSV");
    expect(create).toHaveBeenCalledTimes(2);
    expect(urls).toEqual(["application/json", "text/csv;charset=utf-8"]);
    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
    vi.unstubAllGlobals();
  });
  it("losing focus cancels a held touchscreen F prefix", () => {
    render(<App />);
    press("Свободный эфир");
    press("Питание");
    fireEvent.pointerDown(document.querySelector('[data-radio-key="F"]')!, {
      button: 0,
      pointerId: 1,
    });
    fireEvent.blur(window);
    hardwareKey("2");
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("A,");
  });
});
