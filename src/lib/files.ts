import { unzipSync, strFromU8 } from "fflate";
import { blobToBase64 } from "./images";

export const FILE_ACCEPT = ".pdf,.docx,.txt,.md,.rtf,.html,.htm,application/pdf,text/*,image/*";
const MAX_PDF = 10 * 1024 * 1024;

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const tidy = (s: string) => s.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();

function docxText(buf: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("not a docx");
  return tidy(decode(strFromU8(xml).replace(/<w:tab\/>/g, " ").replace(/<w:br[^>]*\/>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")));
}
const htmlText = (h: string) => tidy(decode(h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")));
const rtfText = (r: string) => tidy(r.replace(/\\par[d]?/g, "\n").replace(/\{\\\*[^{}]*\}/g, "").replace(/\\'[0-9a-f]{2}/gi, "").replace(/\\[a-z]+-?\d* ?/gi, "").replace(/[{}]/g, ""));

export type FileRead = { kind: "image" } | { kind: "pdf"; data: string } | { kind: "text"; text: string } | { kind: "error"; error: string };

/** Turns a recipe file into something the reader can take. */
export async function readRecipeFile(f: File): Promise<FileRead> {
  const name = f.name.toLowerCase();
  if (f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|gif)$/.test(name)) return { kind: "image" };
  try {
    if (f.type === "application/pdf" || name.endsWith(".pdf")) {
      if (f.size > MAX_PDF) return { kind: "error", error: "That PDF is over 10 MB. Try a smaller file, or photos of the pages." };
      return { kind: "pdf", data: await blobToBase64(f) };
    }
    if (name.endsWith(".docx")) return { kind: "text", text: docxText(await f.arrayBuffer()) };
    if (name.endsWith(".doc")) return { kind: "error", error: "Older Word files (.doc) can't be read. Save it as a PDF or .docx and try again." };
    if (name.endsWith(".pages")) return { kind: "error", error: "Pages files can't be read. In Pages, use File > Export To > PDF, then import that." };
    const raw = await f.text();
    if (name.endsWith(".rtf")) return { kind: "text", text: rtfText(raw) };
    if (/\.html?$/.test(name) || f.type === "text/html") return { kind: "text", text: htmlText(raw) };
    if (f.type.startsWith("text/") || /\.(txt|md)$/.test(name)) return { kind: "text", text: tidy(raw) };
  } catch {
    return { kind: "error", error: "That file couldn't be opened." };
  }
  return { kind: "error", error: "That kind of file can't be read. Try a PDF, Word (.docx), text file, or photo." };
}
