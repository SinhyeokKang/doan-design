import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BUILD_YEAR, HomeCredit } from "./HomeCredit";
import { REPOSITORY_URL } from "../main/repository";

let openRepository: ReturnType<typeof vi.fn>;
beforeEach(() => {
  openRepository = vi.fn(async () => true);
  vi.stubGlobal("window", { doan: { openRepository } });
});
afterEach(() => { vi.unstubAllGlobals(); });

// The anchor in the component's own element tree, so its click can be run without a DOM.
function link(): ReactElement<{ href: string; onClick(event: { preventDefault(): void }): void }> {
  const find = (node: ReactNode): ReactElement | null => {
    if (Array.isArray(node)) { for (const child of node) { const found = find(child); if (found) return found; } return null; }
    if (!isValidElement(node)) return null;
    if (node.type === "a") return node;
    return find((node.props as { children?: ReactNode }).children);
  };
  const found = find(HomeCredit());
  if (!found) throw new Error("no link");
  return found as ReturnType<typeof link>;
}

test("the year is the build's, not a written one", () => {
  expect(BUILD_YEAR).toBe(new Date().getFullYear());
});

test("the credit line: copyright, repository link and plain email, with hidden bar separators", () => {
  expect(renderToStaticMarkup(<HomeCredit />)).toBe(
    `<footer class="home-credit"><p class="home-credit-line"><span>© ${BUILD_YEAR} Doan</span><span aria-hidden="true"> | </span>`
    + `<a class="home-credit-link" href="${REPOSITORY_URL}">github.com/SinhyeokKang/doan-design</a><span aria-hidden="true"> | </span>`
    + `<span class="selectable">ox501501@gmail.com</span></p></footer>`);
});

test("the email is selectable text, not a link", () => {
  const html = renderToStaticMarkup(<HomeCredit />);
  expect(html).not.toContain("mailto:");
  expect(html.match(/<a /g)).toHaveLength(1);
});

test("the link opens main's fixed repository URL: the renderer sends no URL and the window does not navigate", () => {
  const preventDefault = vi.fn();
  link().props.onClick({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(openRepository).toHaveBeenCalledExactlyOnceWith();
});

// The user chose no failure line: the address is already on screen.
test("a browser that did not open shows nothing and leaves no unhandled rejection", async () => {
  openRepository.mockRejectedValueOnce(new Error("refused"));
  link().props.onClick({ preventDefault: () => {} });
  openRepository.mockResolvedValueOnce(false);
  link().props.onClick({ preventDefault: () => {} });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(openRepository).toHaveBeenCalledTimes(2);
  expect(renderToStaticMarkup(<HomeCredit />)).not.toContain("Couldn’t open");
});
