import { readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileFromFile } from "json-schema-to-typescript";

const schemaDir = resolve("schema");
const outputPath = resolve("src/generated/schema-types.ts");
const files = (await readdir(schemaDir)).filter((file) => file.endsWith(".schema.json")).sort();

let output = "/* eslint-disable */\n";
output += "/** This file is generated from packages/sim-data/schema/*.schema.json. */\n\n";

for (const file of files) {
  const generated = await compileFromFile(resolve(schemaDir, file), {
    bannerComment: "",
    additionalProperties: true,
    style: {
      printWidth: 100,
      semi: true,
      singleQuote: false,
      trailingComma: "none"
    }
  });
  const prefix = namespaceFromFile(file);
  output += renameLocalHelpers(generated.trim(), prefix);
  output += "\n\n";
}

await writeFile(outputPath, output, "utf8");

function namespaceFromFile(file) {
  return file
    .replace(/\.schema\.json$/u, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function renameLocalHelpers(text, prefix) {
  let renamed = text;
  for (const helper of ["QuantityBag", "Slots", "DataCost", "Effect"]) {
    renamed = renamed.replace(new RegExp(`\\b${helper}\\b`, "gu"), `${prefix}${helper}`);
  }
  return renamed;
}
