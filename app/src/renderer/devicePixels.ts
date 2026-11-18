// Calls `changed` each time devicePixelRatio changes, as when the window moves to a display of another scale. That
// changes no CSS size, so no content-box ResizeObserver fires (and a device-pixel-content-box one did not fire for a
// scale change emulated over CDP). A resolution query matches one ratio, so each change listens to the new one.
export function onDevicePixelRatio(changed: () => void): () => void {
  let stop = () => {};
  const listen = () => {
    const query = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    const change = () => { stop(); listen(); changed(); };
    query.addEventListener("change", change);
    stop = () => query.removeEventListener("change", change);
  };
  listen();
  return () => stop();
}
