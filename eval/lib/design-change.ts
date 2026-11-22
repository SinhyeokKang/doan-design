import { registerHooks } from "node:module";

// Vite resolves this app module's extensionless canvas path import; Node needs the suffix.
const source = new URL("../../app/src/main/designChange.ts", import.meta.url).href;
const hook = registerHooks({
  resolve(specifier, context, next) {
    return next(context.parentURL === source && specifier === "../formats/canvasPath" ? "../formats/canvasPath.ts" : specifier, context);
  },
});
export const { classifyDesignChange } = await import("../../app/src/main/designChange.ts").finally(() => hook.deregister());
