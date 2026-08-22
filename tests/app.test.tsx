// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../src/App";

describe("App", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("moves from home to the piece editor", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    expect(
      screen.getByRole("heading", { name: "駒エディター" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /コスト 0\/30/ }),
    ).toBeInTheDocument();
  });

  it("edits a saved piece without creating another definition", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    fireEvent.change(screen.getByLabelText("名前"), {
      target: { value: "アーク" },
    });
    fireEvent.change(screen.getByLabelText("記号"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "前" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    expect(screen.getByLabelText("名前")).toHaveValue("アーク");
    fireEvent.change(screen.getByLabelText("名前"), {
      target: { value: "アーク改" },
    });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(screen.getByText(/アーク改/)).toBeInTheDocument();
    expect(screen.getByText("1/16種類")).toBeInTheDocument();
  });

  it("supports four movement sets and arbitrary leap targets", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    const add = screen.getByRole("button", { name: "移動セットを追加" });
    fireEvent.click(add);
    fireEvent.change(screen.getByLabelText("移動セット2の種類"), {
      target: { value: "leap" },
    });
    fireEvent.click(screen.getByRole("button", { name: "跳躍 3,-2" }));
    expect(screen.getByText(/3\/30/)).toBeInTheDocument();
    fireEvent.click(add);
    fireEvent.click(add);
    expect(add).toBeDisabled();
    expect(screen.getByText("移動セット 4")).toBeInTheDocument();
  });

  it("configures chain movement with orthogonal directions and chain count", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    fireEvent.change(screen.getByLabelText("移動セット1の種類"), { target: { value: "chain" } });
    expect(screen.getByLabelText("移動セット1の移動回数")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "前" }));
    fireEvent.click(screen.getByRole("button", { name: "右" }));
    fireEvent.change(screen.getByText("最大連鎖数").querySelector("select")!, { target: { value: "3" } });
    expect(screen.getByRole("heading", { name: /コスト 12\/30/ })).toBeInTheDocument();
    const usage = screen.getByLabelText("移動セット1の用途");
    expect(usage.querySelector('option[value="capture"]')).toBeNull();
    expect(usage.querySelector('option[value="stationary"]')).toBeNull();
  });

  it("configures advance with shared runup, jump and width settings", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    fireEvent.change(screen.getByLabelText("移動セット1の種類"), { target: { value: "advance" } });
    fireEvent.click(screen.getByRole("button", { name: "前" }));
    fireEvent.change(screen.getByLabelText("移動セット1の助走距離"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("移動セット1の跳躍距離"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("移動セット1の着地点幅"), { target: { value: "3" } });
    expect(screen.getByLabelText("移動セット1の移動回数")).toBeDisabled();
    expect(screen.getByText(/跳躍距離の推奨は1～7/)).toBeVisible();
    expect(screen.getByRole("heading", { name: /コスト 10\/30/ })).toBeInTheDocument();
  });

  it("allows growth to unlock capture for move-only chain movement", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    fireEvent.change(screen.getByLabelText("移動セット1の種類"), { target: { value: "chain" } });
    fireEvent.click(screen.getByRole("button", { name: "前" }));
    fireEvent.change(screen.getByLabelText("移動セット1の用途"), { target: { value: "move" } });
    fireEvent.change(screen.getByLabelText("進化方式"), { target: { value: "growth" } });
    expect(screen.getByLabelText("通常捕獲")).toBeEnabled();
    fireEvent.click(screen.getByLabelText("通常捕獲"));
    expect(screen.getByLabelText("通常捕獲")).toBeChecked();
  });

  it("configures growth conditions and unlocked abilities", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    fireEvent.change(screen.getByLabelText("名前"), {
      target: { value: "成長兵" },
    });
    fireEvent.change(screen.getByLabelText("記号"), {
      target: { value: "GG" },
    });
    fireEvent.click(screen.getByRole("button", { name: "前" }));
    fireEvent.change(screen.getByLabelText("移動セット1の用途"), {
      target: { value: "move" },
    });
    fireEvent.change(screen.getByLabelText("進化方式"), {
      target: { value: "growth" },
    });
    fireEvent.change(screen.getByLabelText("成長条件カテゴリー"), {
      target: { value: "nearbyEnemies" },
    });
    fireEvent.change(screen.getByLabelText("範囲"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByLabelText("通常捕獲"));

    expect(screen.getByText(/段階1：ギャップ \d+ − 軽減 \d+/)).toBeVisible();
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText(/成長あり/)).toBeVisible();
  });

  it("configures a transformed form", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    fireEvent.change(screen.getByLabelText("名前"), {
      target: { value: "変身兵" },
    });
    fireEvent.change(screen.getByLabelText("記号"), {
      target: { value: "TF" },
    });
    fireEvent.click(screen.getByRole("button", { name: "前" }));
    fireEvent.change(screen.getByLabelText("進化方式"), {
      target: { value: "transformation" },
    });
    fireEvent.change(screen.getByLabelText("変身後名称"), {
      target: { value: "変身後" },
    });
    fireEvent.change(screen.getByLabelText("変身後記号"), {
      target: { value: "TA" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "前" }).at(-1)!);

    expect(screen.getByText(/変身前 \d+／30・変身後/)).toBeVisible();
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText(/変身あり/)).toBeVisible();
  });

  it("configures summoned whole-piece abilities with timing-specific pricing", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    fireEvent.change(screen.getByLabelText("進化方式"), { target: { value: "summoning" } });
    fireEvent.click(screen.getByLabelText("派生駒の結界"));
    expect(screen.getByText("能力料金：+4（召喚元の30点へ加算）")).toBeVisible();
    expect(screen.getByRole("heading", { name: /コスト 9\/30/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("召喚方式"), { target: { value: "split" } });
    expect(screen.getByText("能力料金：+2（召喚元の30点へ加算）")).toBeVisible();
    fireEvent.change(screen.getByLabelText("召喚方式"), { target: { value: "inherit" } });
    expect(screen.getByText(/召喚元から自動継承/)).toBeVisible();
    expect(screen.queryByLabelText("派生駒の結界")).toBeNull();
  });

  it("configures a facility and disables its movement editor", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    fireEvent.change(screen.getByLabelText("施設能力"), { target: { value: "watchtower" } });
    fireEvent.change(screen.getByLabelText("見張り台の監視方向"), { target: { value: "diagonal" } });
    expect(screen.getByRole("heading", { name: /コスト 10\/30/ })).toBeInTheDocument();
    expect(screen.getByLabelText("移動セット1の種類")).toBeDisabled();
    expect(screen.getByText(/施設は移動セットを使用できません/)).toBeVisible();
  });

  it("configures initial-only and cannon movement", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    fireEvent.change(screen.getByLabelText("距離"), {
      target: { value: "slide" },
    });
    fireEvent.click(screen.getByRole("button", { name: "前" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /初回限定/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /キャノン捕獲/ }));
    expect(screen.getByText(/18\/30/)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "味方飛び越し上限" }),
    ).toHaveValue("0");
    expect(
      screen.getByRole("combobox", { name: "敵飛び越し上限" }),
    ).toHaveValue("0");
  });

  it("shows reserved and available two-letter symbols", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    const symbol = screen.getByLabelText("記号");
    fireEvent.change(symbol, { target: { value: "kn" } });
    expect(symbol).toHaveValue("KN");
    expect(screen.getByText("標準駒の予約記号です。")).toBeInTheDocument();
    fireEvent.change(symbol, { target: { value: "dr" } });
    expect(symbol).toHaveValue("DR");
    expect(screen.getByText("使用可能です。")).toBeInTheDocument();
    expect(screen.getByText(/KI QU RO BI KN PO/)).toBeInTheDocument();
  });

  it("shows the movement viewer during a match", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "対局設定" }));
    fireEvent.click(screen.getByRole("button", { name: "対局開始" }));
    expect(
      screen.getByRole("heading", { name: "駒の移動方法" }),
    ).toBeInTheDocument();
    const selector = screen.getByRole("combobox", { name: "表示する駒" });
    expect(selector).toHaveValue("standard:king");
    fireEvent.change(selector, { target: { value: "standard:pawn" } });
    expect(screen.getByText(/初回の2マス移動/)).toBeInTheDocument();
  });

  it("saves and resumes the current match", () => {
    const first = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "対局設定" }));
    fireEvent.click(screen.getByRole("button", { name: "対局開始" }));
    fireEvent.click(screen.getByRole("button", { name: "6,4" }));
    fireEvent.click(screen.getByRole("button", { name: "4,4" }));
    first.unmount();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "対局を再開" }));
    expect(screen.getByText("黒の手番です。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4,4" })).toHaveTextContent("PO");
  });

  it("deletes a suspended match from home", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "対局設定" }));
    fireEvent.click(screen.getByRole("button", { name: "対局開始" }));
    fireEvent.click(screen.getByRole("button", { name: "ホーム" }));
    fireEvent.click(screen.getByRole("button", { name: "中断データを削除" }));
    expect(
      screen.queryByRole("button", { name: "対局を再開" }),
    ).not.toBeInTheDocument();
  });

  it("offers deletion when suspended data is broken", () => {
    localStorage.setItem("custom-piece-chess:match:v1", "{}");
    render(<App />);
    expect(screen.getByText(/中断データを読み込めません/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "壊れた中断データを削除" }),
    );
    expect(localStorage.getItem("custom-piece-chess:match:v1")).toBeNull();
  });

  it("inspects enemy range and toggles side-wide threats", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "対局設定" }));
    fireEvent.click(screen.getByRole("button", { name: "対局開始" }));

    fireEvent.click(screen.getByRole("button", { name: "0,1" }));
    expect(screen.getByRole("button", { name: "2,0" })).toHaveClass(
      "range-both",
    );

    fireEvent.change(screen.getByLabelText("効き表示"), {
      target: { value: "opponent" },
    });
    expect(screen.getByRole("button", { name: "2,0" })).toHaveClass("threat");
    expect(screen.getByRole("button", { name: "0,1" })).not.toHaveClass(
      "selected",
    );

    fireEvent.click(screen.getByRole("button", { name: "0,1" }));
    const clearInspection = screen.getByRole("button", { name: "選択解除" });
    expect(clearInspection).toBeVisible();
    expect(clearInspection).toHaveClass("floating-clear-inspection");
    expect(screen.getByRole("button", { name: "2,0" })).toHaveClass(
      "range-both",
    );
    expect(screen.getByRole("button", { name: "4,4" })).toHaveClass(
      "inspection-muted",
    );
    expect(
      screen.getByRole("button", { name: "0,0" }).querySelector("span"),
    ).toHaveClass("inspection-switchable");
    fireEvent.click(clearInspection);
    expect(screen.getByRole("button", { name: "2,0" })).toHaveClass("threat");
  });

  it("outlines a capturable enemy piece in red", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "対局設定" }));
    fireEvent.click(screen.getByRole("button", { name: "対局開始" }));

    fireEvent.click(screen.getByRole("button", { name: "6,4" }));
    fireEvent.click(screen.getByRole("button", { name: "4,4" }));
    fireEvent.click(screen.getByRole("button", { name: "1,3" }));
    fireEvent.click(screen.getByRole("button", { name: "3,3" }));
    fireEvent.click(screen.getByRole("button", { name: "4,4" }));

    expect(
      screen.getByRole("button", { name: "3,3" }).querySelector("span"),
    ).toHaveClass("inspection-capturable");
  });

  it("clears inspection by tapping the piece again or pressing Escape", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "対局設定" }));
    fireEvent.click(screen.getByRole("button", { name: "対局開始" }));
    const knight = screen.getByRole("button", { name: "0,1" });

    fireEvent.click(knight);
    expect(knight).toHaveClass("selected");
    fireEvent.click(knight);
    expect(knight).not.toHaveClass("selected");

    fireEvent.click(knight);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(knight).not.toHaveClass("selected");
  });

  it("switches between balanced and free formation modes", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "対局設定" }));

    expect(screen.getByLabelText("配置モード")).toHaveValue("balanced");
    expect(screen.getByRole("button", { name: "編成 e1" })).toBeDisabled();
    expect(
      screen.getAllByRole("button", { name: /編成 [a-h][12]/ }),
    ).toHaveLength(16);

    fireEvent.change(screen.getByLabelText("配置モード"), {
      target: { value: "free" },
    });
    expect(
      screen.getByText("King以外・コスト30まで配置可能"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "対局開始" })).toBeEnabled();
  });

  it("starts a match from an edited empty board", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "対局設定" }));
    fireEvent.change(screen.getByLabelText("配置方法"), {
      target: { value: "editor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "空盤面" }));
    expect(screen.getByText("白Kingを1体配置してください。")).toBeVisible();

    fireEvent.change(screen.getByLabelText("局面に配置する駒"), {
      target: { value: "standard:king" },
    });
    fireEvent.click(screen.getByRole("button", { name: "局面 7,4" }));
    fireEvent.change(screen.getByLabelText("配置する駒の陣営"), {
      target: { value: "black" },
    });
    fireEvent.click(screen.getByRole("button", { name: "局面 0,4" }));
    fireEvent.change(screen.getByLabelText("編集局面の手番"), {
      target: { value: "black" },
    });
    fireEvent.click(screen.getByRole("button", { name: "対局開始" }));

    expect(screen.getByText("黒の手番です。")).toBeVisible();
    expect(screen.getByRole("button", { name: "7,4" })).toHaveTextContent("KI");
    expect(screen.getByRole("button", { name: "0,4" })).toHaveTextContent("ki");
  });
});
