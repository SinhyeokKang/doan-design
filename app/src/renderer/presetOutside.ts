// The `/` list's trigger is the field: typing there opened it, so a press in the list or the field keeps the list, and a
// press anywhere else (chips, tray, the rest of the card, the page) closes it. Takes the press's target as given; the list
// and field are null while unmounted.
type Container = { contains(node: Node | null): boolean };
export function outsidePresetList(target: unknown, list: Container | null, field: Container | null): boolean {
  if (target === null || target === undefined) return false;
  return !list?.contains(target as Node) && !field?.contains(target as Node);
}
