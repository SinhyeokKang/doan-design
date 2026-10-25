import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { Home } from "./Home";

vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: () => [{ summary: { cli: "connected", claude: "needs-attention", codex: "needs-attention" }, causes: { claude: { kind: "skill-differs" }, codex: { kind: "skill-differs" } }, onboardingClosed: true }, vi.fn()],
}));
test("Home shows a shared skill warning only once when both agents need attention", () => {
  const html = renderToStaticMarkup(<Home homeDirectory={null} entries={[]} loaded={null} selection={null} highlight={[]} enter={() => {}} action={() => {}} remove={() => {}} />);
  expect(html.match(/The doan skill was changed, so agents may follow other instructions\./g)).toHaveLength(1);
});
