import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyBuddy, firstPaintBuddy, type BuddyPaint } from "./buddyPaint";
import type { DoanApi } from "../preload/index";

declare global { interface Window { doan: DoanApi } }
const root = document.getElementById("root");
if (root === null) throw new Error("Missing app root");
// Before React mounts, so the first frame already has the saved buddy's accent (main put it in the query).
const paint: BuddyPaint = { first: firstPaintBuddy(location.search), apply: id => applyBuddy(document.documentElement, id) };
paint.apply(paint.first);
createRoot(root).render(createElement(StrictMode, null, createElement<{ paint?: BuddyPaint }>(App, { paint })));
