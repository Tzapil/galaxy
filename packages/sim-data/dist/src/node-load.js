import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "./load.js";
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
export async function loadFromDirectory(dataDir = resolve(packageRoot, "data"), schemaDir = resolve(packageRoot, "schema")) {
    const data = {
        resources: await readJson(resolve(dataDir, "resources.json")),
        recipes: await readJson(resolve(dataDir, "recipes.json")),
        buildings: await readJson(resolve(dataDir, "buildings.json")),
        techs: await readJson(resolve(dataDir, "techs.json")),
        hulls: await readJson(resolve(dataDir, "hulls.json")),
        modules: await readJson(resolve(dataDir, "modules.json")),
        doctrines: await readJson(resolve(dataDir, "doctrines.json")),
        startPackage: await readJson(resolve(dataDir, "start-package.json")),
        galaxyPresets: await readJson(resolve(dataDir, "galaxy-presets.json")),
        personalities: await readJson(resolve(dataDir, "personalities.json"))
    };
    const schemas = {
        resources: await readJson(resolve(schemaDir, "resources.schema.json")),
        recipes: await readJson(resolve(schemaDir, "recipes.schema.json")),
        buildings: await readJson(resolve(schemaDir, "buildings.schema.json")),
        techs: await readJson(resolve(schemaDir, "techs.schema.json")),
        hulls: await readJson(resolve(schemaDir, "hulls.schema.json")),
        modules: await readJson(resolve(schemaDir, "modules.schema.json")),
        doctrines: await readJson(resolve(schemaDir, "doctrines.schema.json")),
        startPackage: await readJson(resolve(schemaDir, "start-package.schema.json")),
        galaxyPresets: await readJson(resolve(schemaDir, "galaxy-presets.schema.json")),
        personalities: await readJson(resolve(schemaDir, "personalities.schema.json"))
    };
    return load(data, schemas);
}
async function readJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
}
//# sourceMappingURL=node-load.js.map