import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { DoanSettingsApi } from "../preload/settings";
import { SettingsWindow } from "./settingsWindow";
import "./settings.css";

declare global { interface Window { doanSettings: DoanSettingsApi } }

const root = document.getElementById("root");
if (root) createRoot(root).render(createElement(SettingsWindow));
