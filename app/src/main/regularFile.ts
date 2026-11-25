import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

// Larger than any git config or agent record the app reads on main, small enough that a huge file cannot stall it.
const MAX_BYTES = 16 * 1024 * 1024;

// A blocking open of a FIFO freezes main and /dev/zero never ends, so the open is O_NONBLOCK and only a regular file
// within the cap is read. Links are followed (dotfile setups link git config); a special or oversized file throws.
export function readRegularFileSync(path: string): string {
  return readRegularBytesSync(path).toString("utf8");
}

// As readRegularFileSync, for a caller that must tell bytes that are not UTF-8 from text a lossy decode would make.
export function readRegularBytesSync(path: string): Buffer {
  return readOpened(openSync(path, constants.O_RDONLY | constants.O_NONBLOCK), MAX_BYTES);
}

// As readRegularFileSync, for a file whose link must be refused (a credential an agent could point elsewhere): the
// open itself refuses a link with ELOOP, so no check-then-read gap lets one be swapped in.
export function readRegularFileNoFollowSync(path: string, limit: number): Buffer {
  return readOpened(openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW), limit);
}

function readOpened(fd: number, limit: number): Buffer {
  try {
    const stat = fstatSync(fd), size = stat.size;
    if (!stat.isFile()) throw new Error("Not a regular file");
    if (size > limit) throw new Error("File exceeds limit");
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(fd, bytes, offset, size - offset, offset);
      if (!count) break;
      offset += count;
    }
    return bytes.subarray(0, offset);
  } finally { closeSync(fd); }
}
