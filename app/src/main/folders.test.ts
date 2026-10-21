import { describe, expect, test } from "vitest";
import { add, load, remove } from "./folders";

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
