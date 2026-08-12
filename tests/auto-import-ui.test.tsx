// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handle = { name: "my-pieces.json" };
const autoImport = vi.hoisted(() => ({
  clearAutoImportHandle: vi.fn(),
  chooseAutoImportFile: vi.fn(),
  getAutoImportHandle: vi.fn(),
  readAutoImportFile: vi.fn(),
  supportsAutoImport: vi.fn(),
}));

vi.mock("../src/infrastructure/autoImport", () => autoImport);

import App from "../src/App";

describe("automatic JSON import", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    autoImport.supportsAutoImport.mockReturnValue(true);
    autoImport.getAutoImportHandle.mockResolvedValue(handle);
  });
  afterEach(cleanup);

  it("asks once when entering an import-aware screen", async () => {
    render(<App />);
    await waitFor(() =>
      expect(autoImport.getAutoImportHandle).toHaveBeenCalled(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "駒を作る" })[0]);
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "my-pieces.json を読み込みますか？",
    );

    fireEvent.click(screen.getByRole("button", { name: "今回は読み込まない" }));
    fireEvent.click(screen.getByRole("button", { name: "対局設定" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
