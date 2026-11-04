import type { Reception } from "../model/types";
/** Procedural effects only. No recordings, microphone, network, or radio hardware. */
export class RadioAudio {
  private ctx: AudioContext | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private carrier: OscillatorNode | null = null;
  private noiseGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private master: GainNode | null = null;
  private open = false;
  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.25;
      this.master.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
        data = buffer.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647;
        data[i] = (seed / 2147483647) * 2 - 1;
      }
      this.noise = ctx.createBufferSource();
      this.noise.buffer = buffer;
      this.noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1800;
      filter.Q.value = 0.7;
      this.noiseGain = ctx.createGain();
      this.noiseGain.gain.value = 0;
      this.noise.connect(filter).connect(this.noiseGain).connect(this.master);
      this.noise.start();
      this.carrier = ctx.createOscillator();
      this.carrier.type = "triangle";
      this.voiceGain = ctx.createGain();
      this.voiceGain.gain.value = 0;
      this.carrier.connect(this.voiceGain).connect(this.master);
      this.carrier.start();
    }
    await this.ctx.resume();
  }
  update(rx: Reception, volume: number, clockMs: number, alarm = false) {
    if (
      !this.ctx ||
      !this.master ||
      !this.noiseGain ||
      !this.voiceGain ||
      !this.carrier
    )
      return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(volume * 0.3, t, 0.04);
    this.noiseGain.gain.setTargetAtTime(
      rx.audible ? (rx.noise ? 0.18 : 0.025 + (1 - rx.quality) * 0.1) : 0,
      t,
      0.025,
    );
    const syllable = Math.sin(clockMs / 93) + Math.sin(clockMs / 227) > 0.1;
    this.voiceGain.gain.setTargetAtTime(
      alarm
        ? 0.09
        : rx.audible && !rx.noise && syllable
          ? 0.05 * rx.quality
          : 0,
      t,
      0.025,
    );
    this.carrier.frequency.setTargetAtTime(
      alarm
        ? Math.floor(clockMs / 300) % 2
          ? 880
          : 550
        : 240 + 90 * Math.sin(clockMs / 310),
      t,
      0.03,
    );
    if (this.open !== rx.audible) {
      this.beep(rx.audible ? 650 : 400, 0.035, 0.035);
      this.open = rx.audible;
    }
  }
  beep(frequency = 1100, duration = 0.045, gain = 0.12) {
    if (!this.ctx || !this.master || this.ctx.state !== "running") return;
    const osc = this.ctx.createOscillator(),
      amp = this.ctx.createGain(),
      t = this.ctx.currentTime;
    osc.frequency.value = frequency;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(this.master);
    osc.start();
    osc.stop(t + duration + 0.01);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }
  async stop() {
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
      this.noise = null;
      this.carrier = null;
      this.open = false;
    }
  }
}
