// The dot field's module Worker. It imports dotField.ts alone (rendererImports.test.ts holds it to that): the page's
// other modules import each other by value and expect a document.
import { dotFieldWorker, type DotFieldMessage } from "./dotField";

const receive = dotFieldWorker({ request: run => requestAnimationFrame(run), cancel: frame => cancelAnimationFrame(frame) });
self.onmessage = (event: MessageEvent<DotFieldMessage>) => receive(event.data);
