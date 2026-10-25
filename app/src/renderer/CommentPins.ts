import { pluralComments } from "../comments/panelText";
import type { CommentPin } from "../comments/projection";

// Screen-space children of the overlay, outside the transformed board.
export class CommentPins {
  private buttons = new Map<string, HTMLButtonElement>();
  constructor(private overlay: Pick<HTMLElement, "append">, private activate: (node: string) => void,
    private focusFallback: () => void) {}

  render(pins: readonly CommentPin[]): void {
    const visible = new Set(pins.map(pin => pin.node));
    for (const [node, button] of this.buttons) {
      if (visible.has(node)) continue;
      const focused = document.activeElement === button;
      button.remove();
      this.buttons.delete(node);
      if (focused) this.focusFallback();
    }
    for (const pin of pins) {
      let button = this.buttons.get(pin.node);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "comment-pin";
        // Values follow design/comments-ui.html's approved .pin rule.
        Object.assign(button.style, { position: "absolute", minWidth: "24px", height: "24px", padding: "0 6px",
          borderRadius: "12px", border: "1px solid var(--accent-ink)", background: "var(--accent)",
          color: "var(--accent-ink)", font: "600 11px var(--font-sans)", boxShadow: "var(--shadow-1)",
          pointerEvents: "auto", transform: "translate(-50%, -50%)" });
        button.addEventListener("pointerdown", event => event.stopPropagation());
        button.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); });
        button.addEventListener("click", event => { event.stopPropagation(); this.activate(pin.node); });
        this.buttons.set(pin.node, button);
        this.overlay.append(button);
      }
      button.textContent = String(pin.comments.length);
      button.setAttribute("aria-label", pluralComments(pin.comments.length));
      button.style.left = `${pin.x}px`;
      button.style.top = `${pin.y}px`;
    }
  }
  dispose(): void { this.render([]); }
}
