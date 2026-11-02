import { describe, expect, test, vi } from "vitest";
import { createCanvasExport, exportName, interpretExport } from "./canvasExport";
import type { CliRun } from "./folderState";
import type { CanvasRow, FolderEntry } from "./view";

const ok = (result: unknown): CliRun => ({ exitCode: 0, timedOut: false, stdout: JSON.stringify({ v: 1, ok: true, result }), stderr: "" });
const fail = (code: string, message: string, exitCode = 2): CliRun => ({ exitCode, timedOut: false, stdout: JSON.stringify({ v: 1, ok: false, error: { code, message, nextSteps: [] } }), stderr: "" });
const OUT = "/Users/me/Desktop/a.html";
const result = (patch: object = {}) => ({ path: ".doan/canvases/a.html", output: OUT, bytes: 10, frames: 1, external: [], links: [], ...patch });

describe("exportName", () => {
  test("suggests the file stem with .html, whatever the case of the extension", () => {
    expect(exportName(".doan/canvases/a.html")).toBe("a.html");
    expect(exportName(".doan/canvases/sub/Pricing Page.HTML")).toBe("Pricing Page.html");
    expect(exportName(".doan/ds/tokens.html")).toBe("tokens.html");
  });
});

describe("interpretExport", () => {
  // POSTMORTEM 2026-11-03: the renderer's toasts rely on these fields, so they are pinned here.
  test("an exported file reports how many internet URLs it still loads", () => {
    expect(interpretExport(ok(result()), OUT)).toEqual({ kind: "exported", external: 0 });
    expect(interpretExport(ok(result({ external: ["https://cdn.example/x.css", "//fonts.example/f.woff2"] })), OUT)).toEqual({ kind: "exported", external: 2 });
    // A result without the list still wrote the file.
    expect(interpretExport(ok({ output: OUT }), OUT)).toEqual({ kind: "exported", external: 0 });
  });

  test("export_refused gives the reference count and the first reference as the CLI wrote it", () => {
    const message = "Can't export .doan/canvases/a.html: 2 references point outside what Doan serves.\n- ../../.env: outside the repository\n- img/a b.png?v=1: not served";
    expect(interpretExport(fail("export_refused", message), OUT)).toEqual({ kind: "failed", reason: "refused", count: 2, first: "../../.env" });
    // A reference that contains ": " keeps it; the detail after the last one is dropped.
    expect(interpretExport(fail("export_refused", "x\n- data/a: b.png: missing"), OUT)).toEqual({ kind: "failed", reason: "refused", count: 1, first: "data/a: b.png" });
  });

  test("export_refused without listed references is an unreadable canvas", () => {
    expect(interpretExport(fail("export_refused", "Can't export .doan/canvases/a.html: it has no valid doan:width."), OUT)).toEqual({ kind: "failed", reason: "unreadable" });
  });

  test("export_too_large names the largest asset when the CLI listed one", () => {
    const message = "The export would be 61 MiB, over the 50 MiB limit. Largest assets:\n- .doan/assets/video.mp4: 48.2 MiB\n- .doan/assets/b.png: 3.1 MiB";
    expect(interpretExport(fail("export_too_large", message), OUT)).toEqual({ kind: "failed", reason: "tooLarge", largest: ".doan/assets/video.mp4" });
    expect(interpretExport(fail("export_too_large", "Too large."), OUT)).toEqual({ kind: "failed", reason: "tooLarge", largest: null });
  });

  test("a usage error is a .doan folder only when the chosen output is inside one", () => {
    expect(interpretExport(fail("usage_error", "-o must not be inside .doan"), "/repo/.doan/out/a.html")).toEqual({ kind: "failed", reason: "insideDoan" });
    expect(interpretExport(fail("usage_error", "-o must not be inside .doan"), "/repo/.doan/a.html")).toEqual({ kind: "failed", reason: "insideDoan" });
    expect(interpretExport(fail("usage_error", "no such directory"), "/Users/me/.doan.html")).toEqual({ kind: "failed", reason: "failed" });
  });

  test("anything else is a plain failure: other codes, no CLI, a crash, a timeout, output that is not an envelope", () => {
    expect(interpretExport(fail("destination_exists", "exists"), OUT)).toEqual({ kind: "failed", reason: "failed" });
    expect(interpretExport(fail("canvas_not_found", "gone"), OUT)).toEqual({ kind: "failed", reason: "failed" });
    expect(interpretExport({ exitCode: null, timedOut: false, spawnError: "spawn doan ENOENT", stdout: "", stderr: "" }, OUT)).toEqual({ kind: "failed", reason: "failed" });
    expect(interpretExport({ exitCode: null, timedOut: true, stdout: "{\"v\":1", stderr: "" }, OUT)).toEqual({ kind: "failed", reason: "failed" });
    expect(interpretExport({ exitCode: 1, timedOut: false, stdout: "panic: boom", stderr: "goroutine" }, OUT)).toEqual({ kind: "failed", reason: "failed" });
    expect(interpretExport({ exitCode: 1, timedOut: false, stdout: JSON.stringify({ v: 1, ok: true, result: result() }), stderr: "" }, OUT)).toEqual({ kind: "failed", reason: "failed" });
    expect(interpretExport({ exitCode: 0, timedOut: false, stdout: JSON.stringify({ v: 2, ok: true, result: result() }), stderr: "" }, OUT)).toEqual({ kind: "failed", reason: "failed" });
  });
});

describe("createCanvasExport", () => {
  const row = (path: string): CanvasRow => ({ path, url: `http://127.0.0.1:1/t/tok/k/${path}` });
  function harness() {
    const entries = vi.fn((): FolderEntry[] => [{ path: "/repo", kind: "list", servedRev: 1, canvases: [row(".doan/canvases/a.html"), row(".doan/canvases/sub/b.html")] }]);
    const choose = vi.fn(async (_name: string): Promise<string | null> => OUT);
    const run = vi.fn(async (_root: string, _path: string, _output: string): Promise<CliRun> => ok(result()));
    const reveal = vi.fn();
    return { entries, choose, run, reveal, exporter: createCanvasExport({ entries, choose, run, reveal }) };
  }

  test("asks for a file named after the stem, runs the CLI with main's own root, row and chosen file", async () => {
    const h = harness();
    const reply = await h.exporter.export({ root: "/repo", path: ".doan/canvases/sub/b.html" });
    expect(reply).toEqual({ kind: "exported", external: 0, reveal: expect.any(String) });
    expect(h.choose).toHaveBeenCalledExactlyOnceWith("b.html");
    expect(h.run).toHaveBeenCalledExactlyOnceWith("/repo", ".doan/canvases/sub/b.html", OUT);
  });

  test("a cancelled save panel runs nothing", async () => {
    const h = harness();
    h.choose.mockResolvedValueOnce(null);
    expect(await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" })).toEqual({ kind: "cancelled" });
    expect(h.run).not.toHaveBeenCalled();
  });

  test("refuses an unregistered root, an unlisted path and a malformed request before any panel", async () => {
    const h = harness();
    for (const value of [{ root: "/other", path: ".doan/canvases/a.html" }, { root: "/repo", path: ".doan/canvases/gone.html" }, { root: "/repo", path: "/etc/passwd" }, null, { path: ".doan/canvases/a.html" }]) {
      expect(await h.exporter.export(value)).toEqual({ kind: "refused", reason: "notListed" });
    }
    expect(h.choose).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
  });

  test.each([
    ["no CLI", { exitCode: null, timedOut: false, spawnError: "ENOENT", stdout: "", stderr: "" }],
    ["output that is not an envelope", { exitCode: 0, timedOut: false, stdout: "hello", stderr: "" }],
    ["an abnormal exit", { exitCode: 139, timedOut: false, stdout: "", stderr: "segfault" }],
    ["a timeout", { exitCode: null, timedOut: true, stdout: "", stderr: "" }],
  ] as const)("%s fails the export and frees the canvas for the next one", async (_name, failed: CliRun) => {
    const h = harness();
    h.run.mockResolvedValueOnce(failed);
    expect(await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" })).toEqual({ kind: "failed", reason: "failed" });
    expect(await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" })).toMatchObject({ kind: "exported" });
  });

  test("a panel or run that throws fails the export and frees the canvas", async () => {
    const h = harness();
    h.choose.mockRejectedValueOnce(new Error("window gone"));
    expect(await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" })).toEqual({ kind: "failed", reason: "failed" });
    h.run.mockRejectedValueOnce(new Error("spawn threw"));
    expect(await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" })).toEqual({ kind: "failed", reason: "failed" });
    expect(await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" })).toMatchObject({ kind: "exported" });
  });

  test("refuses a second export of the same canvas while the first runs, but not of another canvas", async () => {
    const h = harness();
    let finish!: (run: CliRun) => void;
    h.run.mockImplementationOnce(() => new Promise<CliRun>(resolve => { finish = resolve; }));
    const first = h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" });
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" })).toEqual({ kind: "refused", reason: "exporting" });
    expect(await h.exporter.export({ root: "/repo", path: ".doan/canvases/sub/b.html" })).toMatchObject({ kind: "exported" });
    finish(ok(result()));
    expect(await first).toMatchObject({ kind: "exported" });
    expect(await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" })).toMatchObject({ kind: "exported" });
  });

  test("Show in Finder reveals only a file main just wrote, by its id", async () => {
    const h = harness();
    const reply = await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" });
    if (reply.kind !== "exported") throw new Error("not exported");
    // The reply carries no path.
    expect(JSON.stringify(reply)).not.toContain(OUT);
    for (const forged of [OUT, "/etc", { reveal: reply.reveal }, null, "x"]) h.exporter.reveal(forged);
    expect(h.reveal).not.toHaveBeenCalled();
    h.exporter.reveal(reply.reveal);
    expect(h.reveal).toHaveBeenCalledExactlyOnceWith(OUT);
  });

  test("a failed export gives no Show in Finder id", async () => {
    const h = harness();
    h.run.mockResolvedValueOnce(fail("export_refused", "x\n- ../a.png: outside the repository"));
    expect(await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" })).toEqual({ kind: "failed", reason: "refused", count: 1, first: "../a.png" });
  });

  test("keeps Show in Finder ids for the recent exports only", async () => {
    const h = harness();
    const ids: string[] = [];
    for (let i = 0; i < 17; i++) {
      h.choose.mockResolvedValueOnce(`/Users/me/Desktop/a${i}.html`);
      const reply = await h.exporter.export({ root: "/repo", path: ".doan/canvases/a.html" });
      if (reply.kind === "exported") ids.push(reply.reveal);
    }
    h.exporter.reveal(ids[0]);
    expect(h.reveal).not.toHaveBeenCalled();
    h.exporter.reveal(ids[16]);
    expect(h.reveal).toHaveBeenCalledExactlyOnceWith("/Users/me/Desktop/a16.html");
  });
});
