import { describe, expect, it } from "vitest";
import { createSoundPlayer, type AudioContextLike } from "./sound";

interface FakeOsc {
  type: string;
  freqs: number[];
  started: number;
  stopped: number;
}

/** A stand-in for AudioContext that records what the player asks for. */
function fakeContext() {
  const oscillators: FakeOsc[] = [];
  const gains: number[][] = [];
  const state = { state: "suspended", resumed: 0 };
  const ctx = {
    get state() {
      return state.state;
    },
    currentTime: 0,
    destination: {},
    resume() {
      state.resumed++;
      state.state = "running";
      return Promise.resolve();
    },
    createOscillator() {
      const osc: FakeOsc = { type: "sine", freqs: [], started: 0, stopped: 0 };
      oscillators.push(osc);
      return {
        set type(t: string) {
          osc.type = t;
        },
        frequency: {
          setValueAtTime: (v: number) => osc.freqs.push(v),
          linearRampToValueAtTime: (v: number) => osc.freqs.push(v),
        },
        connect() {},
        start() {
          osc.started++;
        },
        stop() {
          osc.stopped++;
        },
      };
    },
    createGain() {
      const values: number[] = [];
      gains.push(values);
      const param = {
        setValueAtTime: (v: number) => values.push(v),
        linearRampToValueAtTime: (v: number) => values.push(v),
        exponentialRampToValueAtTime: (v: number) => values.push(v),
      };
      return { gain: param, connect() {} };
    },
  };
  return {
    ctx: ctx as unknown as AudioContextLike,
    oscillators,
    gains,
    resumed: () => state.resumed,
    contextState: () => state.state,
  };
}

describe("createSoundPlayer", () => {
  it("não cria contexto de áudio enquanto nada toca", () => {
    let created = 0;
    createSoundPlayer(() => {
      created++;
      return fakeContext().ctx;
    });
    expect(created).toBe(0);
  });

  it("com o interruptor desligado, não toca nada e nem cria o contexto", () => {
    let created = 0;
    const player = createSoundPlayer(() => {
      created++;
      return fakeContext().ctx;
    });
    player.play("blink", false);
    player.play("open", false);
    player.play("cycle_end", false);
    expect(created).toBe(0);
  });

  it("unlock() dentro de um gesto do usuário cria o contexto e o retoma", () => {
    const f = fakeContext();
    const player = createSoundPlayer(() => f.ctx);
    player.unlock();
    expect(f.resumed()).toBe(1);
    expect(f.contextState()).toBe("running");
  });

  it("reusa um único contexto em todos os sons", () => {
    let created = 0;
    const f = fakeContext();
    const player = createSoundPlayer(() => {
      created++;
      return f.ctx;
    });
    player.play("blink", true);
    player.play("open", true);
    player.play("cycle_end", true);
    expect(created).toBe(1);
  });

  it("piscada: um oscilador curto, com volume baixo", () => {
    const f = fakeContext();
    createSoundPlayer(() => f.ctx).play("blink", true);
    expect(f.oscillators).toHaveLength(1);
    expect(f.oscillators[0].started).toBe(1);
    expect(f.oscillators[0].stopped).toBe(1);
    expect(Math.max(...f.gains[0])).toBeLessThanOrEqual(0.1);
  });

  it("boca abrindo: um oscilador com varredura de frequência", () => {
    const f = fakeContext();
    createSoundPlayer(() => f.ctx).play("open", true);
    expect(f.oscillators).toHaveLength(1);
    expect(f.oscillators[0].freqs.length).toBeGreaterThanOrEqual(2);
  });

  it("fim de bloco: três notas, uma depois da outra", () => {
    const f = fakeContext();
    createSoundPlayer(() => f.ctx).play("cycle_end", true);
    expect(f.oscillators).toHaveLength(3);
  });

  it("sem contexto disponível (sem áudio no sistema) não lança erro", () => {
    const player = createSoundPlayer(() => {
      throw new Error("no audio device");
    });
    expect(() => player.play("blink", true)).not.toThrow();
    expect(() => player.unlock()).not.toThrow();
  });
});
