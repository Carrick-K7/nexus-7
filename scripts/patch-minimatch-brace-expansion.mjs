import fs from "node:fs";
import path from "node:path";

const target = path.resolve(
  process.cwd(),
  "node_modules/minimatch/minimatch.js",
);
const legacyImport = "var expand = require('brace-expansion')";
const compatibleImport = [
  "var braceExpansion = require('brace-expansion')",
  "var expand = typeof braceExpansion === 'function'",
  "  ? braceExpansion",
  "  : braceExpansion.expand",
].join("\n");

if (!fs.existsSync(target)) {
  throw new Error(`Expected minimatch compatibility target: ${target}`);
}

const source = fs.readFileSync(target, "utf8");
if (source.includes(compatibleImport)) {
  process.exit(0);
}
if (!source.includes(legacyImport)) {
  throw new Error(
    "minimatch compatibility patch no longer matches; review dependency update",
  );
}

fs.writeFileSync(
  target,
  source.replace(legacyImport, compatibleImport),
  "utf8",
);
console.log("Applied minimatch brace-expansion compatibility patch");
