import { createHash } from "node:crypto";
import { join } from "node:path";
import { openNoFollow } from "../serve/server";
import { object } from "./identity";

export interface ResponseRecord { marker: string; root: string; path: string; hash: string | null; complete: boolean; stable: boolean }
interface Frame { id: string; parentId: string; loaderId: string; url: string }
export interface LoadedDocument extends ResponseRecord { generation: string; frame: string }

// Frame and loader IDs span the parent Network and OOPIF Page sessions (P-H).
export class DocumentBindings {
  private responses = new Map<string, ResponseRecord>();
  private loaders = new Map<string, { frame: string; marker: string }>();
  private requests = new Map<string, string>();
  private finished = new Set<string>();
  private frames = new Map<string, Frame>();
  private pending = new Map<string, string>();
  private bounded<T>(map: Map<string, T>, key: string, value: T) {
    map.set(key, value);
    if (map.size > 256) { const first = map.keys().next().value; if (first) map.delete(first); }
  }
  response(record: ResponseRecord): void { this.bounded(this.responses, record.marker, { ...record }); }
  network(params: unknown): void {
    if (!object(params) || params.type !== "Document" || typeof params.loaderId !== "string" || typeof params.frameId !== "string" || !object(params.response) || !object(params.response.headers)) return;
    const headers = params.response.headers;
    const header = Object.keys(headers).find(key => key.toLowerCase() === "x-doan-response");
    const marker = header ? headers[header] : undefined;
    if (typeof marker === "string") {
      this.bounded(this.loaders, params.loaderId, { frame: params.frameId, marker });
      if (typeof params.requestId === "string") this.bounded(this.requests, params.requestId, params.loaderId);
    }
  }
  finish(requestId: string, success: boolean): void {
    const loader = this.requests.get(requestId);
    if (!loader) return;
    if (success) {
      this.finished.add(loader);
      if (this.finished.size > 256) { const first = this.finished.values().next().value; if (first) this.finished.delete(first); }
    } else {
      this.finished.delete(loader);
      const bound = this.loaders.get(loader);
      if (bound && this.frames.get(bound.frame)?.loaderId === loader) this.start(bound.frame);
    }
  }
  start(frame: string, loader = ""): void { this.frames.delete(frame); this.bounded(this.pending, frame, loader); }
  commit(value: unknown): void {
    if (!object(value) || typeof value.id !== "string" || typeof value.parentId !== "string" || typeof value.loaderId !== "string" || typeof value.url !== "string") return;
    const pending = this.pending.get(value.id);
    if (pending && pending !== value.loaderId) return;
    this.pending.delete(value.id);
    this.bounded(this.frames, value.id, { id: value.id, parentId: value.parentId, loaderId: value.loaderId, url: value.url });
  }
  current(frameId: string, url: string): LoadedDocument | null {
    const frame = this.frames.get(frameId);
    if (!frame || frame.url !== url) return null;
    const loader = this.loaders.get(frame.loaderId);
    if (!loader || !this.finished.has(frame.loaderId) || loader.frame !== frameId) return null;
    const response = this.responses.get(loader.marker);
    if (!response?.complete || !response.stable || !response.hash) return null;
    return { ...response, generation: frame.loaderId, frame: frameId };
  }
  clear(): void { this.responses.clear(); this.loaders.clear(); this.requests.clear(); this.finished.clear(); this.frames.clear(); this.pending.clear(); }
}

export async function stableDiskHash(root: string, path: string): Promise<string> {
  // The path comes from Go's exact canvas listing, never a free-form renderer path.
  const file = await openNoFollow(join(root, path));
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile()) throw new Error("Canvas is not a regular file.");
    const bytes = await file.readFile();
    const after = await file.stat({ bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || BigInt(bytes.length) !== after.size) throw new Error("Canvas changed while reading.");
    return "sha256:" + createHash("sha256").update(bytes).digest("hex");
  } finally { await file.close(); }
}
