import { describe, it, expect } from "vitest";
import { parseIngLine, fmtQty, buildList, type Recipe } from "./recipes";

describe("ingredients", () => {
  it("parses common lines", () => {
    expect(parseIngLine("2 cups flour, sifted")).toMatchObject({ qty: 2, unit: "cup", item: "flour", note: "sifted", aisle: "Baking" });
    expect(parseIngLine("1 1/2 tsp baking soda")).toMatchObject({ qty: 1.5, unit: "tsp", item: "baking soda" });
    expect(parseIngLine("½ cup butter")).toMatchObject({ qty: 0.5, unit: "cup", item: "butter", aisle: "Dairy & eggs" });
    expect(parseIngLine("3 eggs")).toMatchObject({ qty: 3, unit: "", item: "eggs" });
    expect(parseIngLine("salt to taste")).toMatchObject({ qty: null, unit: "", item: "salt to taste" });
  });
  it("formats fractions", () => {
    expect(fmtQty(1.5)).toBe("1 ½");
    expect(fmtQty(0.333)).toBe("⅓");
    expect(fmtQty(3)).toBe("3");
  });
});

describe("shopping list", () => {
  const r = (id: string, servings: number, ings: [number, string, string][]): Recipe => ({
    id, owner_id: "u", title: id, category: "Main dish", tags: [], servings, prep_time: "", cook_time: "",
    ingredients: ings.map(([qty, unit, item]) => ({ qty, unit, item, note: "", aisle: "Other" })),
    steps: [], notes: "", source: "", photo_paths: [], copied_from: null,
  });
  it("merges and scales", () => {
    const a = r("A", 4, [[2, "cup", "flour"], [2, "", "eggs"]]);
    const b = r("B", 2, [[1, "cup", "flour"], [1, "", "egg"]]);
    const list = buildList(
      [{ id: "1", recipe_id: "A", day: "Monday", servings: 8 }, { id: "2", recipe_id: "B", day: "Tuesday", servings: 2 }],
      new Map([["A", a], ["B", b]]), []);
    expect(list.find((i) => i.name === "flour")?.qty).toBe(5);
    expect(list.find((i) => i.key.startsWith("egg"))?.qty).toBe(5);
  });
  it("keeps have flags and manual items", () => {
    const a = r("A", 4, [[2, "cup", "flour"]]);
    const first = buildList([{ id: "1", recipe_id: "A", day: "Monday", servings: 4 }], new Map([["A", a]]), []);
    first[0].have = true;
    const again = buildList([{ id: "1", recipe_id: "A", day: "Monday", servings: 4 }], new Map([["A", a]]),
      [...first, { key: "m1", name: "paper towels", unit: "", qty: null, aisle: "Other", from: [], have: false, got: false, manual: true }]);
    expect(again[0].have).toBe(true);
    expect(again.some((i) => i.name === "paper towels")).toBe(true);
  });
  it("shows metric weights as ounces and pounds", () => {
    const a = r("A", 4, [[250, "g", "ground beef"], [200, "g", "ground beef"], [100, "g", "cheddar"], [1, "kg", "potatoes"], [500, "ml", "chicken broth"], [5, "ml", "vanilla"]]);
    const list = buildList([{ id: "1", recipe_id: "A", day: "Monday", servings: 4 }], new Map([["A", a]]), []);
    const get = (n: string) => list.find((i) => i.name === n)!;
    expect([get("ground beef").qty, get("ground beef").unit]).toEqual([1, "lb"]);
    expect([get("cheddar").qty, get("cheddar").unit]).toEqual([4, "oz"]);
    expect([get("potatoes").qty, get("potatoes").unit]).toEqual([2.25, "lb"]);
    expect([get("chicken broth").qty, get("chicken broth").unit]).toEqual([17, "fl oz"]);
    expect([get("vanilla").qty, get("vanilla").unit]).toEqual([1.25, "tsp"]);
  });
  it("adds grams and ounces of the same thing together", () => {
    const a = r("A", 4, [[8, "oz", "cream cheese"]]);
    const b = r("B", 4, [[227, "g", "cream cheese"]]);
    const list = buildList([{ id: "1", recipe_id: "A", day: "Monday", servings: 4 }, { id: "2", recipe_id: "B", day: "Monday", servings: 4 }], new Map([["A", a], ["B", b]]), []);
    expect(list.filter((i) => i.name === "cream cheese").map((i) => [i.qty, i.unit])).toEqual([[1, "lb"]]);
  });
});
