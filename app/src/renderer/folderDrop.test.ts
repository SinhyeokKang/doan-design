import { expect, test } from "vitest";
import { dropFolder } from "./folderDrop";

const folder = (path = "/w/a") => ({ isDirectory: true, path });
const file = (path = "/w/a.txt") => ({ isDirectory: false, path });
const ONE = { kind: "notice", text: "Drop one folder at a time." };
const ONLY = { kind: "notice", text: "Only folders can be added." };

test("one folder is taken as Choose folder would", () => {
  expect(dropFolder([folder()])).toEqual({ kind: "folder", index: 0 });
});

test("a file, an empty drop and an item without a path are refused as not folders", () => {
  expect(dropFolder([file()])).toEqual(ONLY);
  expect(dropFolder([])).toEqual(ONLY);
  expect(dropFolder([folder("")])).toEqual(ONLY);
});

test("several items are refused, whatever they are", () => {
  expect(dropFolder([folder("/w/a"), folder("/w/b")])).toEqual(ONE);
  expect(dropFolder([folder(), file()])).toEqual(ONE);
});
