import { describe, expect, test } from "vitest";
import { add, insertAt, load, remove, replaceAt } from "./folders";

describe("add", () => {
  test("appends a new path", () => {
    expect(add(["/a"], "/b")).toEqual(["/a", "/b"]);
    expect(add([], "/a")).toEqual(["/a"]);
  });

  test("ignores a path already in the list", () => {
    expect(add(["/a", "/b"], "/a")).toEqual(["/a", "/b"]);
  });

  test("does not change the input list", () => {
    const list = ["/a"];
    add(list, "/b");
    expect(list).toEqual(["/a"]);
  });
});

describe("remove", () => {
  test("drops the path", () => {
    expect(remove(["/a", "/b", "/c"], "/b")).toEqual(["/a", "/c"]);
  });

  test("leaves the list as is when the path is absent", () => {
    expect(remove(["/a"], "/b")).toEqual(["/a"]);
  });

  test("does not change the input list", () => {
    const list = ["/a", "/b"];
    remove(list, "/a");
    expect(list).toEqual(["/a", "/b"]);
  });
});

describe("load", () => {
  test("reads an array of paths", () => {
    expect(load('["/a","/b"]')).toEqual(["/a", "/b"]);
    expect(load("[]\n")).toEqual([]);
  });

  test("drops duplicates, keeping the first occurrence in order", () => {
    expect(load('["/a","/b","/a","/c","/b"]')).toEqual(["/a", "/b", "/c"]);
  });

  test("drops empty strings", () => {
    expect(load('["/a","","/b"]')).toEqual(["/a", "/b"]);
    expect(load('[""]')).toEqual([]);
  });

  test("broken JSON starts empty", () => {
    expect(load("")).toEqual([]);
    expect(load('["/a"')).toEqual([]);
    expect(load("not json")).toEqual([]);
  });

  test("a value that is not an array starts empty", () => {
    expect(load('{"folders":["/a"]}')).toEqual([]);
    expect(load('"/a"')).toEqual([]);
    expect(load("null")).toEqual([]);
  });

  test("an element that is not a string starts empty", () => {
    expect(load('["/a", 1]')).toEqual([]);
    expect(load('["/a", null]')).toEqual([]);
    expect(load('[["/a"]]')).toEqual([]);
  });
});

describe("insertAt", () => {
  test("puts the path back at its index", () => {
    expect(insertAt(["/a", "/c"], "/b", 1)).toEqual(["/a", "/b", "/c"]);
    expect(insertAt(["/a"], "/b", 0)).toEqual(["/b", "/a"]);
  });

  test("clamps an index outside the list", () => {
    expect(insertAt(["/a"], "/b", 9)).toEqual(["/a", "/b"]);
    expect(insertAt(["/a"], "/b", -3)).toEqual(["/b", "/a"]);
    expect(insertAt(["/a"], "/b", Number.NaN)).toEqual(["/b", "/a"]);
    expect(insertAt([], "/a", 2)).toEqual(["/a"]);
  });

  test("keeps a path that is already stored where it is", () => {
    expect(insertAt(["/a", "/b"], "/b", 0)).toEqual(["/a", "/b"]);
  });

  test("does not change the input list", () => {
    const list = ["/a"];
    insertAt(list, "/b", 0);
    expect(list).toEqual(["/a"]);
  });
});

describe("replaceAt", () => {
  test("swaps the path in place", () => {
    expect(replaceAt(["/a", "/old", "/c"], "/old", "/new")).toEqual(["/a", "/new", "/c"]);
  });

  test("only drops the old entry when the new path is stored elsewhere", () => {
    expect(replaceAt(["/old", "/b", "/new"], "/old", "/new")).toEqual(["/b", "/new"]);
  });

  test("leaves the list as is when the old path is absent or unchanged", () => {
    expect(replaceAt(["/a"], "/x", "/y")).toEqual(["/a"]);
    expect(replaceAt(["/a"], "/a", "/a")).toEqual(["/a"]);
  });

  test("does not change the input list", () => {
    const list = ["/a"];
    replaceAt(list, "/a", "/b");
    expect(list).toEqual(["/a"]);
  });
});
