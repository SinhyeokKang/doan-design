import * as fs from "node:fs";
import { isAbsolute } from "node:path";

const port = process.parentPort;
if (!port) throw new Error("Missing utility parent port");
const O_NOFOLLOW_ANY = 0x20000000;
let consumed = false;

port.on("message", ({ data }: { data: unknown }) => {
  // Consume synchronously: a queued second job cannot change cwd mid-job.
  if (consumed) {
    port.postMessage({ ok: false, error: "Extra mkdir job" });
    process.exit(1);
  }
  consumed = true;
  setImmediate(() => {
    try {
      if (process.platform !== "darwin") throw new Error("Unsupported filesystem platform");
      if (typeof data !== "object" || data === null || !("parent" in data) || !("name" in data)
        || Object.keys(data).length !== 2 || typeof data.parent !== "string"
        || !isAbsolute(data.parent) || data.parent.includes("\0")
        || (data.name !== ".doan" && data.name !== "comments")) throw new Error("Invalid mkdir job");
      const parent = data.parent;
      const name = data.name;
      const fd = fs.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | O_NOFOLLOW_ANY);
      try {
        const pinned = fs.fstatSync(fd, { bigint: true });
        process.chdir(parent);
        const cwd = fs.statSync(".", { bigint: true });
        if (pinned.dev !== cwd.dev || pinned.ino !== cwd.ino) throw new Error("CWD identity mismatch");
        const verify = fs.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | O_NOFOLLOW_ANY);
        try {
          const reopened = fs.fstatSync(verify, { bigint: true });
          if (pinned.dev !== reopened.dev || pinned.ino !== reopened.ino) throw new Error("Path identity mismatch");
        } finally { fs.closeSync(verify); }
        try { fs.mkdirSync(name); } catch (error) {
          // EEXIST grants no authority; the caller must open the next directory anew.
          if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
        }
      } finally { fs.closeSync(fd); }
      port.postMessage({ ok: true });
    } catch (error) {
      port.postMessage({ ok: false, error: error instanceof Error ? error.message : "Mkdir failed" });
    }
    // The parent kills and waits for exit after the result, retaining duplicate detection.
  });
});
