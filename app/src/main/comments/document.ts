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
  private activeLoaders(): Set<string> { return new Set([...this.frames.values()].map(frame => frame.loaderId)); }
  private trim(map: { size: number; keys(): MapIterator<string> | SetIterator<string>; delete(key: string): boolean }, protectedKeys = new Set<string>()) {
    let unbound = [...map.keys()].filter(key => !protectedKeys.has(key)).length;
    for (const key of map.keys()) {
      if (unbound <= 256) break;
      if (!protectedKeys.has(key)) { map.delete(key); unbound--; }
    }
  }
  private bounded<T>(map: Map<string, T>, key: string, value: T, protectedKeys?: Set<string>) {
    map.set(key, value);
    this.trim(map, protectedKeys);
  }
  private trimResponses(): void {
    const markers = new Set<string>();
    for (const loader of this.activeLoaders()) {
      const binding = this.loaders.get(loader);
      if (binding) markers.add(binding.marker);
    }
    this.trim(this.responses, markers);
  }
  private retire(frameId: string): void {
    const frame = this.frames.get(frameId);
    this.frames.delete(frameId);
    if (!frame) return;
    const binding = this.loaders.get(frame.loaderId);
    this.loaders.delete(frame.loaderId);
    this.finished.delete(frame.loaderId);
    for (const [request, loader] of this.requests) if (loader === frame.loaderId) this.requests.delete(request);
    if (binding && ![...this.loaders.values()].some(loader => loader.marker === binding.marker)) this.responses.delete(binding.marker);
    this.trimResponses();
  }
  response(record: ResponseRecord): void {
    this.responses.set(record.marker, { ...record });
    this.trimResponses();
  }
  network(params: unknown): void {
    if (!object(params) || params.type !== "Document" || typeof params.loaderId !== "string" || typeof params.frameId !== "string" || !object(params.response) || !object(params.response.headers)) return;
    const headers = params.response.headers;
    const header = Object.keys(headers).find(key => key.toLowerCase() === "x-doan-response");
    const marker = header ? headers[header] : undefined;
    if (typeof marker === "string") {
      this.bounded(this.loaders, params.loaderId, { frame: params.frameId, marker }, this.activeLoaders());
      if (typeof params.requestId === "string") this.bounded(this.requests, params.requestId, params.loaderId, new Set([...this.requests].filter(([, loader]) => this.activeLoaders().has(loader)).map(([request]) => request)));
    }
  }
  finish(requestId: string, success: boolean): void {
    const loader = this.requests.get(requestId);
    if (!loader) return;
    if (success) {
      this.finished.add(loader);
      this.trim(this.finished, this.activeLoaders());
    } else {
      this.finished.delete(loader);
      const bound = this.loaders.get(loader);
      if (bound && this.frames.get(bound.frame)?.loaderId === loader) this.start(bound.frame);
    }
  }
  start(frame: string, loader = ""): void { this.retire(frame); this.bounded(this.pending, frame, loader); }
  commit(value: unknown): void {
    if (!object(value) || typeof value.id !== "string" || typeof value.parentId !== "string" || typeof value.loaderId !== "string" || typeof value.url !== "string") return;
    const pending = this.pending.get(value.id);
    if (pending && pending !== value.loaderId) return;
    this.pending.delete(value.id);
    if (this.frames.get(value.id)?.loaderId !== value.loaderId) this.retire(value.id);
    this.frames.set(value.id, { id: value.id, parentId: value.parentId, loaderId: value.loaderId, url: value.url });
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
