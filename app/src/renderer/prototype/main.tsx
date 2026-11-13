import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { DoanPrototypeApi } from "../../preload/prototype";
import { applyBuddy, firstPaintBuddy } from "../buddyPaint";
import { TooltipProvider } from "../components/ui/tooltip";
import { dockedBuddy } from "../dockedBuddyShell";
import { PrototypeWindow } from "./PrototypeWindow";

// The prototype window's preload API; passing it as PrototypeWindow's `api` checks it against every call object the
// panel takes (calls.test.ts names them one by one).
declare global { interface Window { doanPrototype: DoanPrototypeApi } }
// Main opens the window with the saved buddy in its query, so the panel's first paint has its accent.
const buddy = firstPaintBuddy(location.search);
applyBuddy(document.documentElement, buddy);
dockedBuddy.setBuddy(buddy);
const root = document.getElementById("root");
if (root === null) throw new Error("Missing prototype root");
createRoot(root).render(createElement(StrictMode, null, createElement(TooltipProvider, null, createElement(PrototypeWindow, { api: window.doanPrototype }))));
