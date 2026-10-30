import type { OnboardingRequest } from "../formats/types";
import { parseGitHubUrl } from "./onboarding/repository";
import { rendererRequest } from "./onboarding/service";

// What the Add Projects page may ask main, one kind per channel (buzz-add-projects design 'main의 project 처리').
export type AddPageOp = "read" | "inspect" | "select" | "clone" | "cancel";
// read without a session is the page's current state; the rest are the onboarding session's DTOs for these ops.
export type AddPageRequest = { op: "read" } | Extract<OnboardingRequest, { op: "status" | "cancel" | "project_inspect" | "project_select" | "project_clone" }>;

const OPS = { read: "status", inspect: "project_inspect", select: "project_select", clone: "project_clone", cancel: "cancel" } as const;
// Paths are the folder sheet's, a drop's, a candidate's or a clone destination; none needs more.
const MAX_STRING = 4096;

// The schema already refuses unknown keys, the socket's own v/token/op, ids outside [A-Za-z0-9_-]{1,128} and relative
// paths. It leaves path length and GitHub URL syntax to the app, which the page has no reason to send wrong.
export function addPageRequest(op: AddPageOp, value: unknown): AddPageRequest | null {
  if (op === "read" && typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0) return { op: "read" };
  const request = rendererRequest(OPS[op], value);
  if (request === null || Object.values(request).some(field => typeof field === "string" && field.length > MAX_STRING)) return null;
  if ("url" in request && typeof request.url === "string" && parseGitHubUrl(request.url) === null) return null;
  return request as AddPageRequest;
}
