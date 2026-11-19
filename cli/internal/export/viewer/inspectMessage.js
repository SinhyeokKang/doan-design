// The legacy layout and wheel parser also runs in the frame. Only the shell needs the inspector protocol.
const inspectorMessages = (() => {
  const string = (value, limit) => typeof value === "string" && value.length <= limit;
  const optional = (value) => value === undefined || string(value, 500);
  const list = (items, limit, valid) => {
    if (!Array.isArray(items) || items.length > limit) return false;
    for (const item of items) if (!valid(item)) return false;
    return true;
  };
  const rect = (r) => isRecord(r) && isFiniteNumber(r.x) && isFiniteNumber(r.y) && isNonNegative(r.width) && isNonNegative(r.height);
  const side = (s) => isRecord(s) && string(s.side, 32) && string(s.value, 500) && optional(s.token);
  const row = (r) => isRecord(r) && ["layout", "box", "typography", "colors", "radius", "shadow"].includes(r.group)
    && ["token", "hardcoded", "unknown", "default"].includes(r.state) && string(r.label, 32) && string(r.value, 500)
    && optional(r.token) && optional(r.inheritedFrom) && (r.hoverState === undefined || typeof r.hoverState === "boolean")
    && (r.chain === undefined || list(r.chain, 8, name => string(name, 500))) && (r.sides === undefined || list(r.sides, 4, side));
  const node = (n) => isRecord(n) && Number.isSafeInteger(n.depth) && n.depth >= 0 && n.depth < 200
    && string(n.name, MAX_STRING) && string(n.selector, 1000) && typeof n.selected === "boolean"
    && ["frame", "flex-row", "flex-column", "grid", "input", "button", "text", "box"].includes(n.kind);

  // Keep only checked fields. A cloned array can also carry canvas-owned properties.
  function fields(source, names) {
    const result = {};
    for (const name of names) if (source[name] !== undefined) result[name] = source[name];
    return result;
  }
  const copyRect = r => r === null ? null : fields(r, ["x", "y", "width", "height"]);
  function copyRow(r) {
    const result = fields(r, ["group", "label", "value", "state", "token", "hoverState", "inheritedFrom"]);
    if (r.chain) result.chain = Array.from(r.chain);
    if (r.sides) result.sides = Array.from(r.sides, side => fields(side, ["side", "value", "token"]));
    return result;
  }

  return { parseMessage(event, frame, epoch, last, canvasFocused) {
    const data = event.data;
    if (!frame || event.source !== frame || event.origin !== "null" || !isRecord(data) || data.epoch !== epoch
      || !Number.isSafeInteger(data.seq) || data.seq <= last) return null;
    const message = fields(data, ["type", "epoch", "seq"]);
    switch (data.type) {
      case "inspection": {
        if (!list(data.rows, 32, row) || !list(data.nodes, 200, node)) return null;
        const nodes = Array.from(data.nodes, n => fields(n, ["depth", "name", "selector", "kind", "selected"]));
        if (nodes.length ? nodes.filter(n => n.selected).length !== 1 : data.rows.length !== 0) return null;
        if (nodes.some((n, i) => i === 0 ? n.depth !== 0 : n.depth < 1 || n.depth > nodes[i - 1].depth + 1)) return null;
        return { ...message, nodes, rows: Array.from(data.rows, copyRow) };
      }
      case "inspect-marks":
        if ((data.selected !== null && !rect(data.selected)) || (data.hover !== null && !rect(data.hover))) return null;
        return { ...message, selected: copyRect(data.selected), hover: copyRect(data.hover) };
      case "inspect-text":
        if (data.dragging === true && !canvasFocused) return null;
        if (!list(data.rects, 2000, rect) || !string(data.text, 100000) || typeof data.dragging !== "boolean") return null;
        return { ...message, rects: Array.from(data.rects, copyRect), text: data.text, dragging: data.dragging };
      case "inspect-press":
        return canvasFocused ? message : null;
      default:
        return null;
    }
  } };
})();
