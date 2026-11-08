import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readRecipeFile } from "./files";

describe("readRecipeFile", () => {
  it("reads text from a Word file", async () => {
    const zip = zipSync({ "word/document.xml": strToU8("<w:document><w:body><w:p><w:r><w:t>Pancakes &amp; syrup</w:t></w:r></w:p><w:p><w:r><w:t>2 cups flour</w:t></w:r></w:p></w:body></w:document>") });
    const out = await readRecipeFile(new File([zip], "Pancakes.docx"));
    expect(out).toEqual({ kind: "text", text: "Pancakes & syrup\n2 cups flour" });
  });
  it("sends PDFs as they are and refuses old .doc files", async () => {
    expect((await readRecipeFile(new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" }))).kind).toBe("pdf");
    expect((await readRecipeFile(new File(["x"], "a.doc"))).kind).toBe("error");
    expect(await readRecipeFile(new File(["<p>Soup</p><p>1 onion</p>"], "a.html", { type: "text/html" }))).toEqual({ kind: "text", text: "Soup\n 1 onion" });
  });
});
