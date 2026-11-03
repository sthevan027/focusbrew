import { describe, expect, it } from "vitest";
import { BLINK_MS, OPEN_HOLD_MS, pressSteps, restFace, runSteps } from "./pumpkinState";
import type { PumpkinStep } from "./pumpkinState";

describe("pressSteps", () => {
  it("ao clicar: duas piscadas e depois a boca abre, com som em cada", () => {
    const steps = pressSteps(false);
    expect(steps.map((s) => s.face)).toEqual(["closed", "smile", "closed", "smile", "open"]);
    expect(steps.filter((s) => s.sound === "blink")).toHaveLength(2);
    expect(steps[steps.length - 1].sound).toBe("open");
    expect(steps[0].ms).toBe(BLINK_MS);
    expect(steps[steps.length - 1].ms).toBe(OPEN_HOLD_MS);
  });

  it("com movimento reduzido: sem piscadas, só a boca aberta por um instante", () => {
    const steps = pressSteps(true);
    expect(steps).toHaveLength(1);
    expect(steps[0].face).toBe("open");
    expect(steps[0].sound).toBe("open");
  });
});

describe("restFace", () => {
  it("parado e sem pausa: sorriso de olhos abertos", () => {
    expect(restFace({ running: false, paused: false })).toBe("smile");
  });

  it("rodando: boca aberta (é o estado do botão de quem está em foco)", () => {
    expect(restFace({ running: true, paused: false })).toBe("open");
  });

  it("pausado: olhos fechados", () => {
    expect(restFace({ running: false, paused: true })).toBe("closed");
  });
});

describe("runSteps", () => {
  /** A scheduler that records delays and lets the test fire them. */
  function fakeScheduler() {
    const queue: { at: number; fn: () => void; cancelled: boolean }[] = [];
    let now = 0;
    return {
      schedule: (fn: () => void, ms: number) => {
        const item = { at: now + ms, fn, cancelled: false };
        queue.push(item);
        return () => {
          item.cancelled = true;
        };
      },
      advance(ms: number) {
        now += ms;
        queue
          .filter((i) => !i.cancelled && i.at <= now)
          .sort((a, b) => a.at - b.at)
          .forEach((i) => {
            i.cancelled = true;
            i.fn();
          });
      },
    };
  }

  it("aplica cada passo no seu tempo e volta ao repouso (null) no fim", () => {
    const sched = fakeScheduler();
    const seen: (PumpkinStep | null)[] = [];
    const steps: PumpkinStep[] = [
      { face: "closed", ms: 100 },
      { face: "smile", ms: 100 },
    ];
    runSteps(steps, (s) => seen.push(s), sched.schedule);
    sched.advance(0);
    expect(seen).toEqual([steps[0]]);
    sched.advance(100);
    expect(seen).toEqual([steps[0], steps[1]]);
    sched.advance(100);
    expect(seen).toEqual([steps[0], steps[1], null]);
  });

  it("cancelar antes do fim não deixa passos pendentes dispararem", () => {
    const sched = fakeScheduler();
    const seen: (PumpkinStep | null)[] = [];
    const cancel = runSteps([{ face: "closed", ms: 100 }, { face: "smile", ms: 100 }], (s) => seen.push(s), sched.schedule);
    sched.advance(0);
    cancel();
    sched.advance(1000);
    expect(seen).toEqual([{ face: "closed", ms: 100 }]);
  });
});
