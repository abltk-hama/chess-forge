/// <reference lib="webworker" />
import { runSimulation, type SimulationOptions } from "./simulation";
import type { Definition, Preset, Setup } from "./types";
self.onmessage = (event: MessageEvent<{ defs: Definition[]; setup: Setup; preset: Preset; options: SimulationOptions }>) => {
  try { self.postMessage({ result: runSimulation(event.data.defs, event.data.setup, event.data.preset, event.data.options, (done, partial) => self.postMessage({ progress: done, partial })) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "シミュレーションに失敗しました。" }); }
};
