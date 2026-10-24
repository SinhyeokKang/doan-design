import { useEffect, useState } from "react";

export function DropOverlay({ blocked }: { blocked: boolean }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let depth = 0;
    const files = (event: DragEvent) => event.dataTransfer?.types.includes("Files");
    const enter = (event: DragEvent) => { if (!files(event)) return; event.preventDefault(); if (!blocked) { depth++; setActive(true); } };
    const over = (event: DragEvent) => { if (files(event)) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = blocked ? "none" : "copy"; } };
    const leave = (event: DragEvent) => { if (!files(event)) return; if (--depth <= 0) { depth = 0; setActive(false); } };
    const drop = (event: DragEvent) => { if (!files(event)) return; event.preventDefault(); depth = 0; setActive(false); if (!blocked && event.dataTransfer) void window.doan.addDroppedFiles(Array.from(event.dataTransfer.files)).catch(console.error); };
    window.addEventListener("dragenter", enter); window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop);
    if (blocked) setActive(false);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, [blocked]);
  return active && !blocked && <div className="drop" role="region" aria-label="Drop folders to add"><div className="scrim" /><div className="drop-zone"><span className="drop-glyph" aria-hidden="true">+</span><b>Drop folders to add</b><p>A folder of repositories shows a checklist.</p></div></div>;
}
