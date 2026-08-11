import type {
  Color,
  Definition,
  Match,
  Move,
  Piece,
  Pos,
  Preset,
  Role,
  Setup,
  Usage,
  Vec,
} from "./types";
import { idx, inside, other } from "./types";
const back: Role[] = [
  "rook",
  "knight",
  "bishop",
  "queen",
  "king",
  "bishop",
  "knight",
  "rook",
];
const label: Record<Exclude<Role, "custom">, string> = {
  king: "K",
  queen: "Q",
  rook: "R",
  bishop: "B",
  knight: "N",
  pawn: "P",
};
const at = (s: Match, p: Pos) => (inside(p) ? s.board[idx(p)] : null);
const eq = (a: Pos, b: Pos) => a.row === b.row && a.col === b.col;
export function createMatch(
  defs: Definition[],
  setup: Setup,
  preset: Preset,
): Match {
  const board: (Piece | null)[] = Array(64).fill(null);
  let id = 0;
  for (const color of ["black", "white"] as Color[]) {
    const r = color === "black" ? 0 : 7,
      pr = color === "black" ? 1 : 6;
    back.forEach((role, col) => {
      const slot = (
          ["rook", "knight", "bishop", "queen"].includes(role) ? role : null
        ) as keyof Setup | null,
        custom = slot ? setup[slot] : null;
      board[idx({ row: r, col })] = {
        id: `p${id++}`,
        color,
        role: custom ? "custom" : role,
        definitionId: custom || undefined,
        moved: false,
      };
      board[idx({ row: pr, col })] = {
        id: `p${id++}`,
        color,
        role: "pawn",
        moved: false,
      };
    });
  }
  const crowns = Object.values(setup).filter(
    (x) => defs.find((d) => d.id === x)?.isCrown,
  ).length;
  return {
    board,
    turn: "white",
    preset,
    enPassant: null,
    lost: { white: 0, black: 0 },
    targets: { white: 1 + crowns, black: 1 + crowns },
    history: [],
    winner: null,
    draw: false,
    message: "白の手番です。",
  };
}
function rays(
  s: Match,
  from: Pos,
  color: Color,
  vectors: Vec[],
  max: number,
  jumpAllies = false,
  jumpEnemies = false,
  usage: Usage = "both",
) {
  const out: Move[] = [];
  for (const v of vectors)
    for (let n = 1; n <= max; n++) {
      const to = { row: from.row + v.dy * n, col: from.col + v.dx * n };
      if (!inside(to)) break;
      const t = at(s, to);
      if (!t) {
        if (usage !== "capture") out.push({ from, to });
      } else {
        if (t.color !== color && usage !== "move") out.push({ from, to });
        if (t.color === color ? !jumpAllies : !jumpEnemies) break;
      }
    }
  return out;
}
const orth = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ],
  diag = [
    { dx: 1, dy: -1 },
    { dx: 1, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
  ];
function standard(s: Match, from: Pos, p: Piece): Move[] {
  if (p.role === "rook") return rays(s, from, p.color, orth, 7);
  if (p.role === "bishop") return rays(s, from, p.color, diag, 7);
  if (p.role === "queen") return rays(s, from, p.color, [...orth, ...diag], 7);
  if (p.role === "knight")
    return rays(
      s,
      from,
      p.color,
      [
        { dx: 1, dy: 2 },
        { dx: 2, dy: 1 },
        { dx: 2, dy: -1 },
        { dx: 1, dy: -2 },
        { dx: -1, dy: -2 },
        { dx: -2, dy: -1 },
        { dx: -2, dy: 1 },
        { dx: -1, dy: 2 },
      ],
      1,
      true,
      true,
    );
  if (p.role === "king") {
    const m = rays(s, from, p.color, [...orth, ...diag], 1);
    if (!p.moved)
      for (const [c, side] of [
        [7, "king"],
        [0, "queen"],
      ] as const) {
        const r = at(s, { row: from.row, col: c }),
          between = side === "king" ? [5, 6] : [1, 2, 3];
        if (
          r?.role === "rook" &&
          !r.moved &&
          between.every((x) => !at(s, { row: from.row, col: x }))
        )
          m.push({
            from,
            to: { row: from.row, col: side === "king" ? 6 : 2 },
            castle: side,
          });
      }
    return m;
  }
  if (p.role === "pawn") {
    const d = p.color === "white" ? -1 : 1,
      m: Move[] = [];
    const one = { row: from.row + d, col: from.col };
    if (inside(one) && !at(s, one)) {
      m.push({ from, to: one, promotion: one.row === 0 || one.row === 7 });
      const two = { row: from.row + d * 2, col: from.col };
      if (!p.moved && !at(s, two)) m.push({ from, to: two });
    }
    for (const dx of [-1, 1]) {
      const to = { row: from.row + d, col: from.col + dx },
        t = at(s, to);
      if (t?.color === other(p.color))
        m.push({ from, to, promotion: to.row === 0 || to.row === 7 });
      else if (s.enPassant && eq(s.enPassant, to))
        m.push({ from, to, enPassant: true });
    }
    return m;
  }
  return [];
}
export function pseudo(s: Match, from: Pos, defs: Definition[]) {
  const p = at(s, from);
  if (!p) return [];
  if (p.role !== "custom") return standard(s, from, p);
  const d = defs.find((x) => x.id === p.definitionId);
  if (!d) return [];
  const out: Move[] = [];
  for (const pattern of d.patterns) {
    const sign = p.color === "white" ? 1 : -1,
      v = pattern.vectors.map((x) => ({ dx: x.dx, dy: x.dy * sign }));
    out.push(
      ...rays(
        s,
        from,
        p.color,
        v,
        pattern.kind === "leap"
          ? 1
          : pattern.range === "slide"
            ? 7
            : pattern.range,
        pattern.kind === "leap" || pattern.jumpAllies || pattern.canJump,
        pattern.kind === "leap" || pattern.jumpEnemies || pattern.canJump,
        pattern.usage ?? "both",
      ),
    );
  }
  return [...new Map(out.map((x) => [`${x.to.row},${x.to.col}`, x])).values()];
}
const king = (s: Match, c: Color) => {
  const i = s.board.findIndex((p) => p?.color === c && p.role === "king");
  return i < 0 ? null : { row: Math.floor(i / 8), col: i % 8 };
};
export const threatened = (s: Match, p: Pos, by: Color, d: Definition[]) =>
  s.board.some(
    (x, i) =>
      x?.color === by &&
      pseudo(s, { row: Math.floor(i / 8), col: i % 8 }, d).some((m) =>
        eq(m.to, p),
      ),
  );
function raw(s: Match, m: Move) {
  const b = [...s.board],
    p = b[idx(m.from)]!;
  if (m.enPassant) b[idx({ row: m.from.row, col: m.to.col })] = null;
  b[idx(m.from)] = null;
  b[idx(m.to)] = { ...p, role: m.promotion ? "queen" : p.role, moved: true };
  if (m.castle) {
    const f = { row: m.from.row, col: m.castle === "king" ? 7 : 0 },
      t = { row: m.from.row, col: m.castle === "king" ? 5 : 3 },
      r = b[idx(f)]!;
    b[idx(f)] = null;
    b[idx(t)] = { ...r, moved: true };
  }
  return { ...s, board: b };
}
export function legal(s: Match, from: Pos, d: Definition[]) {
  const p = at(s, from);
  if (!p || p.color !== s.turn || s.winner || s.draw) return [];
  const m = pseudo(s, from, d);
  if (s.preset !== "classic") return m;
  return m.filter((x) => {
    if (x.castle) {
      const step = x.castle === "king" ? 1 : -1;
      if (
        [0, 1, 2].some((n) =>
          threatened(
            s,
            { row: from.row, col: from.col + step * n },
            other(p.color),
            d,
          ),
        )
      )
        return false;
    }
    const n = raw(s, x),
      k = king(n, p.color);
    return !!k && !threatened(n, k, other(p.color), d);
  });
}
export function play(s: Match, m: Move, d: Definition[]) {
  const p = at(s, m.from)!,
    cap = at(s, m.to),
    enemy = other(p.color),
    cd =
      cap?.role === "custom"
        ? d.find((x) => x.id === cap.definitionId)
        : undefined,
    royal = cap?.role === "king" || cd?.isCrown;
  let n = raw(s, m);
  if (royal) n.lost = { ...n.lost, [enemy]: n.lost[enemy] + 1 };
  const win =
    s.preset === "royal-all"
      ? n.lost[enemy] >= n.targets[enemy]
      : s.preset === "royal-any" && !!royal;
  const f = (c: number) => String.fromCharCode(97 + c);
  n = {
    ...n,
    turn: enemy,
    enPassant:
      p.role === "pawn" && Math.abs(m.to.row - m.from.row) === 2
        ? { row: (m.to.row + m.from.row) / 2, col: m.from.col }
        : null,
    history: [
      ...n.history,
      `${f(m.from.col)}${8 - m.from.row}-${f(m.to.col)}${8 - m.to.row}`,
    ],
    winner: win ? p.color : null,
    message: win
      ? `${p.color === "white" ? "白" : "黒"}の勝利です。`
      : `${enemy === "white" ? "白" : "黒"}の手番です。`,
  };
  if (s.preset === "classic" && cd?.isCrown)
    return { ...n, winner: p.color, message: "王冠駒が取られました。" };
  if (s.preset === "classic" && !n.winner) {
    const moves = n.board.flatMap((x, i) =>
      x?.color === enemy
        ? legal(n, { row: Math.floor(i / 8), col: i % 8 }, d)
        : [],
    );
    if (!moves.length) {
      const k = king(n, enemy),
        check = k && threatened(n, k, p.color, d);
      n = check
        ? { ...n, winner: p.color, message: "チェックメイトです。" }
        : { ...n, draw: true, message: "ステイルメイトです。" };
    }
  }
  return n;
}
export function pieceText(p: Piece, d: Definition[]) {
  const t =
    p.role === "custom"
      ? d.find((x) => x.id === p.definitionId)?.symbol || "?"
      : label[p.role];
  return p.color === "white" ? t : t.toLowerCase();
}
