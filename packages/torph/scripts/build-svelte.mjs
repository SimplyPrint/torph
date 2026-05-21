import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distSvelte = resolve(root, "dist/svelte");

// Read the package's own name from package.json so the dist .svelte file
// self-imports against the published name (whatever the fork is called).
const pkgName = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8")
).name;

mkdirSync(distSvelte, { recursive: true });

// Copy .svelte source to dist, rewriting relative imports to the package
// name so consumers resolve them via the regular package entry.
let svelte = readFileSync(resolve(root, "src/svelte/TextMorph.svelte"), "utf8");
svelte = svelte
  .replace(`from '../lib/text-morph'`, `from '${pkgName}'`)
  .replace(`from '../lib/text-morph/controller'`, `from '${pkgName}'`);
writeFileSync(resolve(distSvelte, "TextMorph.svelte"), svelte);

// Create JS entry files that re-export from the .svelte file
const entry = `export { default as TextMorph } from "./TextMorph.svelte";\n`;
writeFileSync(resolve(distSvelte, "index.mjs"), entry);
writeFileSync(resolve(distSvelte, "index.js"), entry);

// tsup emits .d.ts/.d.mts for the svelte index but only the prop-type
// re-export survives (it can't see through the .svelte default export).
// Append a class declaration so consumers' TypeScript can resolve
// `import { TextMorph } from "<pkg>/svelte"`.
const componentDecl =
  '\nimport { SvelteComponent } from "svelte";\n' +
  "declare class TextMorph extends SvelteComponent<TextMorphProps> {}\n" +
  "export { TextMorph };\n";

for (const file of ["index.d.ts", "index.d.mts"]) {
  const path = resolve(distSvelte, file);
  try {
    const existing = readFileSync(path, "utf8");
    if (!existing.includes("declare class TextMorph")) {
      writeFileSync(path, existing + componentDecl);
    }
  } catch {
    // tsup didn't emit this declaration file — skip rather than fail the
    // build. The runtime export still works via the .mjs/.js entry.
  }
}
