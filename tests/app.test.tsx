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
    expect(screen.getByText(/コスト/)).toBeInTheDocument();
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
    expect(screen.getByText("1/4種類")).toBeInTheDocument();
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
});
