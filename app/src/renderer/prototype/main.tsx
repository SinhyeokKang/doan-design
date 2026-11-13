import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "../components/ui/tooltip";
import { PrototypeWindow, type PrototypeApi } from "./PrototypeWindow";

// The prototype window's preload API (ipc.ts PrototypeWindowApi plus the still-image event).
declare global { interface Window { doanPrototype: PrototypeApi } }
const root = document.getElementById("root");
if (root === null) throw new Error("Missing prototype root");
createRoot(root).render(createElement(StrictMode, null, createElement(TooltipProvider, null, createElement(PrototypeWindow, { api: window.doanPrototype }))));
