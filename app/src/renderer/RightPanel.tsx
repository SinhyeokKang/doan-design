import { useRef } from "react";
import { CanvasConversationList, type CanvasConversationListProps } from "./CanvasConversationList";

// The Overview's right panel: the region and its title, named once; the list inside is
// unnamed.
export function CanvasConversations(props: Omit<CanvasConversationListProps, "scroller" | "title">) {
  const scroller = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  return <aside className="right doan-scroll ov-right" role="region" aria-label="Conversations" ref={scroller}>
    <h2 className="phead rp-head panel-fade-head" tabIndex={-1} ref={title}>Conversations</h2>
    <CanvasConversationList {...props} scroller={scroller} title={title} />
  </aside>;
}
