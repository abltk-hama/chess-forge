import { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  cost,
  errors,
  MAX_DEFINITIONS,
  normalize,
  RESERVED_SYMBOLS,
  jumpLimit,
} from "./domain/cost";
import {
  createMatch,
  inspectRange,
  legal,
  pieceText,
  play,
} from "./domain/game";
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
  type AIDifficulty,
  type GameMode,
  type FormationMode,
  type Match,
  type Pos,
  type Preset,
  type Range,
  type SaveData,
  type Setup,
  type Usage,
  type Vec,
} from "./domain/types";
import { download, load, parse, save } from "./infrastructure/storage";
import {
  chooseAutoImportFile,
  clearAutoImportHandle,
  getAutoImportHandle,
  readAutoImportFile,
  supportsAutoImport,
  type AutoImportHandle,
} from "./infrastructure/autoImport";
type Page = "home" | "editor" | "setup" | "game";
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
    n = cost(d),
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
              onChange={(x) => setD({ ...d, isCrown: x.target.checked })}
            />
            王冠 (+25)
          </label>
        </div>
        <div className="panel">
          <h3>
            コスト <strong className={n > 30 ? "danger" : ""}>{n}/30</strong>
          </h3>
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
              {cost(x)}/30 {x.isCrown ? "♛王冠" : ""}{" "}
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
function SetupView({
  defs,
  setup,
  setSetup,
  preset,
  setPreset,
  mode: gameMode,
  setMode: setGameMode,
  difficulty,
  setDifficulty,
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
  setDifficulty: (difficulty: AIDifficulty) => void;
  start: () => void;
}) {
  const [selectedSlot, setSelectedSlot] = useState(0);
  const formation = formationFromSetup(setup);
  const layoutMode = formationMode(setup);
  const crowns = countCrowns(formation, defs);
  const issues = formationErrors(formation, layoutMode, defs);
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
    if (crowns >= 2 && preset === "royal-all") setPreset("royal-any");
  }, [crowns, preset, setPreset]);
  return (
    <section>
      <h2>対局設定</h2>
      <div className="panel setup">
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
        <label>
          ルール
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
          >
            <option value="classic">クラシック拡張</option>
            <option value="royal-any">ロイヤルハント ANY</option>
            <option value="royal-all" disabled={crowns >= 2}>
              ロイヤルハント ALL
            </option>
          </select>
        </label>
        {crowns >= 2 && (
          <p className="notice-inline">
            Crownが2体以上のためRoyal Hunt ALLは選択できません。
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
          </select>
        </label>
        <label>
          AI難易度
          <select
            disabled={gameMode !== "ai"}
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
        <div className="formation-editor">
          <div className="formation-grid" aria-label="白の編成">
            {formation.map((definitionId, index) => {
              const definition = defs.find((item) => item.id === definitionId);
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
                    {definition.symbol} {definition.name} ({cost(definition)})
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
        {issues.map((issue) => (
          <p className="error" key={issue}>
            {issue}
          </p>
        ))}
        <button disabled={!!issues.length} onClick={start}>
          対局開始
        </button>
      </div>
    </section>
  );
}
const orthogonal = directions.filter((v) => v.dx === 0 || v.dy === 0);
const diagonal = directions.filter((v) => v.dx !== 0 && v.dy !== 0);
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
  const custom = !guide.key.startsWith("standard:");
  const allyJump = guide.definition.patterns.some(
    (p) => p.kind === "direction" && (p.jumpAllies || p.canJump),
  );
  const enemyJump = guide.definition.patterns.some(
    (p) => p.kind === "direction" && (p.jumpEnemies || p.canJump),
  );
  const initialOnly = guide.definition.patterns.some((p) => p.initialOnly);
  const cannon = guide.definition.patterns.some(
    (p) => p.kind === "direction" && p.cannon,
  );
  const stationary = guide.definition.patterns.some(
    (p) => (p.usage ?? "both") === "stationary",
  );
  const multiMove = guide.definition.patterns.some((p) => p.phase === 2);
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
      <Preview d={guide.definition} />
      <div className="movement-legend">
        <span className="legend-both">移動・捕獲</span>
        <span className="legend-move">移動専用</span>
        <span className="legend-capture">捕獲専用</span>
        <span className="legend-leap">固定跳躍</span>
        <span className="legend-initial">初回限定</span>
        <span className="legend-cannon">キャノン</span>
      </div>
      <p>{custom ? `コスト ${cost(guide.definition)}/30` : "標準駒"}</p>
      {guide.definition.isCrown && <p>♛ Crown</p>}
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
  onExit,
}: {
  match: Match;
  setMatch: (m: Match) => void;
  defs: Definition[];
  mode: GameMode;
  difficulty: AIDifficulty;
  onExit: () => void;
}) {
  const [selected, setSelected] = useState<Pos | null>(null);
  const [inspected, setInspected] = useState<Pos | null>(null);
  const [threatView, setThreatView] = useState<"off" | "turn" | "opponent">(
    "off",
  );
  const [pending, setPending] = useState<
    import("./domain/types").Move[] | null
  >(null);
  const [thinking, setThinking] = useState(false);
  const [aiError, setAiError] = useState("");
  useEffect(() => {
    if (mode !== "ai" || match.turn !== "black" || match.winner || match.draw)
      return;
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
      setMatch(
        event.data.move
          ? play(match, event.data.move, defs)
          : {
              ...match,
              draw: true,
              message: "AIに合法手がないため引き分けです。",
            },
      );
    };
    worker.onerror = () => {
      if (!active) return;
      setThinking(false);
      setAiError("AIエラー：思考処理を開始できませんでした。");
    };
    worker.postMessage({ match, defs, difficulty });
    return () => {
      active = false;
      worker.terminate();
    };
  }, [match, defs, mode, difficulty, setMatch]);
  const locked = thinking || (mode === "ai" && match.turn === "black");
  const moves = selected ? legal(match, selected, defs) : [];
  const targets = new Set(
    pending
      ? pending
          .filter((m) => m.next)
          .map((m) => `${m.next!.to.row},${m.next!.to.col}`)
      : moves.map((m) => `${m.to.row},${m.to.col}`),
  );
  const inspectedMarks = new Map(
    (inspected ? inspectRange(match, inspected, defs) : []).map((mark) => [
      `${mark.to.row},${mark.to.col}`,
      mark,
    ]),
  );
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
            <p>2回目の移動先を選ぶか、「ここで手番終了」を選択してください。</p>
          )}
        </div>
        <div className="range-controls">
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
        <div className="board">
          {match.board.map((piece, i) => {
            const p = { row: Math.floor(i / 8), col: i % 8 };
            const key = `${p.row},${p.col}`;
            const mark = inspectedMarks.get(key);
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
                className={`${(p.row + p.col) % 2 ? "dark" : "light"} ${inspected?.row === p.row && inspected.col === p.col ? "selected" : ""} ${targets.has(key) ? "move" : ""} ${rangeClass} ${mark?.second ? "range-second" : ""} ${threatenedSquares.has(key) ? "threat" : ""}`}
                onClick={() => click(p)}
                aria-disabled={locked}
                key={i}
              >
                {piece && (
                  <span className={piece.color}>{pieceText(piece, defs)}</span>
                )}
              </button>
            );
          })}
        </div>
        <aside className="panel">
          <div className="range-legend" aria-label="範囲表示の凡例">
            <span className="legend-range-move">移動</span>
            <span className="legend-range-capture">捕獲</span>
            <span className="legend-range-both">移動・捕獲</span>
            <span className="legend-range-stationary">静止捕獲</span>
            <span className="legend-range-second">2回目を含む</span>
          </div>
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
export default function App() {
  const initial = useMemo(() => {
    try {
      return load();
    } catch {
      return null;
    }
  }, []);
  const [defs, setDefs] = useState<Definition[]>(initial?.definitions ?? []),
    [setup, setSetup] = useState<Setup>(initial?.setup ?? emptySetup()),
    [preset, setPreset] = useState<Preset>(initial?.preset ?? "classic"),
    [mode, setMode] = useState<GameMode>("local"),
    [difficulty, setDifficulty] = useState<AIDifficulty>("normal"),
    [page, setPage] = useState<Page>("home"),
    [match, setMatch] = useState<Match | null>(null),
    [notice, setNotice] = useState(""),
    [autoHandle, setAutoHandle] = useState<AutoImportHandle | null>(null),
    [autoPrompted, setAutoPrompted] = useState(false),
    [showAutoPrompt, setShowAutoPrompt] = useState(false);
  const data: SaveData = { version: 1, definitions: defs, setup, preset };
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
        </nav>
      </header>
      {notice && <p className="notice">{notice}</p>}
      {page === "home" && (
        <section className="hero">
          <h2>30ポイントで、あなただけの駒を。</h2>
          <p>能力を組み合わせ、対称な軍でチェスを拡張します。</p>
          <div className="row">
            <button onClick={() => setPage("editor")}>駒を作る</button>
            <button onClick={() => setPage("setup")}>対局する</button>
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
          setDifficulty={setDifficulty}
          start={() => {
            setMatch(createMatch(defs, setup, preset));
            setPage("game");
          }}
        />
      )}
      {page === "game" && match && (
        <Game
          match={match}
          setMatch={setMatch}
          defs={defs}
          mode={mode}
          difficulty={difficulty}
          onExit={() => setPage("setup")}
        />
      )}
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
