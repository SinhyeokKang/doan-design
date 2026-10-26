import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { ErrorDetails } from "./ErrorDetails";

const opened = vi.hoisted(() => ({ value: false }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => actual.useState(opened.value || initial) };
});
afterEach(() => { opened.value = false; });

const render = () => renderToStaticMarkup(<ErrorDetails className="btn" detail="raw message">{(button, detail) => <p>Sentence{button}{detail}</p>}</ErrorDetails>);

test("Details starts closed and keeps the raw message out", () => {
  expect(render()).toBe('<p>Sentence<button type="button" class="btn doan-button" data-ui-size="sm" aria-label="Details" aria-expanded="false">Details ▸</button></p>');
});

test("open Details shows the raw message", () => {
  opened.value = true;
  expect(render()).toBe('<p>Sentence<button type="button" class="btn doan-button" data-ui-size="sm" aria-label="Details" aria-expanded="true">Details ▾</button>raw message</p>');
});
