/// <reference lib="webworker" />
import { chooseMove } from "./ai";
import type { AIDifficulty, Definition, Match } from "./types";

self.onmessage = (
  event: MessageEvent<{
    match: Match;
    defs: Definition[];
    difficulty: AIDifficulty;
  }>,
) => {
  try {
    self.postMessage({
      move: chooseMove(
        event.data.match,
        event.data.defs,
        event.data.difficulty,
      ),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "AIの思考に失敗しました。",
    });
  }
};
