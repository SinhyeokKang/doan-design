import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

// The CLI finds a repo by walking up for .doan/.git, so a run inside a checkout
// would act on that checkout (onboard task 11, PRODUCT §6).
export function findCheckout(path: string): string | null {
  for (let dir = resolve(path); ; dir = dirname(dir)) {
    if (existsSync(resolve(dir, ".git")) || existsSync(resolve(dir, ".doan"))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

export function assertOutsideCheckout(path: string): void {
  const checkout = findCheckout(path);
  if (checkout !== null) throw new Error(`${path} is inside ${checkout}; eval runs must live outside any checkout`);
}
