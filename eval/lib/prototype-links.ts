import { registerHooks } from "node:module";

// Vite resolves this app module's extensionless mark import; Node needs the suffix.
const source = new URL("../../app/src/main/prototype/links.ts", import.meta.url).href;
const hook = registerHooks({
  resolve(specifier, context, next) {
    return next(context.parentURL === source && specifier === "./mark" ? "./mark.ts" : specifier, context);
  },
});
export const { linkGroups } = await import("../../app/src/main/prototype/links.ts").finally(() => hook.deregister());
