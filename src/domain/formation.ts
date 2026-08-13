import { definitionCost } from "./cost";
import type { Definition, FormationMode, Role, Setup } from "./types";

export const backRoles: Role[] = [
  "rook",
  "knight",
  "bishop",
  "queen",
  "king",
  "bishop",
  "knight",
  "rook",
];
export const FORMATION_SIZE = 16;
export const KING_SLOT = 4;

export function formationFromSetup(setup: Setup) {
  if (setup.formation?.length === FORMATION_SIZE) return [...setup.formation];
  return [
    setup.rook,
    setup.knight,
    setup.bishop,
    setup.queen,
    null,
    setup.bishop,
    setup.knight,
    setup.rook,
    ...Array<string | null>(8).fill(null),
  ];
}

export const formationMode = (setup: Setup): FormationMode =>
  setup.mode ?? "balanced";

export function crownCount(formation: (string | null)[], defs: Definition[]) {
  return formation.filter(
    (id) => {
      const definition = defs.find((item) => item.id === id);
      return definition?.isCrown || definition?.growth?.unlockCrown;
    },
  ).length;
}

export function slotLimit(index: number) {
  if (index >= 8) return 15;
  const role = backRoles[index];
  if (role === "knight" || role === "bishop" || role === "rook") return 25;
  if (role === "queen") return 30;
  if (role === "king") return 0;
  return 25;
}

export function formationErrors(
  formation: (string | null)[],
  mode: FormationMode,
  defs: Definition[],
) {
  const errors: string[] = [];
  if (formation.length !== FORMATION_SIZE)
    return ["編成データは16枠必要です。"];
  const ids = new Set(defs.map((definition) => definition.id));
  if (formation.some((id) => id !== null && !ids.has(id)))
    errors.push("存在しないオリジナル駒が配置されています。");
  if (formation[KING_SLOT] !== null) errors.push("Kingは変更できません。");
  if (
    formation.some((id) => {
      const definition = defs.find((item) => item.id === id);
      return definition && definitionCost(definition) > 30;
    })
  )
    errors.push("配置できるオリジナル駒は30点以下です。");
  if (mode === "free") return errors;

  formation.forEach((id, index) => {
    const definition = defs.find((item) => item.id === id);
    if (!definition) return;
    if (definitionCost(definition) > slotLimit(index))
      errors.push(
        `${index >= 8 ? "Pawn" : backRoles[index]}枠のコスト上限を超えています。`,
      );
    if ((definition.isCrown || definition.growth?.unlockCrown) && index !== 3)
      errors.push("バランス配置のCrownはQueen位置にだけ配置できます。");
  });
  if (crownCount(formation, defs) > 1)
    errors.push("バランス配置のCrownは1体までです。");
  const pawnDefinitions = formation.slice(8).flatMap((id) => {
    const definition = defs.find((item) => item.id === id);
    return definition ? [definition] : [];
  });
  const pawnBudget = pawnDefinitions.reduce(
    (sum, definition) => sum + (definitionCost(definition) <= 10 ? 1 : 2),
    0,
  );
  if (pawnBudget > 4)
    errors.push(
      "Pawn枠の置換予算を超えています（10点以下=1、11～15点=2、予算4）。",
    );
  if (
    pawnDefinitions.some(
      (definition) => definition.isCrown || definition.growth?.unlockCrown,
    )
  )
    errors.push("バランス配置のPawn枠へCrownは配置できません。");
  return [...new Set(errors)];
}
