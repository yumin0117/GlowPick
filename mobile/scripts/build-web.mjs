// Bundle only public application assets. Never copy repository data or credentials.
import { mkdir, readFile, writeFile } from "node:fs/promises";
const source = new URL("../../BeautyAI/", import.meta.url);
const target = new URL("../www/", import.meta.url);
const names = ["index.html", "style.css", "script.js", "api-client.js", "ai-core.js", "ai-assets.js", "gemini-client.js", "report-model.js"];
await mkdir(target, { recursive: true });
for (const name of names) {
  let content = await readFile(new URL(name, source), "utf8");
  if (/AIza[\w-]{25,}|AQ\.[\w.-]{25,}|hf_[A-Za-z0-9]{25,}/u.test(content)) throw Error("Credential pattern found; build stopped");
  if (name === "index.html") content = content.replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, viewport-fit=cover');
  if (name === "style.css") content += `\n/* Android system bars and display cutouts. */\nbody{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}\n.site-header{top:env(safe-area-inset-top)}\n`;
  await writeFile(new URL(name, target), content);
}
console.log(`Bundled ${names.length} public web assets for Android; no API key included.`);
