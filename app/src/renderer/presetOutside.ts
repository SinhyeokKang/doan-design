// Typing in the field opened the `/` list, so a press in the list or the field keeps it and any other press closes it.
// The list and field are null while unmounted.
type Container = { contains(node: Node | null): boolean };
export function outsidePresetList(target: unknown, list: Container | null, field: Container | null): boolean {
  if (target === null || target === undefined) return false;
  return !list?.contains(target as Node) && !field?.contains(target as Node);
}
