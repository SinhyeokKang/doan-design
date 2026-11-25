import { useEffect, useState } from "react";

// While it is open App holds first run's lock; close() lifts it here at once and tells main, which re-enables
// Settings…, ⌘B and the open-Settings command.
export interface BuddyIntroLock { open: boolean; close(): void }

export function useBuddyIntroLock(): BuddyIntroLock {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let current = true;
    window.doan.readBuddyIntro().then(value => { if (current && value) setOpen(true); }).catch(console.error);
    return () => { current = false; };
  }, []);
  return {
    open,
    close: () => { setOpen(false); void window.doan.closeBuddyIntro().catch(console.error); },
  };
}
