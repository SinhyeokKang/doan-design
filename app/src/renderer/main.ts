import type { FolderEntry } from "../main/view";
import type { DoanApi } from "../preload/index";

declare global {
  interface Window {
    doan: DoanApi;
  }
}

// Plain DOM until a UI framework is chosen with the first design draft
// (feature 6). Text goes in through textContent only: titles and paths come
// from files an agent wrote.
const list = document.getElementById("folders") as HTMLElement;
const openButton = document.getElementById("open-folder") as HTMLButtonElement;

openButton.addEventListener("click", () => void window.doan.openFolder());
window.doan.onFolders(render);

function render(entries: FolderEntry[]): void {
  if (entries.length === 0) {
    list.replaceChildren(text("p", "folder-status", "열린 폴더가 없습니다. '폴더 열기'로 리포를 여세요."));
    return;
  }
  list.replaceChildren(...entries.map(folderSection));
}

function folderSection(entry: FolderEntry): HTMLElement {
  const section = document.createElement("section");
  section.className = "folder";
  section.dataset.path = entry.path;
  section.dataset.state = entry.kind;

  const header = document.createElement("div");
  header.className = "folder-header";
  const close = text("button", "close", "닫기");
  close.setAttribute("type", "button");
  close.addEventListener("click", () => void window.doan.closeFolder(entry.path));
  header.append(text("h2", "folder-path", entry.path), close);
  section.append(header, ...body(entry));
  return section;
}

function body(entry: FolderEntry): HTMLElement[] {
  switch (entry.kind) {
    case "loading":
      return [text("p", "folder-status", "읽는 중…")];
    case "list": {
      if (entry.canvases.length === 0) return [text("p", "folder-status", "캔버스 없음")];
      const ul = document.createElement("ul");
      ul.className = "canvases";
      // CLI order as-is; the CLI sorts by path bytes.
      for (const canvas of entry.canvases) {
        const li = document.createElement("li");
        li.className = "canvas";
        li.dataset.path = canvas.path;
        // The serving URL the canvas iframe will load (feature 5).
        li.dataset.url = canvas.url;
        li.append(
          text("span", "canvas-path", canvas.path),
          text("span", "canvas-title", canvas.title ?? ""),
          text("span", "canvas-open", `열린 코멘트 ${canvas.open}`),
        );
        ul.append(li);
      }
      return [ul];
    }
    case "uninitialized": {
      const hint = text("p", "folder-hint", "터미널에서 실행: ");
      hint.append(text("code", "", "doan init"));
      return [text("p", "folder-status", "초기화되지 않음"), hint];
    }
    case "error":
      return [text("p", "folder-status", entry.message)];
    case "cliError":
      return [text("p", "folder-status", entry.reason ? `doan CLI 오류: ${entry.reason}` : "doan CLI 오류")];
    case "notFound":
      return [text("p", "folder-status", "폴더를 찾을 수 없음")];
  }
}

function text(tag: string, className: string, content: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = content;
  return element;
}
