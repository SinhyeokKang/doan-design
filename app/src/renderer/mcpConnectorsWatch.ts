import type { McpSnapshot } from "../main/mcpConnectors/service";
import type { ConnectorAction } from "../main/mcpConnectors/state";
import type { McpProvider } from "../main/mcpConnectors/presets";
import { PROVIDER_NAMES } from "./agentAuthView";
import { mcpChanges, mcpChangeText, OPEN_FAILED_TEXT, runningNoticeText } from "./mcpConnectorsView";

export interface McpConnectorsWatchDeps {
  api: { onMcpConnectors(listener: (snapshot: McpSnapshot) => void): () => void };
  // From the renderer's conversation lists.
  running(provider: McpProvider): boolean;
  pageShown(): boolean;
  toast(text: string, label: string, run: () => void): void;
  openPage(): void;
}

// Attempts outlive the page, so what follows them lives here: the latest snapshot, announcements, a failure toast while
// the page isn't shown, and the notice under an item changed while that agent runs a turn.
export class McpConnectorsWatch {
  snapshot: McpSnapshot | null = null;
  // Gone when that agent's running turn ends.
  notices: Partial<Record<McpProvider, string>> = {};
  announcement: { seq: number; text: string } | null = null;
  private seq = 0;
  private listeners = new Set<() => void>();
  // Kept by a row while it is Removing.
  private settled = new Map<string, ConnectorAction>();
  // Until a later open works or the row leaves Connecting.
  private openFailures = new Set<string>();
  constructor(private readonly deps: McpConnectorsWatchDeps) {}

  start(): () => void { return this.deps.api.onMcpConnectors(snapshot => this.receive(snapshot)); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  // The newest wins whichever way it came (the change event or a list reply).
  receive(next: McpSnapshot): void {
    const prev = this.snapshot;
    if (prev && next.revision <= prev.revision) return;
    this.snapshot = next;
    for (const dto of next.providers) for (const row of dto.rows) {
      if (row.view.action && row.view.status !== "connecting") this.settled.set(`${dto.provider}\0${row.name}`, row.view.action);
      if (row.view.status !== "connecting") this.openFailures.delete(`${dto.provider}\0${row.name}`);
    }
    const texts: string[] = [];
    for (const change of mcpChanges(prev, next)) {
      if (change.kind === "succeeded" && this.deps.running(change.provider)) this.notices = { ...this.notices, [change.provider]: change.name };
      if (change.kind === "failed" && !this.deps.pageShown())
        this.deps.toast(`${PROVIDER_NAMES[change.provider]} couldn’t connect to ${change.label}.`, "Open MCP Connectors", () => this.deps.openPage());
      const text = mcpChangeText(change);
      if (text) texts.push(text);
    }
    if (texts.length) this.announcement = { seq: ++this.seq, text: texts.join(". ") };
    this.changed();
  }

  // A notice goes once its agent's running turn has ended.
  runningChanged(): void {
    const kept = Object.fromEntries(Object.entries(this.notices).filter(([provider]) => this.deps.running(provider as McpProvider)));
    if (Object.keys(kept).length === Object.keys(this.notices).length) return;
    this.notices = kept;
    this.changed();
  }

  noticeText(provider: McpProvider): string { return runningNoticeText(provider); }
  remembered(provider: McpProvider, name: string): ConnectorAction | null { return this.settled.get(`${provider}\0${name}`) ?? null; }
  announcementSeq(): number { return this.seq; }
  openFailed(provider: McpProvider, name: string): boolean { return this.openFailures.has(`${provider}\0${name}`); }
  // The page's one live region reads the sentence: its notices carry no live role.
  openAnswered(provider: McpProvider, name: string, failed: boolean): void {
    const key = `${provider}\0${name}`;
    // Every failure is read, a repeated one too; a working open only clears a shown alert.
    if (!failed && !this.openFailures.has(key)) return;
    if (failed) { this.openFailures.add(key); this.announcement = { seq: ++this.seq, text: OPEN_FAILED_TEXT }; }
    else this.openFailures.delete(key);
    this.changed();
  }

  private changed(): void { for (const listener of this.listeners) listener(); }
}
