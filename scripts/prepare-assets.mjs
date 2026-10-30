import {
  copyFileSync,
  mkdirSync,
  cpSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "public/pdf.worker.min.mjs",
);
for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  cpSync(
    `node_modules/pdfjs-dist/${directory}`,
    `public/pdf-assets/${directory}`,
    { recursive: true },
  );
}
cpSync("node_modules/pdfjs-dist/web/images", "public/pdf-assets/images", {
  recursive: true,
});
// PDF.js also ships generic .sidebar/.toolbar rules. Confine every viewer rule
// and variable to the reader instead of changing the surrounding application.
const viewerStyles = readFileSync(
  "node_modules/pdfjs-dist/web/pdf_viewer.css",
  "utf8",
)
  .replaceAll(":root", ":scope")
  .replace(/url\((["']?)images\//g, "url($1/pdf-assets/images/");
writeFileSync(
  "src/components/pdf-viewer-styles.css",
  `@scope (.pdf-reader) {\n${viewerStyles}\n}\n`,
);
