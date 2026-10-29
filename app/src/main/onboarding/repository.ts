import type { RemoteRead } from "./gitConfig";

// Pure: the renderer also uses parseGitHubUrl to enable Find repository, so this module imports no Node APIs.
export interface GitHubRepository { owner: string; repository: string }
// url is the accepted input without its trailing slash; clone keeps the user's transport so their SSH or HTTPS
// credentials apply.
export interface GitHubUrl extends GitHubRepository { transport: "https" | "ssh"; url: string }

// GitHub account names: alphanumerics and inner hyphens, at most 39. Repository names: [A-Za-z0-9._-], at most 100.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const GITHUB = "github.com";

// "owner/repository[.git][/]" with nothing else: no extra segment, query, fragment, escape or whitespace.
function repositoryPath(path: string): { repo: GitHubRepository; path: string } | null {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const parts = trimmed.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts as [string, string];
  const repository = name.endsWith(".git") ? name.slice(0, -4) : name;
  if (!OWNER.test(owner) || !NAME.test(repository) || repository === "." || repository === "..") return null;
  return { repo: { owner, repository }, path: trimmed };
}

// Accepts only https://github.com/…, git@github.com:… and ssh://git@github.com/… (design 'GitHub 조회·clone 실행 계약').
// Credentials, ports and other hosts fall out because the authority must be exactly github.com.
const FORMS: [RegExp, GitHubUrl["transport"]][] = [
  [/^https:\/\/([^/]*)\/(.*)$/i, "https"],
  // The SSH user is case-sensitive, so only the scheme ignores case.
  [/^[sS][sS][hH]:\/\/git@([^/]*)\/(.*)$/, "ssh"],
  [/^git@([^:/]*):(.*)$/, "ssh"],
];
export function parseGitHubUrl(input: string): GitHubUrl | null {
  const text = input.trim();
  for (const [form, transport] of FORMS) {
    const match = form.exec(text);
    if (!match) continue;
    const [, host, rest] = match as unknown as [string, string, string];
    const parsed = host.toLowerCase() === GITHUB ? repositoryPath(rest) : null;
    return parsed && { ...parsed.repo, transport, url: text.slice(0, text.length - rest.length) + parsed.path };
  }
  return null;
}

// An explicit default port is the same server; github.com:443 over ssh is not.
const DEFAULT_PORT: Record<string, RegExp> = { https: /:443$/, ssh: /:22$/ };
// A configured remote may carry a user or token, an ssh port 22, or git://; it still names the same repository.
// Only the owner and name come back, never the credential.
export function remoteRepository(url: string): GitHubRepository | null {
  const scheme = /^(https?|git|ssh):\/\/(?:[^@/]+@)?([^/]*)\/(.*)$/i.exec(url);
  const scp = /^[^@/:]+@([^:/]*):(.*)$/.exec(url);
  const port = scheme && DEFAULT_PORT[scheme[1]!.toLowerCase()];
  const [host, rest] = scheme ? [port ? scheme[2]!.toLowerCase().replace(port, "") : scheme[2]!.toLowerCase(), scheme[3]!] : scp ? [scp[1]!.toLowerCase(), scp[2]!] : [];
  if (host !== GITHUB || rest === undefined) return null;
  return repositoryPath(rest)?.repo ?? null;
}

// GitHub owner and repository names are case-insensitive.
export function sameRepository(a: GitHubRepository, b: GitHubRepository): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.repository.toLowerCase() === b.repository.toLowerCase();
}

// A config that could not be read, or a conditional include that was not followed, never proves a mismatch.
export function folderMatch(repo: GitHubRepository, read: RemoteRead): "match" | "mismatch" | "unknown" {
  if (!read.ok) return read.reason === "not_repository" ? "mismatch" : "unknown";
  if (read.urls.some(url => { const remote = remoteRepository(url); return remote !== null && sameRepository(remote, repo); })) return "match";
  return read.uncertain ? "unknown" : "mismatch";
}

export interface ProjectRemotes { root: string; remotes: RemoteRead }
export interface Candidates { kind: "none" | "one" | "many"; roots: string[]; unknown: string[] }
// Roots are canonical (main resolved them), so equal strings are one folder however many remotes match.
export function findCandidates(repo: GitHubRepository, projects: readonly ProjectRemotes[]): Candidates {
  const roots: string[] = [], unknown: string[] = [];
  for (const { root, remotes } of projects) {
    if (roots.includes(root)) continue;
    const match = folderMatch(repo, remotes);
    if (match === "match") { roots.push(root); if (unknown.includes(root)) unknown.splice(unknown.indexOf(root), 1); }
    else if (match === "unknown" && !unknown.includes(root)) unknown.push(root);
  }
  return { kind: roots.length === 0 ? "none" : roots.length === 1 ? "one" : "many", roots, unknown };
}
