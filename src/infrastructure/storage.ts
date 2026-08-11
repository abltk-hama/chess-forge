import { cost, errors, MAX_DEFINITIONS } from "../domain/cost";
import {
  formationErrors,
  formationFromSetup,
  formationMode,
} from "../domain/formation";
import type { SaveData } from "../domain/types";

const KEY = "custom-piece-chess:v1";

export const save = (data: SaveData) =>
  localStorage.setItem(KEY, JSON.stringify(data));

export function parse(raw: string): SaveData {
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("definitions" in value) ||
    !Array.isArray(value.definitions) ||
    !("setup" in value) ||
    !("preset" in value)
  ) {
    throw new Error("対応していない駒セット形式です。");
  }
  const data = value as SaveData;
  if (
    data.definitions.length > MAX_DEFINITIONS ||
    data.definitions.some(
      (item) => errors(item, data.definitions).length || cost(item) > 30,
    )
  ) {
    throw new Error("駒定義が制約に違反しています。");
  }
  const ids = new Set(data.definitions.map((item) => item.id));
  const legacyIds = [
    data.setup.rook,
    data.setup.knight,
    data.setup.bishop,
    data.setup.queen,
  ];
  const formationIds = data.setup.formation ?? [];
  if (
    [...legacyIds, ...formationIds].some(
      (id) => id !== null && id !== undefined && !ids.has(id),
    )
  ) {
    throw new Error("編成が存在しない駒を参照しています。");
  }
  if (
    data.setup.mode !== undefined &&
    data.setup.mode !== "balanced" &&
    data.setup.mode !== "free"
  )
    throw new Error("対応していない配置モードです。");
  if (
    data.setup.formation &&
    formationErrors(
      formationFromSetup(data.setup),
      formationMode(data.setup),
      data.definitions,
    ).length
  )
    throw new Error("編成が配置制約に違反しています。");
  for (const slot of ["rook", "knight", "bishop"] as const) {
    if (
      data.setup[slot] &&
      data.definitions.find((item) => item.id === data.setup[slot])?.isCrown
    ) {
      throw new Error("王冠駒は1体枠のクイーン位置にのみ配置できます。");
    }
  }
  return data;
}

export const load = () => {
  const value = localStorage.getItem(KEY);
  return value ? parse(value) : null;
};

export function download(data: SaveData) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "custom-piece-set.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
