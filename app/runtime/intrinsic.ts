// Compare in one renderer turn so system font metrics affect both specimens.
export function intrinsicButton(element: HTMLElement): { actual: number; natural: number } {
  const reference = element.cloneNode(true) as HTMLElement;
  reference.removeAttribute("id");
  reference.style.alignSelf = "flex-start";
  reference.style.visibility = "hidden";
  element.parentElement!.append(reference);
  try {
    return { actual: element.getBoundingClientRect().height, natural: reference.getBoundingClientRect().height };
  } finally { reference.remove(); }
}
