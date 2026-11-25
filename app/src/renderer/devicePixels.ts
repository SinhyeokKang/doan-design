// A scale change changes no CSS size, so no ResizeObserver fires, not even a device-pixel-content-box one. A
// resolution query matches one ratio, so each change listens to the new one.
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
