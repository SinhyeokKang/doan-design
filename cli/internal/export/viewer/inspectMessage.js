// The legacy layout and wheel parser also runs in the frame. Only the shell needs the inspector protocol.
const inspectorMessages = (() => {
  const string = (value, limit) => typeof value === "string" && value.length <= limit;
  const optional = (value) => value === undefined || string(value, 500);
  const list = (items, limit, valid) => Array.isArray(items) && items.length <= limit && items.every(valid);
  const rect = (r) => isRecord(r) && isFiniteNumber(r.x) && isFiniteNumber(r.y) && isNonNegative(r.width) && isNonNegative(r.height);
  const side = (s) => isRecord(s) && string(s.side, 32) && string(s.value, 500) && optional(s.token);
  const row = (r) => isRecord(r) && ["layout", "box", "typography", "colors", "radius", "shadow"].includes(r.group)
    && ["token", "hardcoded", "unknown", "default"].includes(r.state) && string(r.label, 32) && string(r.value, 500)
    && optional(r.token) && optional(r.inheritedFrom) && (r.hoverState === undefined || typeof r.hoverState === "boolean")
    && (r.chain === undefined || list(r.chain, 8, name => string(name, 500))) && (r.sides === undefined || list(r.sides, 4, side));
  const node = (n) => isRecord(n) && Number.isSafeInteger(n.depth) && n.depth >= 0 && n.depth < 200
    && string(n.name, MAX_STRING) && string(n.selector, 1000) && typeof n.selected === "boolean"
    && ["frame", "flex-row", "flex-column", "grid", "input", "button", "text", "box"].includes(n.kind);

  return { parseMessage(event, frame, epoch, last) {
    const data = event.data;
    if (!frame || event.source !== frame || event.origin !== "null" || !isRecord(data) || data.epoch !== epoch
      || !Number.isSafeInteger(data.seq) || data.seq <= last) return null;
    switch (data.type) {
      case "inspection":
        return list(data.rows, 32, row) && list(data.nodes, 200, node)
          && (data.nodes.length ? data.nodes.filter(n => n.selected).length === 1 : !data.rows.length) ? data : null;
      case "inspect-marks":
        return (data.selected === null || rect(data.selected)) && (data.hover === null || rect(data.hover)) ? data : null;
      case "inspect-text":
        return list(data.rects, 2000, rect) && string(data.text, 100000) && typeof data.dragging === "boolean" ? data : null;
      case "inspect-press":
        return data;
      default:
        return null;
    }
  } };
})();
