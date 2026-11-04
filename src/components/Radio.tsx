import { useRef } from "react";
import { LockKeyhole, ChevronUp, ChevronDown } from "lucide-react";
import type {
  RadioState,
  RadioAction,
  RadioKey as KeyName,
  Reception,
  MenuDefinition,
} from "../model/radio";
import {
  getActiveChannel,
  getMenuValue,
  formatMenuValue,
  isBacklightOn,
  getReceiveFrequency,
  getTransmitFrequency,
  getTransmitBank,
} from "../model/radio";
import { RadioKey } from "./RadioKey";
import { KEY_HELP } from "./keyHelp";

export const frequencyText = (hz: number) =>
  (hz / 1e6).toFixed(hz % 1000 ? 5 : 3);
interface Props {
  state: RadioState;
  dispatch: (a: RadioAction) => void;
  reception?: Reception;
  menus?: MenuDefinition[];
  helpMode: boolean;
  onHelp: (text: string) => void;
}
const keys: [KeyName, string, string][] = [
  ["1", "1", "BAND"],
  ["2", "2", "A/B"],
  ["3", "3", "VFO/MR"],
  ["STAR", "*", "SCAN"],
  ["4", "4", "FC"],
  ["5", "5", "NOAA"],
  ["6", "6", "H/M/L"],
  ["0", "0", "FM"],
  ["7", "7", "VOX"],
  ["8", "8", "R"],
  ["9", "9", "CALL"],
  ["F", "F", "#  ▣"],
];

export function Radio({
  state: s,
  dispatch,
  reception,
  menus = [],
  helpMode,
  onHelp,
}: Props) {
  const touchF = useRef({ held: false, used: false });
  const transmitBank = getTransmitBank(s);
  const displayBank = s.ptt ? transmitBank : s.active;
  const selected = getActiveChannel(s, displayBank);
  const menu = menus.find((m) => m.id === s.ui.menuId);
  const lit = isBacklightOn(s);
  const act = (key: KeyName, long: boolean) => {
    if (helpMode) {
      onHelp(KEY_HELP[key]);
      return;
    }
    if (key === "F" && touchF.current.used) return;
    if (key !== "F" && touchF.current.held && !touchF.current.used) {
      touchF.current.used = true;
      dispatch({ type: "KEY", key: "F" });
    }
    dispatch({ type: "KEY", key, long });
  };
  const rk = (
    id: KeyName,
    label: React.ReactNode,
    sub?: string,
    className?: string,
  ) => (
    <RadioKey
      key={id}
      id={id}
      label={label}
      sub={sub}
      className={className}
      onStart={
        id === "F"
          ? () => {
              touchF.current = { held: true, used: false };
            }
          : undefined
      }
      onEnd={
        id === "F"
          ? () => {
              touchF.current = { held: false, used: false };
            }
          : undefined
      }
      onPress={(long) => act(id, long)}
      help={KEY_HELP[id]}
      onHelp={onHelp}
    />
  );
  return (
    <div className={`radio-assembly ${helpMode ? "help-mode" : ""}`}>
      <div className="antenna" aria-hidden="true">
        <div className="antenna-tip" />
        <div className="antenna-base" />
      </div>
      <div className="knob-zone">
        <span className="knob-caption">OFF · VOL</span>
        <button
          aria-label="Питание"
          title={KEY_HELP.POWER}
          className={`volume-knob ${s.power ? "on" : ""}`}
          onClick={() =>
            helpMode
              ? onHelp(KEY_HELP.POWER)
              : dispatch({ type: "POWER", on: !s.power })
          }
          onContextMenu={(e) => {
            e.preventDefault();
            onHelp(KEY_HELP.POWER);
          }}
          onWheel={(e) => {
            dispatch({
              type: "VOLUME",
              value: s.volume + (e.deltaY < 0 ? 0.05 : -0.05),
            });
          }}
        >
          <span style={{ transform: `rotate(${-120 + s.volume * 240}deg)` }} />
        </button>
      </div>
      <div className={`flash-lens ${s.flashlight ? "lit" : ""}`} />
      <div className="radio-body">
        <div className="side-controls">
          <RadioKey
            id="PTT"
            label="PTT"
            className="ptt-key"
            help={KEY_HELP.PTT}
            onPress={() => helpMode && onHelp(KEY_HELP.PTT)}
            onHold={
              helpMode ? undefined : (down) => dispatch({ type: "PTT", down })
            }
            onHelp={onHelp}
          />
          {rk("SK1", "•", undefined, "side-key")}
          {rk("SK2", "••", undefined, "side-key")}
        </div>
        <div className="radio-topline">
          <strong>QUANSHENG</strong>
          <span
            className={`rx-led ${s.ptt ? "tx" : reception?.audible ? "rx" : ""}`}
          />
        </div>
        <div className="screen-frame">
          <div
            className={`lcd ${s.power ? "powered" : ""} ${lit ? "backlit" : ""}`}
            role="img"
            aria-label={
              s.power
                ? `Экран рации. ${s.active}, ${s.banks[s.active].mode}, ${frequencyText(selected.frequency)} мегагерц. ${s.ui.screen === "menu" ? `Меню ${s.ui.menuId} ${menu?.name ?? "SQL"}` : ""}`
                : "Рация выключена"
            }
          >
            {s.power && (
              <>
                <div className="lcd-status">
                  <span>
                    {s.ui.functionPending ? "F " : ""}
                    {s.locked ? "▣ " : ""}
                    {s.settings.tdr !== "OFF" ? "DW " : ""}
                    {selected.rxCtcss ? "CT " : selected.rxDcs ? "DCS " : ""}
                    {selected.bandwidth === "NARROW" ? "N " : ""}
                    {selected.am &&
                    selected.frequency >= 108000000 &&
                    selected.frequency < 136000000
                      ? "AM"
                      : ""}
                    {selected.reverse ? " R" : ""}
                  </span>
                  <span>
                    {selected.power[0]} <span className="battery">▰▰▰</span>
                  </span>
                </div>
                {s.ui.screen === "menu" ? (
                  <div className="lcd-menu">
                    <div>
                      <b>
                        {menu?.name ??
                          (s.ui.menuId === 1 ? "SQL" : `MENU ${s.ui.menuId}`)}
                      </b>
                      <small>{String(s.ui.menuId).padStart(2, "0")}</small>
                    </div>
                    <div className="lcd-menu-value">
                      <b
                        className={!menu?.implemented ? "lcd-unsupported" : ""}
                      >
                        {s.ui.menuPhase === "confirm"
                          ? "SURE?"
                          : formatMenuValue(
                              s.ui.menuId,
                              s.ui.menuPhase === "edit"
                                ? s.ui.draft
                                : getMenuValue(s, s.ui.menuId),
                              s,
                            )}
                      </b>
                      <small>
                        {s.ui.menuPhase === "browse"
                          ? "M: SET"
                          : s.ui.menuPhase === "confirm"
                            ? "M: YES"
                            : "▸ EDIT"}
                      </small>
                    </div>
                  </div>
                ) : s.ui.screen === "tone-search" ? (
                  <div className="tone-screen">
                    <strong>
                      {s.toneSearch?.found
                        ? "SCAN CMP"
                        : s.toneSearch?.failed
                          ? "SCAN FAIL"
                          : "SEARCH…"}
                    </strong>
                    <span>
                      {s.toneSearch?.ctcss
                        ? `${s.toneSearch.ctcss} Hz`
                        : (s.toneSearch?.dcs ?? "CTCSS / DCS")}
                    </span>
                  </div>
                ) : (
                  <div className="lcd-frequencies">
                    {(["A", "B"] as const).map((bank) => {
                      const b = s.banks[bank],
                        c = getActiveChannel(s, bank),
                        active = displayBank === bank;
                      const input =
                        active && s.ui.input
                          ? s.ui.input.padEnd(b.mode === "VFO" ? 6 : 3, "—")
                          : "";
                      let display = input
                        ? b.mode === "VFO"
                          ? `${input.slice(0, 3)}.${input.slice(3)}`
                          : input
                        : frequencyText(
                            s.ptt && bank === transmitBank
                              ? getTransmitFrequency(c)
                              : getReceiveFrequency(c),
                          );
                      if (
                        !input &&
                        b.mode === "MR" &&
                        s.settings.displayMode !== "FREQ"
                      )
                        display =
                          s.settings.displayMode === "NAME"
                            ? s.memories[b.channel]?.name ||
                              `CH-${String(b.channel).padStart(3, "0")}`
                            : `CH-${String(b.channel).padStart(3, "0")}`;
                      return (
                        <div
                          className={`lcd-frequency ${active ? "selected" : ""} ${b.mode === "MR" && s.settings.displayMode === "NAME" ? "show-name" : ""}`}
                          key={bank}
                        >
                          <span className="lcd-arrow">{active ? "▸" : ""}</span>
                          <span className="lcd-digits">{display}</span>
                          <span className="lcd-band">
                            {b.mode === "VFO"
                              ? `F${c.frequency < 76000000 ? 1 : c.frequency < 136000000 ? 2 : c.frequency < 174000000 ? 3 : c.frequency < 350000000 ? 4 : c.frequency < 400000000 ? 5 : c.frequency < 470000000 ? 6 : 7}`
                              : `M${String(b.channel).padStart(3, "0")}`}
                            <small>{bank}</small>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="lcd-bottom">
                  <span className="signal-meter">
                    {Array.from({ length: 7 }, (_, i) => (
                      <i
                        key={i}
                        style={{
                          height: 3 + i * 1.7,
                          opacity:
                            reception && reception.strength > i ? 1 : 0.12,
                        }}
                      />
                    ))}
                  </span>
                  <span>
                    {s.ptt
                      ? "TX"
                      : reception?.audible
                        ? "RX"
                        : s.monitor
                          ? "MON"
                          : ""}
                  </span>
                  <span>
                    {s.scan?.active ? "SCAN " : ""}
                    {s.scan?.paused ? "HOLD " : ""}
                    {selected.list1 ? "Ⅰ " : ""}
                    {selected.list2 ? "Ⅱ" : ""}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mid-panel">
          <div className="navigation-keys">
            {rk("MENU", "M", undefined, "menu-key")}
            {rk("UP", <ChevronUp size={22} />)}
            {rk("DOWN", <ChevronDown size={22} />)}
            {rk("EXIT", "EXIT", undefined, "exit-key")}
          </div>
          <div className="speaker">
            <span className="model-label">UV-K5</span>
            <div className="speaker-lines">
              {Array.from({ length: 7 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <div className="mic">
              <i /> MIC
            </div>
          </div>
        </div>
        <div className="keypad">
          {keys.map(([id, label, sub]) =>
            rk(
              id,
              id === "F" ? (
                <>
                  {label} <LockKeyhole size={10} />
                </>
              ) : (
                label
              ),
              sub,
              id === "F" ? "function-key" : "",
            ),
          )}
        </div>
        <div className="radio-foot">
          <span>DUAL BAND TRANSCEIVER</span>
          <i />
          <i />
        </div>
      </div>
      <div className="radio-shadow" />
    </div>
  );
}
