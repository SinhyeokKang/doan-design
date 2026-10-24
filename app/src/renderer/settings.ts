import type { DoanSettingsApi } from "../preload/settings";

declare global { interface Window { doanSettings: DoanSettingsApi } }

// Placeholder entry so the Settings window builds and loads; the
// Connections and Projects tabs replace it (app-setup task 9).
const root = document.getElementById("root");
if (root) root.textContent = "Settings";
