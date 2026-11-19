import { describe, expect, it, vi } from "vitest";
vi.mock("./supabase", () => ({ supabase: {} }));
import { creditFor, myCopyOf } from "./copy";
import type { Recipe } from "./recipes";

const rec = (id: string, owner_id: string, copied_from: string | null = null) => ({ id, owner_id, copied_from } as Recipe);

describe("saving a friend's recipe", () => {
  it("finds only my own copy of the original", () => {
    const all = [rec("orig", "friend"), rec("theirCopy", "other", "orig"), rec("mine", "me", "orig")];
    expect(myCopyOf(all, "orig", "me")?.id).toBe("mine");
    expect(myCopyOf(all, "orig", "nobody")).toBeUndefined();
  });
  it("credits the friend when the recipe has no source", () => {
    expect(creditFor("", "Sam")).toBe("Sam");
    expect(creditFor("  ", "Sam")).toBe("Sam");
    expect(creditFor("Grandma's card", "Sam")).toBe("Grandma's card");
  });
});
