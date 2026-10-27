import * as fs from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer, type LocalServer } from "../serve/server";
import type { ResponseRecord } from "./document";
vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>() }));
const roots: string[] = [];
const servers: LocalServer[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(servers.splice(0).map(server => server.close())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
test("records exact bytes by response marker, including empty HTML, but HEAD never completes a document", async () => {
  const root = await mkdtemp(join(tmpdir(), "doan-response-")); roots.push(root);
  await mkdir(join(root, "doan"));
  const records: ResponseRecord[] = [];
  const server = await startServer(record => records.push(record)); servers.push(server);
  const folder = server.addFolder({ root, scope: ["doan"] });
  const url = `http://${server.host}:${server.port}/t/${server.token}/${folder}/doan/a.html`;
  for (const body of ["<main>한글</main>", ""]) {
    await writeFile(join(root, "doan/a.html"), body);
    const response = await fetch(url);
    expect(await response.text()).toBe(body);
    const marker = response.headers.get("x-doan-response");
    await expect.poll(() => [...records].reverse().find(record => record.marker === marker)?.complete).toBe(true);
    expect([...records].reverse().find(record => record.marker === marker)).toMatchObject({ root, path: "doan/a.html", stable: true, hash: "sha256:" + createHash("sha256").update(body).digest("hex") });
  }
  const head = await fetch(url, { method: "HEAD" });
  expect(records.some(record => record.marker === head.headers.get("x-doan-response"))).toBe(false);
});


test("a source mutation during streaming preserves transmitted hash but rejects document stability", async () => {
  const root = await mkdtemp(join(tmpdir(), "doan-stream-")); roots.push(root);
  await mkdir(join(root, "doan"));
  const path = join(root, "doan/a.html");
  await writeFile(path, "<main>" + "a".repeat(128 * 1024) + "</main>");
  const open = fs.open;
  let mutated = false;
  vi.spyOn(fs, "open").mockImplementation(async (...args) => {
    const file = await open(...args);
    const stream = file.createReadStream.bind(file);
    vi.spyOn(file, "createReadStream").mockImplementation(options => {
      const result = stream({ ...options, highWaterMark: 1024 });
      result.on("data", () => { if (!mutated) { mutated = true; appendFileSync(path, "changed"); } });
      return result;
    });
    return file;
  });
  const records: ResponseRecord[] = [];
  const server = await startServer(record => records.push(record)); servers.push(server);
  const folder = server.addFolder({ root, scope: ["doan"] });
  const response = await fetch(`http://${server.host}:${server.port}/t/${server.token}/${folder}/doan/a.html`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await expect.poll(() => records[records.length - 1]?.complete).toBe(true);
  expect(records[records.length - 1]).toMatchObject({ stable: false, hash: "sha256:" + createHash("sha256").update(bytes).digest("hex") });
  expect(mutated).toBe(true);
});
