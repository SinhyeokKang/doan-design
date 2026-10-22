import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { DoanApi } from "../preload/index";

declare global { interface Window { doan: DoanApi } }
const root = document.getElementById("root");
if (root === null) throw new Error("Missing app root");
createRoot(root).render(createElement(StrictMode, null, createElement(App)));
