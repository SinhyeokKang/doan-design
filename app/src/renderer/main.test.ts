import { afterEach, expect, test, vi } from "vitest";

// The renderer entry sets data-buddy from the window's query before React mounts, so the first frame already has
// the saved buddy's accent, and hands App the same paint so later snapshots re-apply it.
const seen = vi.hoisted(() => ({ atRender: undefined as string | undefined, props: undefined as unknown }));
const attributes = new Map<string, string>();
vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: (element: { props: { children?: { props: unknown } } }) => { seen.atRender = attributes.get("data-buddy"); seen.props = element.props.children?.props; } }),
}));
vi.mock("./App", () => ({ App: () => null }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); attributes.clear(); });

async function boot(search: string) {
  vi.stubGlobal("location", { search });
  vi.stubGlobal("document", {
    getElementById: () => ({}),
    documentElement: { setAttribute: (name: string, value: string) => void attributes.set(name, value), removeAttribute: (name: string) => void attributes.delete(name) },
  });
  await import("./main");
}

test("data-buddy is set before the first render and App gets the first paint", async () => {
  await boot("?buddy=dori");
  expect(seen.atRender).toBe("dori");
  const { paint } = seen.props as { paint: { first: string; apply(id: string): void } };
  expect(paint.first).toBe("dori");
  paint.apply("doany");
  expect(attributes.has("data-buddy")).toBe(false);
  paint.apply("popo");
  expect(attributes.get("data-buddy")).toBe("popo");
});

test("an unknown or missing buddy paints Doany, with no attribute", async () => {
  await boot("?buddy=nemo");
  expect(seen.atRender).toBeUndefined();
  expect((seen.props as { paint: { first: string } }).paint.first).toBe("doany");
});
