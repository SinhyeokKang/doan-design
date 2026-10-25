// Runs only through page.evaluate in the test-owned renderer. Observing the
// session promise includes its stale-response branch, unlike a main IPC reply.
export function installCommentReadProbe(): void {
  const element = document.getElementById("root")?.firstElementChild;
  if (!element) throw new Error("Missing renderer root");
  const key = Object.keys(element).find(key => key.startsWith("__reactFiber$"));
  if (!key) throw new Error("Missing React fiber for test observation");
  type Session = {
    api: { commentsList: (request: { requestID: string }) => Promise<unknown> };
    read: (...args: unknown[]) => Promise<void>;
    identity: { canvas: string } | null;
    list: { comments: unknown[] } | null;
  };
  type Hook = { memoizedState: unknown; next?: Hook };
  type Fiber = { memoizedState?: Hook; return?: Fiber };
  let session: Session | undefined;
  for (let fiber = Reflect.get(element, key) as Fiber | undefined; fiber; fiber = fiber.return) {
    for (let hook = fiber.memoizedState; hook; hook = hook.next) {
      const candidate = hook.memoizedState;
      if (typeof candidate === "object" && candidate !== null && typeof Reflect.get(candidate, "read") === "function" && Reflect.has(candidate, "readRevision")) session = candidate as Session;
    }
  }
  if (!session) throw new Error("Missing CommentsSession for test observation");
  const original = session.read, api = session.api;
  let active: { requestID?: string } | undefined;
  const completed: { requestID: string; canvas: string | null; count: number | null }[] = [];
  session.api = { ...api, commentsList(request) { if (active) active.requestID = request.requestID; return api.commentsList(request); } };
  session.read = function (...args) {
    const call: { requestID?: string } = {}; active = call;
    const pending = original.apply(this, args); active = undefined;
    return pending.finally(() => {
      if (call.requestID) completed.push({ requestID: call.requestID, canvas: this.identity?.canvas ?? null, count: this.list?.comments.length ?? null });
    });
  };
  Reflect.set(window, "commentReadProbe", { completed, restore: () => { session!.read = original; session!.api = api; } });
}

// Settings discards its then/catch chain, so capture that chain only during
// one real React click handler. Restore the prototype before React continues.
export function armInstallConsumer(button: HTMLElement): number {
  const key = Object.keys(button).find(key => key.startsWith("__reactProps$"));
  if (!key) throw new Error("Missing React click props for install observation");
  const props = Reflect.get(button, key);
  if (typeof props.onClick !== "function") throw new Error("Missing install click handler");
  const calls: { completed: boolean; error?: string }[] = Reflect.get(window, "installConsumers") ?? [];
  Reflect.set(window, "installConsumers", calls);
  const call: { completed: boolean; error?: string } = { completed: false };
  const id = calls.push(call) - 1;
  Reflect.set(button, key, { ...props, onClick: (...args: unknown[]) => {
    Reflect.set(button, key, props);
    const then = Promise.prototype.then;
    let chain: Promise<unknown> | undefined, registrations = 0;
    Promise.prototype.then = function (this: Promise<unknown>, ...callbacks: Parameters<typeof then>) {
      const pending = then.apply(this, callbacks);
      chain = pending; registrations++;
      return pending;
    } as typeof then;
    let returned: unknown;
    try { returned = props.onClick(...args); }
    finally { Promise.prototype.then = then; }
    const pending = chain;
    if (!(pending instanceof Promise) || registrations !== 2) {
      call.error = `Unexpected install consumer shape: ${registrations}`;
      return returned;
    }
    void then.call(pending, () => { call.completed = true; }, error => { call.error = String(error); });
    return returned;
  } });
  return id;
}

export async function settledInstallConsumer(page: import("playwright").Page, id: number): Promise<void> {
  await page.waitForFunction(id => {
    const call = Reflect.get(window, "installConsumers")?.[id];
    if (call?.error) throw new Error(call.error);
    return call?.completed === true;
  }, id);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  console.log("install consumer completed and rendered", id);
}


// The Wizard intentionally discards install()'s promise. A non-pausing V8
// return breakpoint observes its actual post-await/catch completion instead.
export async function wizardInstallConsumers(page: import("playwright").Page) {
  const session = await page.context().newCDPSession(page);
  const scripts: { scriptId: string; url: string }[] = [];
  const parsed = (script: { scriptId: string; url: string }) => { scripts.push(script); };
  session.on("Debugger.scriptParsed", parsed);
  try {
    await session.send("Debugger.enable");
    const candidates = [];
    for (const script of scripts.filter(script => /\/assets\/index-[^/]+\.js$/.test(script.url))) {
      const { scriptSource } = await session.send("Debugger.getScriptSource", { scriptId: script.scriptId });
      if (scriptSource.includes("async function install(agent)")) candidates.push({ ...script, lines: scriptSource.split("\n") });
    }
    if (candidates.length !== 1) throw new Error("Expected one Wizard install consumer script");
    const { scriptId, lines } = candidates[0]!;
    const start = lines.findIndex(line => line.trim() === "async function install(agent) {");
    const end = lines.findIndex((line, index) => index > start && line.trim().startsWith("const closeLatest =")) - 1;
    const body = lines.slice(start, end + 1).map(line => line.trim());
    if (start < 0 || body.length !== 10 || body[1] !== "const request = ++installs.current;" || body[2] !== "setInstallError(null);" || body[4] !== "const ok = await window.doan.openInstallPage(agent);" || !body[5]?.includes("setInstallError(") || body[6] !== "} catch (error) {" || !body[7]?.includes("setInstallError(errorText(error))") || body[8] !== "}" || body[9] !== "}") throw new Error("Wizard install consumer shape changed");
    const { locations } = await session.send("Debugger.getPossibleBreakpoints", { start: { scriptId, lineNumber: start, columnNumber: 0 }, end: { scriptId, lineNumber: end + 1, columnNumber: 0 }, restrictToFunction: false });
    const returns = locations.filter(location => location.type === "return");
    if (returns.length !== 1 || returns[0]!.lineNumber !== end) throw new Error("Expected one Wizard return after both consumer branches");
    await page.evaluate(() => { Reflect.set(window, "installConsumers", []); Reflect.set(window, "wizardInstallStarted", []); });
    const entry = locations.find(location => location.lineNumber === start + 2);
    if (!entry) throw new Error("Missing post-identity Wizard entry location");
    const begun = await session.send("Debugger.setBreakpoint", { location: entry, condition: "(window.wizardInstallStarted.push(request), window.installConsumers[request] = { completed: false }, false)" });
    const completed = await session.send("Debugger.setBreakpoint", { location: returns[0]!, condition: "(window.installConsumers[request].completed = true, false)" });
    if (begun.actualLocation.lineNumber !== entry.lineNumber || begun.actualLocation.columnNumber !== entry.columnNumber || completed.actualLocation.lineNumber !== returns[0]!.lineNumber || completed.actualLocation.columnNumber !== returns[0]!.columnNumber) throw new Error("Wizard observer breakpoint moved");
    console.log("Wizard consumer return observer", { scriptId, entry: begun.actualLocation, completed: completed.actualLocation });
    return {
      async click(target: import("playwright").Locator) {
        const count = await page.evaluate(() => Reflect.get(window, "wizardInstallStarted").length);
        await target.click();
        await page.waitForFunction(count => Reflect.get(window, "wizardInstallStarted").length === count + 1, count);
        return await page.evaluate(() => Reflect.get(window, "wizardInstallStarted").at(-1)) as number;
      },
      async dispose() {
        try {
          await session.send("Debugger.removeBreakpoint", { breakpointId: begun.breakpointId });
          await session.send("Debugger.removeBreakpoint", { breakpointId: completed.breakpointId });
        } finally { session.off("Debugger.scriptParsed", parsed); await session.detach(); }
      },
    };
  } catch (error) {
    session.off("Debugger.scriptParsed", parsed);
    await session.detach();
    throw error;
  }
}
