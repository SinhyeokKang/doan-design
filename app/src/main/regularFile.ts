import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

// Larger than any git config or agent record the app reads on main, small enough that a huge file cannot stall it.
const MAX_BYTES = 16 * 1024 * 1024;

// A main-thread read of a file a repository or an agent can replace. A blocking open of a FIFO waits for a writer and
// freezes main, and a device such as /dev/zero never ends, so the open is O_NONBLOCK and only a regular file within
// the cap is read. Links are followed: dotfile setups link git config and include files. Throws as readFileSync does
// (ENOENT for a missing file); a special or oversized file throws without a code.
export function readRegularFileSync(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd), size = stat.size;
    if (!stat.isFile()) throw new Error("Not a regular file");
    if (size > MAX_BYTES) throw new Error("File exceeds limit");
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(fd, bytes, offset, size - offset, offset);
      if (!count) break;
      offset += count;
    }
    return bytes.toString("utf8", 0, offset);
  } finally { closeSync(fd); }
}
