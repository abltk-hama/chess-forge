import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  definitionCost,
  evolvedDefinition,
  errors,
  growthCost,
  MAX_DEFINITIONS,
  normalize,
  RESERVED_SYMBOLS,
  transformedDefinition,
  transformationLimit,
  summonLimit,
  summonedDefinition,
  jumpLimit,
} from "./domain/cost";
import {
  createMatch,
  inspectRange,
  legal,
  pieceText,
  play,
  placeSummon,
} from "./domain/game";
import { chooseSummonPlacement } from "./domain/ai";
import {
  boardDraftErrors,
  boardDraftFromSetup,
  boardDraftWarnings,
  createMatchFromDraft,
  emptyBoardDraft,
  type BoardDraft,
  type DraftPiece,
} from "./domain/boardEditor";
import {
  crownCount as countCrowns,
  formationErrors,
  formationFromSetup,
  formationMode,
  KING_SLOT,
  slotLimit,
} from "./domain/formation";
import {
  directions,
  emptySetup,
  idx,
  other,
  type Definition,
  type EvolutionCondition,
  type AIDifficulty,
  type Color,
  type GameMode,
  type FormationMode,
  type Match,
  type Pos,
  type Preset,
  type Range,
  type Role,
  type SaveData,
  type Setup,
  type SimulationResult,
  type SuspendedMatchData,
  type Usage,
  type Vec,
} from "./domain/types";
import {
  clearMatch,
  download,
  load,
  loadMatch,
  parse,
  save,
  saveMatch,
  loadSimulationResults,
  saveSimulationResult,
  deleteSimulationResult,
} from "./infrastructure/storage";
import {
  chooseAutoImportFile,
  clearAutoImportHandle,
  getAutoImportHandle,
  readAutoImportFile,
  supportsAutoImport,
  type AutoImportHandle,
} from "./infrastructure/autoImport";
type Page = "home" | "editor" | "setup" | "game" | "simulation";
type PlacementMode = "formation" | "editor";
const blank = (): Definition => ({
  id: crypto.randomUUID(),
  name: "",
  symbol: "",
  isCrown: false,
  patterns: [
    {
      kind: "direction",
      vectors: [],
      range: 1,
      usage: "both",
      phase: 1,
      jumpAllies: 0,
      jumpEnemies: 0,
    },
  ],
});
const editable = (source: Definition): Definition => ({
  ...structuredClone(source),
  patterns: source.patterns.map((pattern) =>
    pattern.kind === "leap"
      ? structuredClone(pattern)
      : {
          kind: "direction",
          vectors: structuredClone(pattern.vectors),
          range: pattern.range,
          usage: pattern.usage ?? "both",
          phase: pattern.phase ?? 1,
          initialOnly: pattern.initialOnly ?? false,
          cannon: pattern.cannon ?? false,
          jumpAllies:
            pattern.range !== 1 &&
            jumpLimit(pattern.jumpAllies, pattern.canJump),
          jumpEnemies:
            pattern.range !== 1 &&
            jumpLimit(pattern.jumpEnemies, pattern.canJump),
        },
  ),
});
const usesLegacyJump = (definition: Definition) =>
  definition.patterns.some(
    (pattern) =>
      pattern.kind === "direction" &&
      pattern.canJump === true &&
      pattern.jumpAllies === undefined &&
      pattern.jumpEnemies === undefined,
  );
const dirNames = ["前", "前右", "右", "後右", "後", "後左", "左", "前左"];
const knightVectors: Vec[] = [
  { dx: 1, dy: 2 },
  { dx: 2, dy: 1 },
  { dx: 2, dy: -1 },
  { dx: 1, dy: -2 },
  { dx: -1, dy: -2 },
  { dx: -2, dy: -1 },
  { dx: -2, dy: 1 },
  { dx: -1, dy: 2 },
];
function GrowthConditionFields({
  condition,
  onChange,
}: {
  condition: EvolutionCondition;
  onChange: (condition: EvolutionCondition) => void;
}) {
  if (condition.kind === "captures")
    return (
      <>
        <label>
          対象
          <select
            aria-label="捕獲条件の対象"
            value={condition.subject}
            onChange={(event) => {
              const subject = event.target.value as "self" | "allies";
              onChange({
                ...condition,
                subject,
                threshold: subject === "self" ? 1 : 2,
              });
            }}
          >
            <option value="self">この駒</option>
            <option value="allies">自陣営</option>
          </select>
        </label>
        <ThresholdSelect
          label="必要捕獲数"
          value={condition.threshold}
          values={condition.subject === "self" ? [1, 2, 3] : [2, 4, 6, 8]}
          onChange={(threshold) => onChange({ ...condition, threshold })}
        />
      </>
    );
  if (condition.kind === "losses")
    return (
      <ThresholdSelect
        label="必要損失数"
        value={condition.threshold}
        values={[2, 4, 6, 8]}
        onChange={(threshold) => onChange({ ...condition, threshold })}
      />
    );
  if (condition.kind === "territory")
    return (
      <>
        <label>
          到達する駒
          <select
            aria-label="敵陣到達の対象"
            value={condition.subject}
            onChange={(event) =>
              onChange({
                ...condition,
                subject: event.target.value as "self" | "king",
              })
            }
          >
            <option value="self">この駒</option>
            <option value="king">King</option>
          </select>
        </label>
        <ThresholdSelect
          label="敵陣奥からの列数"
          value={condition.depth}
          values={[1, 2, 3]}
          suffix="列以内"
          onChange={(depth) =>
            onChange({ ...condition, depth: depth as 1 | 2 | 3 })
          }
        />
      </>
    );
  if (condition.kind === "evolutions")
    return (
      <>
        <label>
          進化する陣営
          <select
            aria-label="進化数条件の陣営"
            value={condition.side}
            onChange={(event) =>
              onChange({
                ...condition,
                side: event.target.value as "ally" | "enemy",
              })
            }
          >
            <option value="ally">味方</option>
            <option value="enemy">相手</option>
          </select>
        </label>
        <ThresholdSelect
          label="必要進化数"
          value={condition.threshold}
          values={condition.side === "ally" ? [1, 2, 3, 4] : [1, 2, 3]}
          onChange={(threshold) => onChange({ ...condition, threshold })}
        />
      </>
    );
  return (
    <>
      <label>
        範囲の中心
        <select
          aria-label="周辺条件の中心"
          value={condition.center}
          onChange={(event) =>
            onChange({
              ...condition,
              center: event.target.value as "self" | "king",
            })
          }
        >
          <option value="self">この駒</option>
          <option value="king">King</option>
        </select>
      </label>
      <ThresholdSelect
        label="範囲"
        value={condition.radius}
        values={[1, 2, 3]}
        labels={["3×3", "5×5", "7×7"]}
        onChange={(radius) =>
          onChange({
            ...condition,
            radius: radius as 1 | 2 | 3,
            threshold: radius === 1 ? 1 : radius === 2 ? 2 : 3,
          })
        }
      />
      <ThresholdSelect
        label="必要な敵数"
        value={condition.threshold}
        values={
          condition.radius === 1
            ? [1, 2, 3]
            : condition.radius === 2
              ? [2, 3, 5]
              : [3, 5, 7, 9]
        }
        onChange={(threshold) => onChange({ ...condition, threshold })}
      />
    </>
  );
}
function ThresholdSelect({
  label,
  value,
  values,
  labels,
  suffix = "体",
  onChange,
}: {
  label: string;
  value: number;
  values: number[];
  labels?: string[];
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {values.map((item, index) => (
          <option value={item} key={item}>
            {labels?.[index] ?? `${item}${suffix}`}
          </option>
        ))}
      </select>
    </label>
  );
}
function TransformationPatterns({
  patterns,
  onChange,
}: {
  patterns: Definition["patterns"];
  onChange: (patterns: Definition["patterns"]) => void;
}) {
  const update = (index: number, pattern: Definition["patterns"][number]) =>
    onChange(patterns.map((item, i) => (i === index ? pattern : item)));
  const toggleVector = (index: number, vector: Vec) => {
    const pattern = patterns[index],
      selected = pattern.vectors.some(
        (item) => item.dx === vector.dx && item.dy === vector.dy,
      );
    update(index, {
      ...pattern,
      vectors: selected
        ? pattern.vectors.filter(
            (item) => item.dx !== vector.dx || item.dy !== vector.dy,
          )
        : [...pattern.vectors, vector],
    });
  };
  return (
    <div className="transformation-patterns">
      {patterns.map((pattern, index) => (
        <fieldset className="growth-unlock" key={index}>
          <legend>変身後セット {index + 1}</legend>
          <label>
            種類
            <select
              aria-label={`変身後セット${index + 1}の種類`}
              value={pattern.kind}
              onChange={(event) =>
                update(
                  index,
                  event.target.value === "direction"
                    ? {
                        kind: "direction",
                        vectors: [],
                        range: 1,
                        usage: "both",
                      }
                    : { kind: "leap", vectors: [], usage: "both" },
                )
              }
            >
              <option value="direction">方向移動</option>
              <option value="leap">固定跳躍</option>
            </select>
          </label>
          <label>
            捕獲方式
            <select
              aria-label={`変身後セット${index + 1}の用途`}
              value={pattern.usage ?? "both"}
              onChange={(event) =>
                update(index, {
                  ...pattern,
                  usage: event.target.value as Usage,
                  ...(pattern.kind === "direction" &&
                  ["move", "stationary"].includes(event.target.value)
                    ? { cannon: false }
                    : {}),
                })
              }
            >
              <option value="both">移動・捕獲</option>
              <option value="move">移動専用</option>
              <option value="capture">捕獲専用</option>
              <option value="stationary">静止捕獲</option>
            </select>
          </label>
          <label>
            移動回数
            <select
              aria-label={`変身後セット${index + 1}の移動回数`}
              value={pattern.phase ?? 1}
              onChange={(event) =>
                update(index, {
                  ...pattern,
                  phase: Number(event.target.value) as 1 | 2,
                  ...(pattern.kind === "direction" && event.target.value === "2"
                    ? { cannon: false }
                    : {}),
                })
              }
            >
              <option value="1">1回目</option>
              <option value="2">2回目</option>
            </select>
          </label>
          {pattern.phase === 2 && (
            <label>
              2回目の発動方式
              <select aria-label={`変身後セット${index + 1}の発動方式`} value={pattern.secondTrigger ?? "normal"} onChange={(event) => update(index, { ...pattern, secondTrigger: event.target.value as "normal" | "after-capture" | "flight", usage: event.target.value === "after-capture" ? "move" : pattern.usage })}>
                <option value="normal">通常</option>
                <option value="after-capture">捕獲後移動</option>
                <option value="flight">飛翔</option>
              </select>
            </label>
          )}
          <label><input aria-label="変身直後一度のみ" type="checkbox" checked={!!pattern.evolvedInitialOnly} onChange={(event) => update(index, { ...pattern, evolvedInitialOnly: event.target.checked })} />進化後初回限定（コスト半額）</label>
          <label>
            <input
              type="checkbox"
              checked={!!pattern.initialOnly}
              onChange={(event) =>
                update(index, { ...pattern, initialOnly: event.target.checked })
              }
            />
            初回限定
          </label>
          {pattern.kind === "direction" ? (
            <>
              <label>
                距離
                <select
                  aria-label={`変身後セット${index + 1}の距離`}
                  value={pattern.range}
                  onChange={(event) =>
                    update(index, {
                      ...pattern,
                      range: (event.target.value === "slide"
                        ? "slide"
                        : Number(event.target.value)) as Range,
                      ...(event.target.value === "1"
                        ? {
                            cannon: false,
                            jumpAllies: 0,
                            jumpEnemies: 0,
                          }
                        : {}),
                    })
                  }
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="slide">スライド</option>
                </select>
              </label>
              <div className="checks">
                {directions.map((vector, directionIndex) => (
                  <button
                    type="button"
                    className={
                      pattern.vectors.some(
                        (item) =>
                          item.dx === vector.dx && item.dy === vector.dy,
                      )
                        ? "active"
                        : ""
                    }
                    onClick={() => toggleVector(index, vector)}
                    key={directionIndex}
                  >
                    {dirNames[directionIndex]}
                  </button>
                ))}
              </div>
              <label>
                味方飛び越し
                <select
                  disabled={pattern.range === 1 || !!pattern.cannon}
                  value={jumpLimit(pattern.jumpAllies, pattern.canJump)}
                  onChange={(event) =>
                    update(index, {
                      ...pattern,
                      jumpAllies: Number(event.target.value) as 0 | 1 | 2,
                    })
                  }
                >
                  <option value="0">なし</option>
                  <option value="1">1枚</option>
                  <option value="2">2枚</option>
                </select>
              </label>
              <label>
                敵飛び越し
                <select
                  disabled={pattern.range === 1 || !!pattern.cannon}
                  value={jumpLimit(pattern.jumpEnemies, pattern.canJump)}
                  onChange={(event) =>
                    update(index, {
                      ...pattern,
                      jumpEnemies: Number(event.target.value) as 0 | 1 | 2,
                    })
                  }
                >
                  <option value="0">なし</option>
                  <option value="1">1枚</option>
                  <option value="2">2枚</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={
                    pattern.range === 1 ||
                    pattern.phase === 2 ||
                    ["move", "stationary"].includes(pattern.usage ?? "both") ||
                    !!pattern.jumpAllies ||
                    !!pattern.jumpEnemies
                  }
                  checked={!!pattern.cannon}
                  onChange={(event) =>
                    update(index, { ...pattern, cannon: event.target.checked })
                  }
                />
                キャノン捕獲
              </label>
            </>
          ) : (
            <LeapPicker
              pattern={pattern}
              onToggle={(vector) => toggleVector(index, vector)}
            />
          )}
          <button
            type="button"
            disabled={patterns.length === 1}
            onClick={() => onChange(patterns.filter((_, i) => i !== index))}
          >
            セット削除
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={patterns.length >= 4}
        onClick={() =>
          onChange([
            ...patterns,
            { kind: "direction", vectors: [], range: 1, usage: "both" },
          ])
        }
      >
        変身後セットを追加
      </button>
    </div>
  );
}
function Editor({
  all,
  onSave,
  onDelete,
}: {
  all: Definition[];
  onSave: (d: Definition) => void;
  onDelete: (id: string) => void;
}) {
  const [d, setD] = useState(blank);
  const editing = all.some((x) => x.id === d.id);
  const normalizedSymbol = d.symbol.trim().toUpperCase();
  const usedSymbols = all
    .filter((item) => item.id !== d.id)
    .map((item) => item.symbol.toUpperCase())
    .sort();
  const symbolState = !normalizedSymbol
    ? "記号を入力してください。"
    : (RESERVED_SYMBOLS as readonly string[]).includes(normalizedSymbol)
      ? "標準駒の予約記号です。"
      : usedSymbols.includes(normalizedSymbol)
        ? "別のオリジナル駒が使用中です。"
        : /^[A-Z]{1,2}$/.test(normalizedSymbol)
          ? "使用可能です。"
          : "英字1～2文字で入力してください。";
  const updatePattern = (
    index: number,
    pattern: Definition["patterns"][number],
  ) =>
    setD({
      ...d,
      patterns: d.patterns.map((p, i) => (i === index ? pattern : p)),
    });
  const setGrowthCondition = (condition: EvolutionCondition) =>
    setD({
      ...d,
      growth: d.growth
        ? { ...d.growth, condition }
        : { condition, unlocks: {} },
    });
  const updateUnlock = (
    index: number,
    values: Partial<NonNullable<Definition["growth"]>["unlocks"][number]>,
  ) => {
    if (!d.growth) return;
    const current = d.growth.unlocks[index] ?? {};
    const next = { ...current, ...values };
    const unlocks = { ...d.growth.unlocks };
    if (Object.values(next).some(Boolean)) unlocks[index] = next;
    else delete unlocks[index];
    setD({ ...d, growth: { ...d.growth, unlocks } });
  };
  const toggle = (index: number, v: Vec) => {
    const pattern = d.patterns[index];
    const selected = pattern.vectors.some(
      (x) => x.dx === v.dx && x.dy === v.dy,
    );
    updatePattern(index, {
      ...pattern,
      vectors: selected
        ? pattern.vectors.filter((x) => x.dx !== v.dx || x.dy !== v.dy)
        : [...pattern.vectors, v],
    });
  };
  const e = [
      ...errors(d, all),
      ...(d.patterns.some((pattern) => !pattern.vectors.length)
        ? ["各移動セットに移動先が必要です。"]
        : []),
    ],
    growthPricing = growthCost(d),
    n = growthPricing.total,
    canSave = !e.length && (editing || all.length < MAX_DEFINITIONS);
  return (
    <section>
      <h2>駒エディター</h2>
      <div className="editor">
        <div className="panel form">
          <label>
            名前
            <input
              value={d.name}
              maxLength={20}
              onChange={(x) => setD({ ...d, name: x.target.value })}
            />
          </label>
          <label>
            記号
            <input
              value={d.symbol}
              maxLength={2}
              onChange={(x) =>
                setD({ ...d, symbol: x.target.value.toUpperCase() })
              }
            />
          </label>
          <div className="symbol-guide">
            <p
              className={
                symbolState === "使用可能です。" ? "available" : "error"
              }
            >
              {symbolState}
            </p>
            <p>
              <b>標準予約：</b> {RESERVED_SYMBOLS.join(" ")}
            </p>
            <p>
              <b>使用中：</b>{" "}
              {usedSymbols.length ? usedSymbols.join(" ") : "なし"}
            </p>
          </div>
          <div className="pattern-list">
            {d.patterns.map((pattern, index) => (
              <fieldset className="pattern-card" key={index}>
                <legend>移動セット {index + 1}</legend>
                <div className="pattern-head">
                  <select
                    aria-label={`移動セット${index + 1}の種類`}
                    value={pattern.kind}
                    onChange={(x) =>
                      updatePattern(
                        index,
                        x.target.value === "direction"
                          ? {
                              kind: "direction",
                              vectors: [],
                              range: 1,
                              usage: "both",
                              initialOnly: false,
                              cannon: false,
                              jumpAllies: 0,
                              jumpEnemies: 0,
                            }
                          : {
                              kind: "leap",
                              vectors: [],
                              usage: "both",
                              initialOnly: false,
                            },
                      )
                    }
                  >
                    <option value="direction">方向移動</option>
                    <option value="leap">固定跳躍</option>
                  </select>
                  <button
                    disabled={d.patterns.length === 1}
                    onClick={() =>
                      setD({
                        ...d,
                        patterns: d.patterns.filter((_, i) => i !== index),
                        growth: d.growth
                          ? {
                              ...d.growth,
                              unlocks: Object.fromEntries(
                                Object.entries(d.growth.unlocks)
                                  .filter(([key]) => Number(key) !== index)
                                  .map(([key, value]) => [
                                    Number(key) > index
                                      ? Number(key) - 1
                                      : Number(key),
                                    value,
                                  ]),
                              ),
                            }
                          : undefined,
                      })
                    }
                  >
                    セット削除
                  </button>
                </div>
                <label>
                  捕獲方式
                  <select
                    aria-label={`移動セット${index + 1}の用途`}
                    value={pattern.usage ?? "both"}
                    onChange={(event) =>
                      updatePattern(index, {
                        ...pattern,
                        usage: event.target.value as Usage,
                        ...(pattern.kind === "direction" &&
                        event.target.value === "move"
                          ? { cannon: false }
                          : {}),
                      })
                    }
                  >
                    <option value="both">移動・捕獲</option>
                    <option value="move">移動専用</option>
                    <option value="capture">捕獲専用</option>
                    <option value="stationary">静止捕獲</option>
                  </select>
                </label>
                <label>
                  移動回数
                  <select
                    aria-label={`移動セット${index + 1}の移動回数`}
                    value={pattern.phase ?? 1}
                    onChange={(event) =>
                      updatePattern(index, {
                        ...pattern,
                        phase: Number(event.target.value) as 1 | 2,
                        ...(pattern.kind === "direction" &&
                        event.target.value === "2"
                          ? { cannon: false }
                          : {}),
                      })
                    }
                  >
                    <option value="1">1回目</option>
                    <option value="2">2回目（追加コスト）</option>
                  </select>
                </label>
                {pattern.phase === 2 && (
                  <label>
                    2回目の発動方式
                    <select aria-label={`移動セット${index + 1}の発動方式`} value={pattern.secondTrigger ?? "normal"} onChange={(event) => updatePattern(index, { ...pattern, secondTrigger: event.target.value as "normal" | "after-capture" | "flight", evolutionOnly: event.target.value !== "normal" ? true : pattern.evolutionOnly, usage: event.target.value === "after-capture" ? "move" : pattern.usage })}>
                      <option value="normal">通常</option><option value="after-capture">捕獲後移動（進化限定）</option><option value="flight">飛翔（進化限定）</option>
                    </select>
                  </label>
                )}
                <label><input type="checkbox" checked={!!pattern.evolutionOnly} onChange={(event) => updatePattern(index, { ...pattern, evolutionOnly: event.target.checked })} />成長・変身後限定</label>
                <label><input aria-label="進化直後一度のみ" type="checkbox" checked={!!pattern.evolvedInitialOnly} onChange={(event) => updatePattern(index, { ...pattern, evolvedInitialOnly: event.target.checked })} />進化後初回限定（コスト半額）</label>
                <label>
                  <input
                    type="checkbox"
                    checked={!!pattern.initialOnly}
                    onChange={(event) =>
                      updatePattern(index, {
                        ...pattern,
                        initialOnly: event.target.checked,
                      })
                    }
                  />
                  初回限定（基本移動コスト半額）
                </label>
                {pattern.kind === "direction" ? (
                  <>
                    <label>
                      距離
                      <select
                        value={pattern.range}
                        onChange={(x) =>
                          updatePattern(index, {
                            ...pattern,
                            range: (x.target.value === "slide"
                              ? "slide"
                              : Number(x.target.value)) as Range,
                            jumpAllies:
                              x.target.value === "1"
                                ? false
                                : pattern.jumpAllies,
                            jumpEnemies:
                              x.target.value === "1"
                                ? false
                                : pattern.jumpEnemies,
                            cannon:
                              x.target.value === "1" ? false : pattern.cannon,
                            canJump: undefined,
                          })
                        }
                      >
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="slide">スライド</option>
                      </select>
                    </label>
                    <div className="checks">
                      {directions.map((v, i) => (
                        <button
                          className={
                            pattern.vectors.some(
                              (x) => x.dx === v.dx && x.dy === v.dy,
                            )
                              ? "active"
                              : ""
                          }
                          onClick={() => toggle(index, v)}
                          key={i}
                        >
                          {dirNames[i]}
                        </button>
                      ))}
                    </div>
                    <label>
                      味方飛び越し上限
                      <select
                        disabled={pattern.range === 1}
                        value={
                          pattern.range === 1
                            ? 0
                            : jumpLimit(pattern.jumpAllies, pattern.canJump)
                        }
                        onChange={(x) =>
                          updatePattern(index, {
                            ...pattern,
                            jumpAllies: Number(x.target.value) as 0 | 1 | 2,
                            cannon: Number(x.target.value)
                              ? false
                              : pattern.cannon,
                            canJump: undefined,
                          })
                        }
                      >
                        <option value="0">0枚</option>
                        <option value="1">1枚</option>
                        <option value="2">2枚</option>
                      </select>
                    </label>
                    <label>
                      敵飛び越し上限
                      <select
                        disabled={pattern.range === 1}
                        value={
                          pattern.range === 1
                            ? 0
                            : jumpLimit(pattern.jumpEnemies, pattern.canJump)
                        }
                        onChange={(x) =>
                          updatePattern(index, {
                            ...pattern,
                            jumpEnemies: Number(x.target.value) as 0 | 1 | 2,
                            cannon: Number(x.target.value)
                              ? false
                              : pattern.cannon,
                            canJump: undefined,
                          })
                        }
                      >
                        <option value="0">0枚</option>
                        <option value="1">1枚</option>
                        <option value="2">2枚</option>
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        disabled={
                          pattern.range === 1 ||
                          (pattern.usage ?? "both") === "move" ||
                          (pattern.usage ?? "both") === "stationary" ||
                          pattern.phase === 2
                        }
                        checked={!!pattern.cannon}
                        onChange={(event) =>
                          updatePattern(index, {
                            ...pattern,
                            cannon: event.target.checked,
                            jumpAllies: event.target.checked
                              ? false
                              : pattern.jumpAllies,
                            jumpEnemies: event.target.checked
                              ? false
                              : pattern.jumpEnemies,
                            canJump: event.target.checked
                              ? undefined
                              : pattern.canJump,
                          })
                        }
                      />
                      キャノン捕獲（スクリーン1枚必須）
                    </label>
                  </>
                ) : (
                  <>
                    <p>到達地点を選択（移動専用+2、その他+3／地点）</p>
                    <LeapPicker
                      pattern={pattern}
                      onToggle={(v) => toggle(index, v)}
                    />
                    <div className="row">
                      <button
                        onClick={() =>
                          updatePattern(index, {
                            ...pattern,
                            vectors: knightVectors,
                          })
                        }
                      >
                        ナイト型
                      </button>
                      <button
                        onClick={() =>
                          updatePattern(index, { ...pattern, vectors: [] })
                        }
                      >
                        全解除
                      </button>
                    </div>
                  </>
                )}
              </fieldset>
            ))}
          </div>
          <button
            disabled={d.patterns.length >= 4}
            onClick={() =>
              setD({
                ...d,
                patterns: [
                  ...d.patterns,
                  {
                    kind: "direction",
                    vectors: [],
                    range: 1,
                    usage: "both",
                    phase: 1,
                    initialOnly: false,
                    cannon: false,
                    jumpAllies: 0,
                    jumpEnemies: 0,
                  },
                ],
              })
            }
          >
            移動セットを追加
          </button>
          <label>
            <input
              type="checkbox"
              checked={d.isCrown}
              onChange={(x) =>
                setD({
                  ...d,
                  isCrown: x.target.checked,
                  growth:
                    x.target.checked && d.growth?.unlockCrown
                      ? { ...d.growth, unlockCrown: false }
                      : d.growth,
                })
              }
            />
            王冠 (+25)
          </label>
          <fieldset className="pattern-card growth-card">
            <legend>成長</legend>
            <label>
              進化方式
              <select
                aria-label="進化方式"
                value={d.growth ? "growth" : d.transformation ? "transformation" : d.summoning ? "summoning" : "none"}
                onChange={(event) =>
                  setD({
                    ...d,
                    growth:
                      event.target.value === "growth"
                        ? {
                            condition: {
                              kind: "captures",
                              subject: "self",
                              threshold: 1,
                            },
                            unlocks: {},
                          }
                        : undefined,
                    transformation:
                      event.target.value === "transformation"
                        ? {
                            condition: {
                              kind: "captures",
                              subject: "self",
                              threshold: 1,
                            },
                            name: "",
                            symbol: "",
                            patterns: [
                              {
                                kind: "direction",
                                vectors: [],
                                range: 1,
                                usage: "both",
                              },
                            ],
                          }
                        : undefined,
                    summoning:
                      event.target.value === "summoning"
                        ? { condition: { kind: "captures", subject: "self", threshold: 1 }, timing: "summon", range: "adjacent", name: "", symbol: "", patterns: [{ kind: "direction", vectors: [], range: 1, usage: "both" }] }
                        : undefined,
                  })
                }
              >
                <option value="none">なし</option>
                <option value="summoning">召喚・継承・分裂</option>
                <option value="growth">成長</option>
                <option value="transformation">変身</option>
              </select>
            </label>
            {d.growth && (
              <>
                <label>
                  条件カテゴリー
                  <select
                    aria-label="成長条件カテゴリー"
                    value={d.growth.condition.kind}
                    onChange={(event) => {
                      const kind = event.target.value;
                      setGrowthCondition(
                        kind === "losses"
                          ? { kind, threshold: 2 }
                          : kind === "territory"
                            ? { kind, subject: "self", depth: 3 }
                            : kind === "evolutions"
                              ? {
                                  kind,
                                  side: "ally",
                                  threshold: 1,
                                }
                              : kind === "nearbyEnemies"
                                ? {
                                    kind,
                                    center: "self",
                                    radius: 1,
                                    threshold: 1,
                                  }
                                : {
                                    kind: "captures",
                                    subject: "self",
                                    threshold: 1,
                                  },
                      );
                    }}
                  >
                    <option value="captures">捕獲数</option>
                    <option value="losses">自陣営の損失数</option>
                    <option value="territory">敵陣到達</option>
                    <option value="evolutions">進化数</option>
                    <option value="nearbyEnemies">周辺の敵数</option>
                  </select>
                </label>
                <GrowthConditionFields
                  condition={d.growth.condition}
                  onChange={setGrowthCondition}
                />
                <label>
                  <input
                    type="checkbox"
                    disabled={d.isCrown}
                    checked={!!d.growth.unlockCrown}
                    onChange={(event) =>
                      setD({
                        ...d,
                        growth: {
                          ...d.growth!,
                          unlockCrown: event.target.checked,
                        },
                      })
                    }
                  />
                  成長後にCrown化
                </label>
                <label><input type="checkbox" checked={!!d.growth.localSwap} onChange={(event) => setD({ ...d, growth: { ...d.growth!, localSwap: event.target.checked } })} />成長後に近接交換 (+3)</label>
                <label><input type="checkbox" checked={!!d.growth.globalSwap} onChange={(event) => setD({ ...d, growth: { ...d.growth!, globalSwap: event.target.checked } })} />成長後に全域交換・1回 (+5)</label>
                {d.patterns.map((pattern, index) => {
                  const unlock = d.growth?.unlocks[index] ?? {};
                  const moveOnly = (pattern.usage ?? "both") === "move";
                  const ranged =
                    pattern.kind === "direction" && pattern.range !== 1;
                  return (
                    <fieldset className="growth-unlock" key={index}>
                      <legend>移動セット {index + 1} の解放</legend>
                      <label>
                        <input
                          type="checkbox"
                          disabled={!moveOnly || !!unlock.stationary}
                          checked={!!unlock.capture}
                          onChange={(event) =>
                            updateUnlock(index, {
                              capture: event.target.checked,
                            })
                          }
                        />
                        通常捕獲
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          disabled={!moveOnly || !!unlock.capture}
                          checked={!!unlock.stationary}
                          onChange={(event) =>
                            updateUnlock(index, {
                              stationary: event.target.checked,
                            })
                          }
                        />
                        静止捕獲
                      </label>
                      {ranged && (
                        <>
                          <label>
                            成長後の味方飛び越し
                            <select
                              aria-label={`移動セット${index + 1}の成長後味方飛び越し`}
                              disabled={!!unlock.cannon}
                              value={unlock.jumpAllies ?? 0}
                              onChange={(event) =>
                                updateUnlock(index, {
                                  jumpAllies: Number(event.target.value) as
                                    | 0
                                    | 1
                                    | 2,
                                })
                              }
                            >
                              <option value="0">なし</option>
                              <option value="1">1枚</option>
                              <option value="2">2枚</option>
                            </select>
                          </label>
                          <label>
                            成長後の敵飛び越し
                            <select
                              aria-label={`移動セット${index + 1}の成長後敵飛び越し`}
                              disabled={!!unlock.cannon}
                              value={unlock.jumpEnemies ?? 0}
                              onChange={(event) =>
                                updateUnlock(index, {
                                  jumpEnemies: Number(event.target.value) as
                                    | 0
                                    | 1
                                    | 2,
                                })
                              }
                            >
                              <option value="0">なし</option>
                              <option value="1">1枚</option>
                              <option value="2">2枚</option>
                            </select>
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              disabled={
                                !!unlock.jumpAllies || !!unlock.jumpEnemies
                              }
                              checked={!!unlock.cannon}
                              onChange={(event) =>
                                updateUnlock(index, {
                                  cannon: event.target.checked,
                                })
                              }
                            />
                            追加キャノン捕獲
                          </label>
                        </>
                      )}
                    </fieldset>
                  );
                })}
              </>
            )}
            {d.transformation && (
              <>
                <label>
                  条件カテゴリー
                  <select
                    aria-label="変身条件カテゴリー"
                    value={d.transformation.condition.kind}
                    onChange={(event) => {
                      const kind = event.target.value;
                      const condition: EvolutionCondition =
                        kind === "losses"
                          ? { kind, threshold: 2 }
                          : kind === "territory"
                            ? { kind, subject: "self", depth: 3 }
                            : kind === "evolutions"
                              ? { kind, side: "ally", threshold: 1 }
                              : kind === "nearbyEnemies"
                                ? {
                                    kind,
                                    center: "self",
                                    radius: 1,
                                    threshold: 1,
                                  }
                                : {
                                    kind: "captures",
                                    subject: "self",
                                    threshold: 1,
                                  };
                      setD({
                        ...d,
                        transformation: { ...d.transformation!, condition },
                      });
                    }}
                  >
                    <option value="captures">捕獲数</option>
                    <option value="losses">自陣営の損失数</option>
                    <option value="territory">敵陣到達</option>
                    <option value="evolutions">進化数</option>
                    <option value="nearbyEnemies">周辺の敵数</option>
                  </select>
                </label>
                <GrowthConditionFields
                  condition={d.transformation.condition}
                  onChange={(condition) =>
                    setD({
                      ...d,
                      transformation: { ...d.transformation!, condition },
                    })
                  }
                />
                <label><input type="checkbox" checked={!!d.transformation.localSwap} onChange={(event) => setD({ ...d, transformation: { ...d.transformation!, localSwap: event.target.checked } })} />変身後に近接交換 (+3)</label>
                <label><input type="checkbox" checked={!!d.transformation.globalSwap} onChange={(event) => setD({ ...d, transformation: { ...d.transformation!, globalSwap: event.target.checked } })} />変身後に全域交換・1回 (+5)</label>
                <label>
                  変身後名称
                  <input
                    aria-label="変身後名称"
                    maxLength={20}
                    value={d.transformation.name}
                    onChange={(event) =>
                      setD({
                        ...d,
                        transformation: {
                          ...d.transformation!,
                          name: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  変身後記号
                  <input
                    aria-label="変身後記号"
                    maxLength={2}
                    value={d.transformation.symbol}
                    onChange={(event) =>
                      setD({
                        ...d,
                        transformation: {
                          ...d.transformation!,
                          symbol: event.target.value.toUpperCase(),
                        },
                      })
                    }
                  />
                </label>
                <TransformationPatterns
                  patterns={d.transformation.patterns}
                  onChange={(patterns) =>
                    setD({
                      ...d,
                      transformation: { ...d.transformation!, patterns },
                    })
                  }
                />
              </>
            )}
            {d.summoning && (
              <>
                <label>発動方式<select aria-label="召喚方式" value={d.summoning.timing} onChange={(event) => setD({ ...d, summoning: { ...d.summoning!, timing: event.target.value as "summon" | "inherit" | "split", range: event.target.value === "summon" ? d.summoning!.range : "adjacent" } })}><option value="summon">通常召喚</option><option value="inherit">継承</option><option value="split">分裂</option></select></label>
                {d.summoning.timing === "summon" && <label>召喚範囲<select aria-label="召喚範囲" value={d.summoning.range} onChange={(event) => setD({ ...d, summoning: { ...d.summoning!, range: event.target.value as "adjacent" | "movement" } })}><option value="adjacent">周囲8マス</option><option value="movement">1回目の移動範囲 (+3)</option></select></label>}
                <GrowthConditionFields condition={d.summoning.condition} onChange={(condition) => setD({ ...d, summoning: { ...d.summoning!, condition } })} />
                <label>派生駒名称<input aria-label="派生駒名称" maxLength={20} value={d.summoning.name} onChange={(event) => setD({ ...d, summoning: { ...d.summoning!, name: event.target.value } })} /></label>
                <label>派生駒記号<input aria-label="派生駒記号" maxLength={2} value={d.summoning.symbol} onChange={(event) => setD({ ...d, summoning: { ...d.summoning!, symbol: event.target.value.toUpperCase() } })} /></label>
                <TransformationPatterns patterns={d.summoning.patterns} onChange={(patterns) => setD({ ...d, summoning: { ...d.summoning!, patterns } })} />
                <p>派生駒コスト上限：{summonLimit(d)}</p>
              </>
            )}
          </fieldset>
        </div>
        <div className="panel">
          <h3>
            コスト <strong className={n > 30 ? "danger" : ""}>{n}/30</strong>
          </h3>
          {d.growth && (
            <p>
              通常 {growthPricing.base} + 成長 {growthPricing.premium}（難度
              {growthPricing.difficulty}）
            </p>
          )}
          {d.transformation && (
            <p>
              変身前 {definitionCost(d)}／30・変身後{" "}
              {definitionCost(transformedDefinition(d)) + (d.transformation.localSwap ? 3 : 0) + (d.transformation.globalSwap ? 5 : 0)}/
              {transformationLimit(d)}
            </p>
          )}
          <Preview d={d} />
          {e.map((x) => (
            <p className="error" key={x}>
              {x}
            </p>
          ))}
          <button
            disabled={!canSave}
            onClick={() => {
              onSave(normalize(d));
              setD(blank());
            }}
          >
            {editing ? "変更を保存" : "保存"}
          </button>
          {editing && (
            <button onClick={() => setD(blank())}>編集をキャンセル</button>
          )}
          <p>
            {all.length}/{MAX_DEFINITIONS}種類
          </p>
        </div>
      </div>
      <div className="cards">
        {all.map((x) => (
          <article className="card" key={x.id}>
            <b>
              {x.symbol} {x.name}
            </b>
            <span>
              {definitionCost(x)}/30 {x.isCrown ? "♛王冠" : ""}{" "}
              {x.growth ? "成長あり" : ""}{" "}
              {x.transformation ? "変身あり" : ""}{" "}
              {usesLegacyJump(x) ? "旧コスト" : ""}
            </span>
            <button onClick={() => setD(editable(x))}>編集</button>
            <button onClick={() => onDelete(x.id)}>削除</button>
          </article>
        ))}
      </div>
    </section>
  );
}
function LeapPicker({
  pattern,
  onToggle,
}: {
  pattern: Extract<Definition["patterns"][number], { kind: "leap" }>;
  onToggle: (v: Vec) => void;
}) {
  const cells = Array.from({ length: 49 }, (_, i) => ({
    dy: Math.floor(i / 7) - 3,
    dx: (i % 7) - 3,
  }));
  return (
    <div className="leap-picker">
      {cells.map((v) => {
        const origin = v.dx === 0 && v.dy === 0;
        const selected = pattern.vectors.some(
          (x) => x.dx === v.dx && x.dy === v.dy,
        );
        return (
          <button
            type="button"
            aria-label={origin ? "駒の位置" : `跳躍 ${v.dx},${v.dy}`}
            className={origin ? "origin" : selected ? "active" : ""}
            disabled={origin}
            onClick={() => onToggle(v)}
            key={`${v.dx},${v.dy}`}
          >
            {origin ? "駒" : ""}
          </button>
        );
      })}
    </div>
  );
}
function Preview({ d }: { d: Definition }) {
  const cells = Array.from({ length: 49 }, (_, i) => ({
    row: Math.floor(i / 7) - 3,
    col: (i % 7) - 3,
  }));
  const targets = new Map<
    string,
    {
      move: boolean;
      capture: boolean;
      stationary: boolean;
      leap: boolean;
      initial: boolean;
      cannon: boolean;
    }
  >();
  for (const p of d.patterns)
    for (const v of p.vectors) {
      const max = p.kind === "leap" ? 1 : p.range === "slide" ? 3 : p.range;
      for (let n = 1; n <= max; n++) {
        const key = `${v.dy * n},${v.dx * n}`;
        const target = targets.get(key) ?? {
          move: false,
          capture: false,
          stationary: false,
          leap: false,
          initial: false,
          cannon: false,
        };
        const usage = p.usage ?? "both";
        target.move ||= usage !== "capture";
        target.capture ||= usage !== "move";
        target.stationary ||= usage === "stationary";
        target.leap ||= p.kind === "leap";
        target.initial ||= !!p.initialOnly;
        target.cannon ||= p.kind === "direction" && !!p.cannon;
        targets.set(key, target);
      }
    }
  return (
    <div className="preview">
      {cells.map((p, i) => {
        const origin = p.row === 0 && p.col === 0;
        const target = targets.get(`${p.row},${p.col}`);
        const mode = target
          ? target.move && target.capture
            ? "target-both"
            : target.move
              ? "target-move"
              : "target-capture"
          : "";
        return (
          <span
            className={`${origin ? "origin" : mode} ${target?.leap ? "fixed-leap" : ""} ${target?.initial ? "initial-only" : ""} ${target?.cannon ? "cannon-range" : ""} ${target?.stationary ? "stationary-capture" : ""}`}
            key={i}
          >
            {origin ? d.symbol || "駒" : ""}
          </span>
        );
      })}
    </div>
  );
}
const editorRoles: { role: Exclude<Role, "custom">; label: string }[] = [
  { role: "king", label: "KI King" },
  { role: "queen", label: "QU Queen" },
  { role: "rook", label: "RO Rook" },
  { role: "bishop", label: "BI Bishop" },
  { role: "knight", label: "KN Knight" },
  { role: "pawn", label: "PO Pawn" },
];
function PositionEditor({
  defs,
  draft,
  setDraft,
  resetFromSetup,
}: {
  defs: Definition[];
  draft: BoardDraft;
  setDraft: (draft: BoardDraft) => void;
  resetFromSetup: () => BoardDraft;
}) {
  const [tool, setTool] = useState("standard:pawn"),
    [color, setColor] = useState<Color>("white"),
    [moved, setMoved] = useState(false),
    [evolved, setEvolved] = useState(false),
    [erasing, setErasing] = useState(false),
    [previous, setPrevious] = useState<BoardDraft | null>(null);
  const replaceDraft = (next: BoardDraft) => {
    setPrevious(draft);
    setDraft(next);
  };
  const selectedPiece = (): DraftPiece => {
    const [kind, value] = tool.split(":");
    return kind === "custom"
      ? {
          color,
          role: "custom",
          definitionId: value,
          moved,
          evolved,
          captures: 0,
          reachedEnemyDepth: 8,
        }
      : { color, role: value as Exclude<Role, "custom">, moved };
  };
  const selectedCustom = tool.startsWith("custom:")
    ? defs.find((definition) => definition.id === tool.slice(7))
    : undefined;
  return (
    <div className="position-editor">
      <div className="board editor-board" aria-label="局面編集盤">
        {draft.map((piece, index) => (
          <button
            type="button"
            aria-label={`局面 ${Math.floor(index / 8)},${index % 8}`}
            className={(Math.floor(index / 8) + index) % 2 ? "dark" : "light"}
            onClick={() => {
              const next = [...draft];
              next[index] = erasing ? null : selectedPiece();
              replaceDraft(next);
            }}
            key={index}
          >
            {piece && (
              <span className={piece.color}>
                {pieceText({ ...piece, id: `draft-${index}` }, defs)}
                {piece.moved && <small aria-label="移動済み">●</small>}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="formation-control position-tools">
        <label>
          配置する駒
          <select
            aria-label="局面に配置する駒"
            disabled={erasing}
            value={tool}
            onChange={(event) => {
              setTool(event.target.value);
              if (!event.target.value.startsWith("custom:")) setEvolved(false);
            }}
          >
            <optgroup label="標準駒">
              {editorRoles.map(({ role, label }) => (
                <option value={`standard:${role}`} key={role}>
                  {label}
                </option>
              ))}
            </optgroup>
            {!!defs.length && (
              <optgroup label="オリジナル駒">
                {defs.map((definition) => (
                  <option value={`custom:${definition.id}`} key={definition.id}>
                    {definition.symbol} {definition.name}
                    {definition.isCrown ? " Crown" : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label>
          陣営
          <select
            aria-label="配置する駒の陣営"
            disabled={erasing}
            value={color}
            onChange={(event) => setColor(event.target.value as Color)}
          >
            <option value="white">白</option>
            <option value="black">黒</option>
          </select>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            disabled={erasing}
            checked={moved}
            onChange={(event) => setMoved(event.target.checked)}
          />
          移動済みとして配置
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            disabled={
              erasing ||
              (!selectedCustom?.growth && !selectedCustom?.transformation)
            }
            checked={
              evolved &&
              !!(selectedCustom?.growth || selectedCustom?.transformation)
            }
            onChange={(event) => setEvolved(event.target.checked)}
          />
          進化済みとして配置
        </label>
        <div className="position-tool-actions">
          <button
            type="button"
            className={erasing ? "active" : ""}
            aria-pressed={erasing}
            onClick={() => setErasing(!erasing)}
          >
            消しゴム
          </button>
          <button
            type="button"
            disabled={!previous}
            onClick={() => {
              if (!previous) return;
              const current = draft;
              setDraft(previous);
              setPrevious(current);
            }}
          >
            元に戻す
          </button>
        </div>
        <div className="position-tool-actions">
          <button type="button" onClick={() => replaceDraft(resetFromSetup())}>
            現在の編成から作成
          </button>
          <button type="button" onClick={() => replaceDraft(emptyBoardDraft())}>
            空盤面
          </button>
        </div>
        <p>盤面をタップすると、選択中の設定で配置・上書きします。</p>
        <p>●は移動済みです。初回限定能力やキャスリングへ影響します。</p>
      </div>
    </div>
  );
}
function SetupView({
  defs,
  setup,
  setSetup,
  preset,
  setPreset,
  mode: gameMode,
  setMode: setGameMode,
  difficulty,
  blackDifficulty,
  setDifficulty,
  setBlackDifficulty,
  start,
}: {
  defs: Definition[];
  setup: Setup;
  setSetup: (s: Setup) => void;
  preset: Preset;
  setPreset: (p: Preset) => void;
  mode: GameMode;
  setMode: (mode: GameMode) => void;
  difficulty: AIDifficulty;
  blackDifficulty: AIDifficulty;
  setDifficulty: (difficulty: AIDifficulty) => void;
  setBlackDifficulty: (difficulty: AIDifficulty) => void;
  start: (match?: Match) => void;
}) {
  const [selectedSlot, setSelectedSlot] = useState(0),
    [placementMode, setPlacementMode] = useState<PlacementMode>("formation"),
    [draft, setDraft] = useState<BoardDraft>(() =>
      boardDraftFromSetup(defs, setup, preset),
    ),
    [draftTurn, setDraftTurn] = useState<Color>("white");
  const formation = formationFromSetup(setup);
  const layoutMode = formationMode(setup);
  const crowns = countCrowns(formation, defs);
  const draftIssues = boardDraftErrors(draft, defs, preset);
  const issues =
    placementMode === "formation"
      ? formationErrors(formation, layoutMode, defs)
      : draftIssues;
  const warnings =
    placementMode === "editor"
      ? boardDraftWarnings(draft, defs, preset, draftTurn)
      : [];
  const editorCrownCounts = (["white", "black"] as Color[]).map(
    (color) =>
      draft.filter(
        (piece) =>
          piece?.color === color &&
          piece.role === "custom" &&
          (() => {
            const definition = defs.find(
              (item) => item.id === piece.definitionId,
            );
            return definition?.isCrown || definition?.growth?.unlockCrown;
          })(),
      ).length,
  );
  const tooManyCrownsForAll =
    placementMode === "formation"
      ? crowns >= 2
      : editorCrownCounts.some((count) => count >= 2);
  const files = "abcdefgh";
  const standardSymbols = ["RO", "KN", "BI", "QU", "KI", "BI", "KN", "RO"];
  const selectedId = formation[selectedSlot];
  const selectedDefinition = defs.find(
    (definition) => definition.id === selectedId,
  );
  const changeFormation = (next: (string | null)[]) =>
    setSetup({ ...setup, mode: layoutMode, formation: next });
  const canPlace = (definition: Definition) => {
    if (layoutMode === "free") return true;
    const next = [...formation];
    next[selectedSlot] = definition.id;
    return !formationErrors(next, layoutMode, defs).length;
  };
  useEffect(() => {
    if (tooManyCrownsForAll && preset === "royal-all")
      setPreset("royal-any");
  }, [tooManyCrownsForAll, preset, setPreset]);
  return (
    <section>
      <h2>対局設定</h2>
      <div className="panel setup">
        <label>
          配置方法
          <select
            aria-label="配置方法"
            value={placementMode}
            onChange={(event) =>
              setPlacementMode(event.target.value as PlacementMode)
            }
          >
            <option value="formation">通常編成</option>
            <option value="editor">盤面編集</option>
          </select>
        </label>
        {gameMode === "ai-ai" && <label>黒AI難易度<select aria-label="観戦の黒AI難易度" value={blackDifficulty} onChange={(event) => setBlackDifficulty(event.target.value as AIDifficulty)}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label>}
        {placementMode === "formation" && (
          <label>
            配置モード
            <select
              value={layoutMode}
              onChange={(event) =>
                setSetup({
                  ...setup,
                  mode: event.target.value as FormationMode,
                  formation,
                })
              }
            >
              <option value="balanced">バランス配置</option>
              <option value="free">自由配置</option>
            </select>
          </label>
        )}
        <label>
          ルール
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
          >
            <option value="classic">クラシック拡張</option>
            <option value="royal-any">ロイヤルハント ANY</option>
            <option value="royal-all" disabled={tooManyCrownsForAll}>
              ロイヤルハント ALL
            </option>
          </select>
        </label>
        {tooManyCrownsForAll && (
          <p className="notice-inline">
            いずれかの陣営にCrownが2体以上いるためRoyal Hunt ALLは選択できません。
          </p>
        )}
        <label>
          対局モード
          <select
            value={gameMode}
            onChange={(event) => setGameMode(event.target.value as GameMode)}
          >
            <option value="local">ローカル2人対戦</option>
            <option value="ai">AI対戦（人間：白）</option>
            <option value="ai-ai">AI対AI観戦</option>
          </select>
        </label>
        <label>
          AI難易度
          <select
            disabled={gameMode === "local"}
            value={difficulty}
            onChange={(event) =>
              setDifficulty(event.target.value as AIDifficulty)
            }
          >
            <option value="easy">EASY</option>
            <option value="normal">NORMAL</option>
            <option value="hard">HARD</option>
          </select>
        </label>
        {placementMode === "editor" && (
          <label>
            手番
            <select
              aria-label="編集局面の手番"
              value={draftTurn}
              onChange={(event) => setDraftTurn(event.target.value as Color)}
            >
              <option value="white">白</option>
              <option value="black">黒</option>
            </select>
          </label>
        )}
        {placementMode === "formation" ? (
          <div className="formation-editor">
            <div className="formation-grid" aria-label="白の編成">
              {formation.map((definitionId, index) => {
                const definition = defs.find(
                  (item) => item.id === definitionId,
                );
                const symbol =
                  definition?.symbol ??
                  (index < 8 ? standardSymbols[index] : "PO");
                const square = `${files[index % 8]}${index < 8 ? 1 : 2}`;
                return (
                  <button
                    type="button"
                    className={selectedSlot === index ? "selected-slot" : ""}
                    disabled={index === KING_SLOT}
                    aria-label={`編成 ${square}`}
                    onClick={() => setSelectedSlot(index)}
                    key={index}
                  >
                    <span>{symbol}</span>
                    <small>{square}</small>
                  </button>
                );
              })}
            </div>
            <div className="formation-control">
              <h3>
                {files[selectedSlot % 8]}
                {selectedSlot < 8 ? 1 : 2} の駒
              </h3>
              <label>
                配置する駒
                <select
                  aria-label="配置する駒"
                  disabled={selectedSlot === KING_SLOT}
                  value={selectedId ?? ""}
                  onChange={(event) => {
                    const next = [...formation];
                    next[selectedSlot] = event.target.value || null;
                    changeFormation(next);
                  }}
                >
                  <option value="">標準駒</option>
                  {defs.map((definition) => (
                    <option
                      value={definition.id}
                      disabled={!canPlace(definition)}
                      key={definition.id}
                    >
                      {definition.symbol} {definition.name} ({definitionCost(definition)})
                      {definition.isCrown ? " Crown" : ""}
                      {usesLegacyJump(definition) ? " 旧コスト" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {layoutMode === "free"
                  ? "King以外・コスト30まで配置可能"
                  : `この枠の上限：${slotLimit(selectedSlot)}`}
              </p>
              {selectedDefinition && (
                <p>
                  選択中：{selectedDefinition.symbol} {selectedDefinition.name}
                </p>
              )}
              <p>Crown：{crowns}体／陣営</p>
            </div>
          </div>
        ) : (
          <>
            <PositionEditor
              defs={defs}
              draft={draft}
              setDraft={setDraft}
              resetFromSetup={() => boardDraftFromSetup(defs, setup, preset)}
            />
            <p>
              Crown：白 {editorCrownCounts[0]}体／黒 {editorCrownCounts[1]}体
            </p>
          </>
        )}
        {issues.map((issue) => (
          <p className="error" key={issue}>
            {issue}
          </p>
        ))}
        {warnings.map((warning) => (
          <p className="warning" key={warning}>
            警告：{warning}
          </p>
        ))}
        <button
          disabled={!!issues.length}
          onClick={() =>
            start(
              placementMode === "editor"
                ? createMatchFromDraft(draft, defs, preset, draftTurn)
                : undefined,
            )
          }
        >
          対局開始
        </button>
      </div>
    </section>
  );
}
const orthogonal = directions.filter((v) => v.dx === 0 || v.dy === 0);
const diagonal = directions.filter((v) => v.dx !== 0 && v.dy !== 0);
function conditionDescription(condition: EvolutionCondition) {
  if (condition.kind === "captures")
    return `${condition.subject === "self" ? "この駒" : "自陣営"}が${condition.threshold}体捕獲`;
  if (condition.kind === "losses")
    return `自陣営が${condition.threshold}体捕獲される`;
  if (condition.kind === "territory")
    return `${condition.subject === "self" ? "この駒" : "King"}が敵陣奥から${condition.depth}列以内へ到達`;
  if (condition.kind === "evolutions")
    return `${condition.side === "ally" ? "味方" : "相手"}が${condition.threshold}体進化`;
  return `${condition.center === "self" ? "この駒" : "King"}の${condition.radius * 2 + 1}×${condition.radius * 2 + 1}以内に敵${condition.threshold}体`;
}
function evolutionProgress(piece: NonNullable<Match["board"][number]>, match: Match, definition: Definition) {
  if (piece.evolved) return "達成済み";
  const condition = (definition.growth ?? definition.transformation)!.condition,
    stats = match.stats?.[piece.color],
    enemyStats = match.stats?.[other(piece.color)];
  if (condition.kind === "captures")
    return `${condition.subject === "self" ? piece.captures ?? 0 : stats?.captures ?? 0}/${condition.threshold}`;
  if (condition.kind === "losses")
    return `${stats?.losses ?? 0}/${condition.threshold}`;
  if (condition.kind === "evolutions")
    return `${condition.side === "ally" ? stats?.evolutions ?? 0 : enemyStats?.evolutions ?? 0}/${condition.threshold}`;
  if (condition.kind === "territory") {
    const depth =
      condition.subject === "self"
        ? piece.reachedEnemyDepth ?? 8
        : stats?.kingDepth ?? 8;
    return depth <= condition.depth ? "達成待ち" : `あと${depth - condition.depth}列`;
  }
  return "手番終了時に判定";
}
const standardGuides: { key: string; label: string; definition: Definition }[] =
  [
    [
      "king",
      "キング",
      "KI",
      [{ kind: "direction", vectors: directions, range: 1, usage: "both" }],
    ],
    [
      "queen",
      "クイーン",
      "QU",
      [
        {
          kind: "direction",
          vectors: directions,
          range: "slide",
          usage: "both",
        },
      ],
    ],
    [
      "rook",
      "ルーク",
      "RO",
      [
        {
          kind: "direction",
          vectors: orthogonal,
          range: "slide",
          usage: "both",
        },
      ],
    ],
    [
      "bishop",
      "ビショップ",
      "BI",
      [{ kind: "direction", vectors: diagonal, range: "slide", usage: "both" }],
    ],
    [
      "knight",
      "ナイト",
      "KN",
      [{ kind: "leap", vectors: knightVectors, usage: "both" }],
    ],
    [
      "pawn",
      "ポーン",
      "PO",
      [
        {
          kind: "direction",
          vectors: [{ dx: 0, dy: -1 }],
          range: 1,
          usage: "move",
        },
        {
          kind: "direction",
          vectors: [
            { dx: -1, dy: -1 },
            { dx: 1, dy: -1 },
          ],
          range: 1,
          usage: "capture",
        },
      ],
    ],
  ].map(([key, label, symbol, patterns]) => ({
    key: `standard:${key as string}`,
    label: label as string,
    definition: {
      id: `standard:${key as string}`,
      name: label as string,
      symbol: symbol as string,
      patterns: patterns as Definition["patterns"],
      isCrown: false,
    },
  }));

function MovementViewer({
  defs,
  heading = true,
}: {
  defs: Definition[];
  heading?: boolean;
}) {
  const guides = [
    ...standardGuides,
    ...defs.map((definition) => ({
      key: definition.id,
      label: definition.name,
      definition,
    })),
  ];
  const [selected, setSelected] = useState(guides[0].key);
  const guide = guides.find((item) => item.key === selected) ?? guides[0];
  const [showGrowth, setShowGrowth] = useState(false);
  const shownDefinition =
    showGrowth && (guide.definition.growth || guide.definition.transformation || guide.definition.summoning)
      ? guide.definition.summoning
        ? summonedDefinition(guide.definition)
        : guide.definition.transformation
        ? transformedDefinition(guide.definition)
        : evolvedDefinition(guide.definition)
      : guide.definition;
  const custom = !guide.key.startsWith("standard:");
  const allyJump = shownDefinition.patterns.some(
    (p) => p.kind === "direction" && (p.jumpAllies || p.canJump),
  );
  const enemyJump = shownDefinition.patterns.some(
    (p) => p.kind === "direction" && (p.jumpEnemies || p.canJump),
  );
  const initialOnly = shownDefinition.patterns.some((p) => p.initialOnly);
  const cannon = shownDefinition.patterns.some(
    (p) => p.kind === "direction" && p.cannon,
  );
  const stationary = shownDefinition.patterns.some(
    (p) => (p.usage ?? "both") === "stationary",
  );
  const multiMove = shownDefinition.patterns.some((p) => p.phase === 2);
  return (
    <div className="movement-viewer">
      {heading && <h3>駒の移動方法</h3>}
      <label>
        駒
        <select
          aria-label="表示する駒"
          value={guide.key}
          onChange={(event) => setSelected(event.target.value)}
        >
          {guides.map((item) => (
            <option value={item.key} key={item.key}>
              {item.definition.symbol} {item.label}
            </option>
          ))}
        </select>
      </label>
      {(guide.definition.growth || guide.definition.transformation || guide.definition.summoning) && (
        <label>
          表示状態
          <select
            aria-label="成長前後の表示"
            value={showGrowth ? "after" : "before"}
            onChange={(event) => setShowGrowth(event.target.value === "after")}
          >
            <option value="before">進化前</option>
            <option value="after">{guide.definition.summoning ? "派生駒" : "進化後"}</option>
          </select>
        </label>
      )}
      <Preview d={shownDefinition} />
      <div className="movement-legend">
        <span className="legend-both">移動・捕獲</span>
        <span className="legend-move">移動専用</span>
        <span className="legend-capture">捕獲専用</span>
        <span className="legend-leap">固定跳躍</span>
        <span className="legend-initial">初回限定</span>
        <span className="legend-cannon">キャノン</span>
      </div>
      <p>{custom ? `コスト ${definitionCost(guide.definition)}/30` : "標準駒"}</p>
      {guide.definition.isCrown && <p>♛ Crown</p>}
      {guide.definition.growth && (
        <p>成長条件：{conditionDescription(guide.definition.growth.condition)}</p>
      )}
      {guide.definition.transformation && (
        <p>
          変身条件：{conditionDescription(guide.definition.transformation.condition)}
          <br />
          変身後：{guide.definition.transformation.symbol}{" "}
          {guide.definition.transformation.name}
        </p>
      )}
      {guide.definition.summoning && (
        <p>
          召喚条件：{conditionDescription(guide.definition.summoning.condition)}
          <br />
          発動方式：{{ summon: "通常召喚", inherit: "継承", split: "分裂" }[guide.definition.summoning.timing]}
          <br />
          配置範囲：{guide.definition.summoning.range === "movement" ? "1回目の移動範囲" : "周囲8マス"}
          <br />
          派生駒：{guide.definition.summoning.symbol} {guide.definition.summoning.name}（上限{summonLimit(guide.definition)}）
        </p>
      )}
      {(allyJump || enemyJump) && (
        <p>
          飛び越し：
          {[allyJump && "味方", enemyJump && "敵"].filter(Boolean).join("・")}
        </p>
      )}
      {initialOnly && <p>初回限定：未移動時だけ使用可能</p>}
      {cannon && <p>キャノン：スクリーン1枚を越えた最初の敵を捕獲</p>}
      {stationary && <p>静止捕獲：対象だけを捕獲し、駒自身は移動しません。</p>}
      {multiMove && <p>複数回移動：1回目の後に任意で2回目を実行できます。</p>}
      {guide.key === "standard:pawn" && (
        <p>初回の2マス移動とアンパッサンは盤上ルールとして適用されます。</p>
      )}
    </div>
  );
}
function Game({
  match,
  setMatch,
  defs,
  mode,
  difficulty,
  blackDifficulty,
  onExit,
}: {
  match: Match;
  setMatch: (m: Match) => void;
  defs: Definition[];
  mode: GameMode;
  difficulty: AIDifficulty;
  blackDifficulty: AIDifficulty;
  onExit: () => void;
}) {
  const [selected, setSelected] = useState<Pos | null>(null);
  const initialMatch = useRef(structuredClone(match));
  const [inspected, setInspected] = useState<Pos | null>(null);
  const [threatView, setThreatView] = useState<"off" | "turn" | "opponent">(
    "off",
  );
  const [pending, setPending] = useState<
    import("./domain/types").Move[] | null
  >(null);
  const [thinking, setThinking] = useState(false);
  const [aiError, setAiError] = useState("");
  const [paused, setPaused] = useState(false), [stepRequested, setStepRequested] = useState(false), [watchSpeed, setWatchSpeed] = useState<0 | 400 | 1000>(400);
  useEffect(() => {
    const aiTurn = (mode === "ai" && match.turn === "black") || mode === "ai-ai";
    if (!aiTurn || (mode === "ai-ai" && paused && !stepRequested)) return;
    if (match.pendingSummon && (mode === "ai-ai" || match.pendingSummon.owner === "black")) {
      setMatch(placeSummon(match, chooseSummonPlacement(match, defs) ?? match.pendingSummon.candidates[0]));
      return;
    }
    if (match.winner || match.draw) return;
    if (match.history.length >= 200) { setMatch({ ...match, draw: true, message: "最大200手に到達したため引き分けです。" }); return; }
    const worker = new Worker(
      new URL("./domain/ai.worker.ts", import.meta.url),
      { type: "module" },
    );
    let active = true;
    setThinking(true);
    setAiError("");
    setSelected(null);
    worker.onmessage = (
      event: MessageEvent<{
        move?: import("./domain/types").Move | null;
        error?: string;
      }>,
    ) => {
      if (!active) return;
      setThinking(false);
      if (event.data.error) {
        setAiError(`AIエラー：${event.data.error}`);
        return;
      }
      const apply = () => {
        setMatch(
          event.data.move
            ? play(match, event.data.move, defs)
          : {
              ...match,
              draw: true,
              message: "AIに合法手がないため引き分けです。",
              },
        );
        setStepRequested(false);
      };
      if (mode === "ai-ai" && watchSpeed) window.setTimeout(apply, watchSpeed); else apply();
    };
    worker.onerror = () => {
      if (!active) return;
      setThinking(false);
      setAiError("AIエラー：思考処理を開始できませんでした。");
    };
    worker.postMessage({ match, defs, difficulty: mode === "ai-ai" && match.turn === "black" ? blackDifficulty : difficulty });
    return () => {
      active = false;
      worker.terminate();
    };
  }, [match, defs, mode, difficulty, blackDifficulty, setMatch, paused, stepRequested, watchSpeed]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pending) return;
      setSelected(null);
      setInspected(null);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [pending]);
  const locked = thinking || mode === "ai-ai" || (mode === "ai" && match.turn === "black" && match.pendingSummon?.owner !== "white");
  const moves = selected ? legal(match, selected, defs) : [];
  const targets = new Set(
    match.pendingSummon
      ? match.pendingSummon.candidates.map((p) => `${p.row},${p.col}`)
      : pending
      ? pending
          .filter((m) => m.next)
          .map((m) => `${m.next!.to.row},${m.next!.to.col}`)
      : moves.map((m) => `${m.to.row},${m.to.col}`),
  );
  const localSwapTargets = new Set(moves.filter((move) => move.swap === "local").map((move) => `${move.to.row},${move.to.col}`));
  const globalSwapTargets = new Set(moves.filter((move) => move.swap === "global").map((move) => `${move.to.row},${move.to.col}`));
  const flightAnchors = new Set(moves.filter((move) => move.transit).map((move) => `${move.to.row},${move.to.col}`));
  const inspectedMarks = new Map(
    (inspected ? inspectRange(match, inspected, defs) : []).map((mark) => [
      `${mark.to.row},${mark.to.col}`,
      mark,
    ]),
  );
  const inspectedPiece = inspected
    ? match.board[inspected.row * 8 + inspected.col]
    : null;
  const threatColor =
    threatView === "turn"
      ? match.turn
      : threatView === "opponent"
        ? other(match.turn)
        : null;
  const threatenedSquares = new Set<string>();
  if (threatColor && !inspected) {
    match.board.forEach((piece, index) => {
      if (piece?.color !== threatColor) return;
      inspectRange(match, { row: Math.floor(index / 8), col: index % 8 }, defs)
        .filter((mark) => mark.capture)
        .forEach((mark) =>
          threatenedSquares.add(`${mark.to.row},${mark.to.col}`),
        );
    });
  }
  const click = (p: Pos) => {
    const piece = match.board[idx(p)];
    if (match.pendingSummon) {
      if (match.pendingSummon.candidates.some((candidate) => candidate.row === p.row && candidate.col === p.col)) setMatch(placeSummon(match, p));
      return;
    }
    if (!pending && inspected?.row === p.row && inspected.col === p.col) {
      setSelected(null);
      setInspected(null);
      return;
    }
    if (locked) {
      setInspected(piece ? p : null);
      return;
    }
    if (pending) {
      const action = pending.find(
        (move) => move.next?.to.row === p.row && move.next.to.col === p.col,
      );
      if (action) {
        setMatch(play(match, action, defs));
        setPending(null);
        setSelected(null);
        setInspected(null);
        return;
      }
      setPending(null);
    }
    if (selected) {
      const candidates = moves.filter(
        (m) => m.to.row === p.row && m.to.col === p.col,
      );
      if (candidates.length) {
        const continuation = candidates.filter((move) => move.next);
        if (continuation.length) {
          setPending(candidates);
          return;
        }
        setMatch(play(match, candidates[0], defs));
        setSelected(null);
        setInspected(null);
        return;
      }
    }
    setSelected(piece?.color === match.turn ? p : null);
    setInspected(piece ? p : null);
  };
  return (
    <section>
      <div className="game-head">
        <div>
          <h2>対局</h2>
          <p>{aiError || (thinking ? "AI思考中…" : match.message)}</p>
          {pending && (
            <p>{pending.some((move) => move.transit) ? "飛翔の着地点を選んでください。中継地点の駒は捕獲しません。" : "2回目の移動先を選ぶか、「ここで手番終了」を選択してください。"}</p>
          )}
          {match.pendingSummon && <p>派生駒の配置先を選んでください（残り{match.pendingSummon.remaining}体）。</p>}
        </div>
        <div className="range-controls">
          {mode === "ai-ai" && <>
            <button onClick={() => setPaused(!paused)}>{paused ? "再開" : "一時停止"}</button>
            <button disabled={!paused || thinking} onClick={() => setStepRequested(true)}>1手進める</button>
            <button onClick={() => { setPaused(true); setStepRequested(false); setMatch(structuredClone(initialMatch.current)); }}>最初から</button>
            <label>速度<select aria-label="観戦速度" value={watchSpeed} onChange={(event) => setWatchSpeed(Number(event.target.value) as 0 | 400 | 1000)}><option value="1000">低速</option><option value="400">標準</option><option value="0">高速</option></select></label>
          </>}
          <label>
            効き表示
            <select
              aria-label="効き表示"
              value={threatView}
              onChange={(event) => {
                setThreatView(event.target.value as typeof threatView);
                setInspected(null);
              }}
            >
              <option value="off">OFF</option>
              <option value="turn">手番側</option>
              <option value="opponent">相手側</option>
            </select>
          </label>
          <button onClick={onExit}>終了</button>
        </div>
      </div>
      <div className="game">
        <div className="board-shell">
          <div className="board">
            {match.board.map((piece, i) => {
              const p = { row: Math.floor(i / 8), col: i % 8 };
              const key = `${p.row},${p.col}`;
              const mark = inspectedMarks.get(key);
              const isInspectedPiece =
                inspected?.row === p.row && inspected.col === p.col;
              const isCapturablePiece = Boolean(
                piece &&
                  inspectedPiece &&
                  piece.color !== inspectedPiece.color &&
                  mark?.capture,
              );
              const pieceFocusClass =
                piece && inspected && !isInspectedPiece
                  ? isCapturablePiece
                    ? "inspection-capturable"
                    : "inspection-switchable"
                  : "";
              const isOutsideInspection = Boolean(
                inspected && !isInspectedPiece && !mark,
              );
              const rangeClass = mark
                ? mark.move && mark.capture
                  ? "range-both"
                  : mark.capture
                    ? mark.stationary
                      ? "range-stationary"
                      : "range-capture"
                    : "range-move"
                : "";
              return (
                <button
                  aria-label={`${p.row},${p.col}`}
                  className={`${(p.row + p.col) % 2 ? "dark" : "light"} ${isInspectedPiece ? "selected" : ""} ${targets.has(key) ? "move" : ""} ${localSwapTargets.has(key) ? "local-swap" : ""} ${globalSwapTargets.has(key) ? "global-swap" : ""} ${flightAnchors.has(key) ? "flight-anchor" : ""} ${rangeClass} ${mark?.second ? "range-second" : ""} ${threatenedSquares.has(key) ? "threat" : ""} ${isOutsideInspection ? "inspection-muted" : ""}`}
                  onClick={() => click(p)}
                  aria-disabled={locked}
                  key={i}
                >
                  {piece && (
                    <span
                      className={`${piece.color} ${pieceFocusClass} ${piece.evolved ? "piece-evolved" : ""}`}
                    >
                      {pieceText(piece, defs)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {inspected && !pending && (
            <button
              className="clear-inspection floating-clear-inspection"
              onClick={() => {
                setSelected(null);
                setInspected(null);
              }}
            >
              選択解除
            </button>
          )}
        </div>
        <aside className="panel">
          <div className="range-legend" aria-label="範囲表示の凡例">
            <span className="legend-range-move">移動</span>
            <span className="legend-range-capture">捕獲</span>
            <span className="legend-range-both">移動・捕獲</span>
            <span className="legend-range-stationary">静止捕獲</span>
            <span className="legend-range-second">2回目を含む</span>
            <span className="legend-local-swap">近接交換</span>
            <span className="legend-global-swap">全域交換</span>
          </div>
          {inspectedPiece?.role === "custom" &&
            (() => {
              const definition = defs.find(
                (item) => item.id === inspectedPiece.definitionId,
              );
              const evolution = definition?.growth ?? definition?.transformation;
              return evolution ? (
                <div className="growth-status">
                  <strong>
                    {inspectedPiece.evolved
                      ? definition?.transformation
                        ? "変身済み"
                        : "成長済み"
                      : definition?.transformation
                        ? "変身進捗"
                        : "成長進捗"}
                  </strong>
                  <p>{conditionDescription(evolution.condition)}</p>
                  <p>
                    進捗：{evolutionProgress(inspectedPiece, match, definition!)}
                  </p>
                </div>
              ) : null;
            })()}
          {pending && (
            <button
              onClick={() => {
                const stop = pending.find((move) => !move.next)!;
                setMatch(play(match, stop, defs));
                setPending(null);
                setSelected(null);
              }}
            >
              ここで手番終了
            </button>
          )}
          <details className="game-panel-section" open>
            <summary>
              <h3>駒の移動方法</h3>
            </summary>
            <MovementViewer defs={defs} heading={false} />
          </details>
          <details className="game-panel-section" open>
            <summary>
              <h3>手の履歴</h3>
            </summary>
            {match.history.length ? (
              <ol>
                {match.history.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ol>
            ) : (
              <p className="empty-history">まだ指し手はありません。</p>
            )}
          </details>
          <div className="match-actions">
            <button
              disabled={!!match.winner || match.draw || thinking}
              onClick={() =>
                setMatch({
                  ...match,
                  winner: match.turn === "white" ? "black" : "white",
                  message: "投了しました。",
                })
              }
            >
              投了
            </button>
            <button
              disabled={!!match.winner || match.draw || thinking}
              onClick={() =>
                setMatch({
                  ...match,
                  draw: true,
                  message: "合意により引き分けです。",
                })
              }
            >
              引き分け
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SimulationView({ defs, setup, preset }: { defs: Definition[]; setup: Setup; preset: Preset }) {
  const [games, setGames] = useState(20), [whiteDifficulty, setWhiteDifficulty] = useState<AIDifficulty>("hard"), [blackDifficulty, setBlackDifficulty] = useState<AIDifficulty>("hard"), [swapSides, setSwapSides] = useState(true), [maxPlies, setMaxPlies] = useState(200), [progress, setProgress] = useState(0), [running, setRunning] = useState(false), [results, setResults] = useState<SimulationResult[]>(() => { try { return loadSimulationResults(); } catch { return []; } }), [active, setActive] = useState<SimulationResult | null>(results[0] ?? null), [error, setError] = useState("");
  const workerRef = useMemo<{ current: Worker | null; partial: SimulationResult | null }>(() => ({ current: null, partial: null }), []);
  const start = () => {
    workerRef.current?.terminate(); workerRef.partial = null; setProgress(0); setRunning(true); setError("");
    const worker = new Worker(new URL("./domain/simulation.worker.ts", import.meta.url), { type: "module" }); workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{ progress?: number; partial?: SimulationResult; result?: SimulationResult; error?: string }>) => {
      if (event.data.progress) setProgress(event.data.progress);
      if (event.data.partial) workerRef.partial = event.data.partial;
      if (event.data.error) { setError(event.data.error); setRunning(false); worker.terminate(); }
      if (event.data.result) { const saved = saveSimulationResult(event.data.result); setResults(saved); setActive(event.data.result); setRunning(false); worker.terminate(); }
    };
    worker.postMessage({ defs, setup, preset, options: { games, whiteDifficulty, blackDifficulty, swapSides, maxPlies, seed: Date.now() & 0x7fffffff } });
  };
  const stop = () => { workerRef.current?.terminate(); workerRef.current = null; if (workerRef.partial) { const saved = saveSimulationResult(workerRef.partial); setResults(saved); setActive(workerRef.partial); } setRunning(false); };
  return <section><h2>AIバランスシミュレーション</h2><div className="panel simulation-controls">
    <label>対局数<select aria-label="対局数" value={games} onChange={(e) => setGames(Number(e.target.value))}><option value="10">10戦</option><option value="20">20戦</option><option value="50">50戦</option></select></label>
    <label>白AI<select aria-label="白AI難易度" value={whiteDifficulty} onChange={(e) => setWhiteDifficulty(e.target.value as AIDifficulty)}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label>
    <label>黒AI<select aria-label="黒AI難易度" value={blackDifficulty} onChange={(e) => setBlackDifficulty(e.target.value as AIDifficulty)}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label>
    <label>最大手数<input aria-label="最大手数" type="number" min="20" max="400" value={maxPlies} onChange={(e) => setMaxPlies(Number(e.target.value))} /></label>
    <label><input type="checkbox" checked={swapSides} onChange={(e) => setSwapSides(e.target.checked)} />後半戦で白黒AI設定を入れ替える</label>
    <button disabled={running} onClick={start}>開始</button><button disabled={!running} onClick={stop}>中断</button>
    {running && <p>進捗：{progress}/{games}</p>}{error && <p className="error">{error}</p>}
  </div>
  {!!results.length && <div className="simulation-history"><h3>直近の結果</h3>{results.map((result) => <span key={result.id}><button onClick={() => setActive(result)}>{new Date(result.createdAt).toLocaleString()}・{result.gamesCompleted}戦</button><button onClick={() => { const next = deleteSimulationResult(result.id); setResults(next); if (active?.id === result.id) setActive(next[0] ?? null); }}>削除</button></span>)}</div>}
  {active && <div className="panel simulation-result"><h3>集計結果</h3><p>白勝 {active.whiteWins}・黒勝 {active.blackWins}・引分 {active.draws}／平均手数 {active.gamesCompleted ? (active.games.reduce((sum, game) => sum + game.plies, 0) / active.gamesCompleted).toFixed(1) : "0"}</p><div className="table-scroll"><table><thead><tr><th>駒</th><th>出場</th><th>生成</th><th>捕獲</th><th>被捕獲</th><th>生存率</th><th>チェック</th><th>メイト</th><th>進化</th><th>召喚</th></tr></thead><tbody>{active.pieces.map((stat) => <tr key={stat.key}><td>{stat.label}</td><td>{stat.appearances}</td><td>{stat.generated}</td><td>{stat.captures}</td><td>{stat.losses}</td><td>{stat.appearances + stat.generated ? `${Math.round(stat.survivors * 100 / (stat.appearances + stat.generated))}%` : "-"}</td><td>{stat.checks}</td><td>{stat.mates}</td><td>{stat.evolutions}</td><td>{stat.summons}</td></tr>)}</tbody></table></div><details><summary>対局一覧</summary><ol>{active.games.map((game, index) => <li key={index}>#{index + 1} {game.winner ? `${game.winner}勝` : "引分"}・{game.plies}手・{game.reason}・seed {game.seed}</li>)}</ol></details></div>}
  </section>;
}
export default function App() {
  const initial = useMemo(() => {
    try {
      return load();
    } catch {
      return null;
    }
  }, []);
  const suspendedInitial = useMemo(() => {
    try {
      return { data: loadMatch(), error: false };
    } catch {
      return { data: null, error: true };
    }
  }, []);
  const [defs, setDefs] = useState<Definition[]>(initial?.definitions ?? []),
    [setup, setSetup] = useState<Setup>(initial?.setup ?? emptySetup()),
    [preset, setPreset] = useState<Preset>(initial?.preset ?? "classic"),
    [mode, setMode] = useState<GameMode>("local"),
    [difficulty, setDifficulty] = useState<AIDifficulty>("normal"),
    [blackDifficulty, setBlackDifficulty] = useState<AIDifficulty>("normal"),
    [page, setPage] = useState<Page>("home"),
    [match, setMatch] = useState<Match | null>(null),
    [matchDefs, setMatchDefs] = useState<Definition[]>([]),
    [suspended, setSuspended] = useState<SuspendedMatchData | null>(
      suspendedInitial.data,
    ),
    [brokenSuspended, setBrokenSuspended] = useState(suspendedInitial.error),
    [notice, setNotice] = useState(
      suspendedInitial.error
        ? "中断データを読み込めません。削除して新しい対局を開始できます。"
        : "",
    ),
    [autoHandle, setAutoHandle] = useState<AutoImportHandle | null>(null),
    [autoPrompted, setAutoPrompted] = useState(false),
    [showAutoPrompt, setShowAutoPrompt] = useState(false);
  const data: SaveData = { version: 1, definitions: defs, setup, preset };
  useEffect(() => {
    if (!match || page !== "game") return;
    const saved: SuspendedMatchData = {
      version: 1,
      match,
      definitions: matchDefs,
      mode,
      difficulty,
      savedAt: new Date().toISOString(),
    };
    saveMatch(saved);
    setSuspended(saved);
  }, [difficulty, match, matchDefs, mode, page]);
  const importFile = async (f: File) => {
    try {
      const d = parse(await f.text());
      setDefs(d.definitions);
      setSetup(d.setup);
      setPreset(d.preset);
      setNotice("読み込みました。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "読み込みに失敗しました。");
    }
  };
  useEffect(() => {
    if (!supportsAutoImport()) return;
    getAutoImportHandle()
      .then((handle) => setAutoHandle(handle ?? null))
      .catch(() =>
        setNotice("自動読込ファイルの登録情報を確認できませんでした。"),
      );
  }, []);
  useEffect(() => {
    if (
      autoHandle &&
      !autoPrompted &&
      (page === "editor" || page === "setup")
    ) {
      setAutoPrompted(true);
      setShowAutoPrompt(true);
    }
  }, [autoHandle, autoPrompted, page]);
  const registerAutoImport = async () => {
    try {
      const handle = await chooseAutoImportFile();
      if (!handle) return;
      setAutoHandle(handle);
      setAutoPrompted(false);
      setNotice(`${handle.name} を自動読込ファイルに指定しました。`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(
        error instanceof Error
          ? error.message
          : "ファイルを指定できませんでした。",
      );
    }
  };
  const importRegisteredFile = async () => {
    if (!autoHandle) return;
    setShowAutoPrompt(false);
    try {
      await importFile(await readAutoImportFile(autoHandle));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "自動読込に失敗しました。",
      );
    }
  };
  const unregisterAutoImport = async () => {
    setShowAutoPrompt(false);
    try {
      await clearAutoImportHandle();
      setAutoHandle(null);
      setNotice("自動読込ファイルの登録を解除しました。");
    } catch {
      setNotice("自動読込ファイルの登録解除に失敗しました。");
    }
  };
  return (
    <main>
      <header>
        <h1>Chess Forge</h1>
        <nav>
          <button onClick={() => setPage("home")}>ホーム</button>
          <button onClick={() => setPage("editor")}>駒を作る</button>
          <button onClick={() => setPage("setup")}>対局設定</button>
          <button onClick={() => setPage("simulation")}>AI統計</button>
        </nav>
      </header>
      {notice && <p className="notice">{notice}</p>}
      {page === "home" && (
        <section className="hero">
          <h2>30ポイントで、あなただけの駒を。</h2>
          <p>能力を組み合わせ、対称な軍でチェスを拡張します。</p>
          <div className="row">
            {suspended && (
              <button
                onClick={() => {
                  setMatch(suspended.match);
                  setMatchDefs(suspended.definitions);
                  setMode(suspended.mode);
                  setDifficulty(suspended.difficulty);
                  setPage("game");
                }}
              >
                対局を再開
              </button>
            )}
            <button onClick={() => setPage("editor")}>駒を作る</button>
            <button onClick={() => setPage("setup")}>新しい対局</button>
            <button onClick={() => setPage("simulation")}>AIバランステスト</button>
            {(suspended || brokenSuspended) && (
              <button
                onClick={() => {
                  clearMatch();
                  setSuspended(null);
                  setBrokenSuspended(false);
                  setNotice("中断データを削除しました。");
                }}
              >
                {brokenSuspended
                  ? "壊れた中断データを削除"
                  : "中断データを削除"}
              </button>
            )}
            <button
              onClick={() => {
                save(data);
                setNotice("ブラウザへ保存しました。");
              }}
            >
              保存
            </button>
            <button onClick={() => download(data)}>JSON出力</button>
            {supportsAutoImport() && (
              <button onClick={registerAutoImport}>
                {autoHandle
                  ? "自動読込ファイルを変更"
                  : "自動読込ファイルを指定"}
              </button>
            )}
            <label className="file">
              JSON読込
              <input
                type="file"
                accept="application/json"
                onChange={(e) =>
                  e.target.files?.[0] && importFile(e.target.files[0])
                }
              />
            </label>
          </div>
        </section>
      )}
      {page === "editor" && (
        <Editor
          all={defs}
          onSave={(d) =>
            setDefs(
              defs.some((x) => x.id === d.id)
                ? defs.map((x) => (x.id === d.id ? d : x))
                : [...defs, d],
            )
          }
          onDelete={(id) => {
            setDefs(defs.filter((d) => d.id !== id));
            setSetup({
              rook: setup.rook === id ? null : setup.rook,
              knight: setup.knight === id ? null : setup.knight,
              bishop: setup.bishop === id ? null : setup.bishop,
              queen: setup.queen === id ? null : setup.queen,
              mode: setup.mode,
              formation: setup.formation?.map((value) =>
                value === id ? null : value,
              ),
            });
          }}
        />
      )}{" "}
      {page === "setup" && (
        <SetupView
          defs={defs}
          setup={setup}
          setSetup={setSetup}
          preset={preset}
          setPreset={setPreset}
          mode={mode}
          setMode={setMode}
          difficulty={difficulty}
          blackDifficulty={blackDifficulty}
          setDifficulty={setDifficulty}
          setBlackDifficulty={setBlackDifficulty}
          start={(editedMatch) => {
            const snapshot = structuredClone(defs);
            const nextMatch = editedMatch ?? createMatch(snapshot, setup, preset);
            setMatchDefs(snapshot);
            setMatch(nextMatch);
            const saved: SuspendedMatchData = {
              version: 1,
              match: nextMatch,
              definitions: snapshot,
              mode,
              difficulty,
              savedAt: new Date().toISOString(),
            };
            saveMatch(saved);
            setSuspended(saved);
            setPage("game");
          }}
        />
      )}
      {page === "game" && match && (
        <Game
          match={match}
          setMatch={setMatch}
          defs={matchDefs}
          mode={mode}
          difficulty={difficulty}
          blackDifficulty={blackDifficulty}
          onExit={() => setPage("setup")}
        />
      )}
      {page === "simulation" && <SimulationView defs={defs} setup={setup} preset={preset} />}
      {showAutoPrompt && autoHandle && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="panel auto-import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auto-import-title"
          >
            <h2 id="auto-import-title">駒セットの自動読込</h2>
            <p>{autoHandle.name} を読み込みますか？</p>
            <div className="row">
              <button autoFocus onClick={importRegisteredFile}>
                はい
              </button>
              <button onClick={() => setShowAutoPrompt(false)}>
                今回は読み込まない
              </button>
              <button onClick={unregisterAutoImport}>登録解除</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
