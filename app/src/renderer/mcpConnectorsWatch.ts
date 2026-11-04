import type { McpSnapshot } from "../main/mcpConnectors/service";
import type { ConnectorAction } from "../main/mcpConnectors/state";
import type { McpProvider } from "../main/mcpConnectors/presets";
import { PROVIDER_NAMES } from "./agentAuthView";
import { mcpChanges, mcpChangeText, runningNoticeText } from "./mcpConnectorsView";

export interface McpConnectorsWatchDeps {
  api: { onMcpConnectors(listener: (snapshot: McpSnapshot) => void): () => void };
  // Whether the agent has a Doan conversation turn running now (the renderer's conversation lists).
  running(provider: McpProvider): boolean;
  // Whether Settings > MCP Connectors is the screen shown.
  pageShown(): boolean;
  toast(text: string, label: string, run: () => void): void;
  openPage(): void;
}

// App's one reader of main's MCP connector snapshots (mcp-connectors task D2). Attempts outlive the page, so what
// follows them lives here: the latest snapshot, the page's announcements, a failure told by a toast while the page
// isn't shown (spec 4) and the notice under the item changed while that agent runs a turn (spec 10).
export class McpConnectorsWatch {
  snapshot: McpSnapshot | null = null;
  // The server each agent's notice sits under; one per section, gone when that agent's running turn ends.
  notices: Partial<Record<McpProvider, string>> = {};
  announcement: { seq: number; text: string } | null = null;
  private seq = 0;
  private listeners = new Set<() => void>();
  // The action each row offered when last settled, kept by a row while it is Removing (draft frame 7).
  private settled = new Map<string, ConnectorAction>();
  constructor(private readonly deps: McpConnectorsWatchDeps) {}

  start(): () => void { return this.deps.api.onMcpConnectors(snapshot => this.receive(snapshot)); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  // Snapshots carry one revision; the newest wins whichever way it came (the change event or a list reply).
  receive(next: McpSnapshot): void {
    const prev = this.snapshot;
    if (prev && next.revision <= prev.revision) return;
    this.snapshot = next;
    for (const dto of next.providers) for (const row of dto.rows) if (row.view.action && row.view.status !== "connecting") this.settled.set(`${dto.provider}\0${row.name}`, row.view.action);
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

  // Called when conversation lists change: a notice goes once its agent's running turn has ended.
  runningChanged(): void {
    const kept = Object.fromEntries(Object.entries(this.notices).filter(([provider]) => this.deps.running(provider as McpProvider)));
    if (Object.keys(kept).length === Object.keys(this.notices).length) return;
    this.notices = kept;
    this.changed();
  }

  noticeText(provider: McpProvider): string { return runningNoticeText(provider); }
  remembered(provider: McpProvider, name: string): ConnectorAction | null { return this.settled.get(`${provider}\0${name}`) ?? null; }
  announcementSeq(): number { return this.seq; }

  private changed(): void { for (const listener of this.listeners) listener(); }
}
