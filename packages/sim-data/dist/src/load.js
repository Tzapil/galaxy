import Ajv2020, {} from "ajv/dist/2020.js";
const schemaKeys = [
    "resources",
    "recipes",
    "buildings",
    "techs",
    "hulls",
    "modules",
    "doctrines",
    "startPackage"
];
export class GameDataValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "GameDataValidationError";
    }
}
export function validateGameDataSchemas(data, schemas) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    for (const key of schemaKeys) {
        const validate = ajv.compile(schemaFor(key, schemas));
        const ok = validate(dataFor(key, data));
        if (!ok) {
            throw new GameDataValidationError(formatAjvErrors(key, validate.errors ?? []));
        }
    }
}
export function load(data, schemas) {
    validateGameDataSchemas(data, schemas);
    const RES = indexById("resource", data.resources.resources);
    const buildingById = indexById("building", data.buildings.buildings);
    const recipeById = indexById("batch recipe", data.recipes.batchRecipes);
    const continuousById = indexById("continuous process", data.recipes.continuous);
    const moduleById = indexById("module", data.modules.modules);
    const hullById = indexById("hull", data.hulls.hulls);
    const doctrineById = indexById("doctrine", data.doctrines.doctrines);
    const techById = indexById("tech", data.techs.techs);
    const producedByMutable = new Map();
    for (const recipe of data.recipes.batchRecipes) {
        assertKnownBuilding(recipe.id, recipe.building, buildingById);
        for (const id of resourceIdsFromBag(recipe.inputs))
            assertKnownResource(recipe.id, id, RES);
        for (const id of resourceIdsFromBag(recipe.outputs)) {
            assertKnownResource(recipe.id, id, RES);
            const list = producedByMutable.get(id);
            if (list === undefined) {
                producedByMutable.set(id, [recipe]);
            }
            else {
                list.push(recipe);
            }
        }
    }
    for (const building of data.buildings.buildings) {
        if (building.recipe !== null &&
            !recipeById.has(building.recipe) &&
            !continuousById.has(building.recipe)) {
            throw new GameDataValidationError(`Building ${building.id}: recipe "${building.recipe}" does not exist.`);
        }
    }
    for (const cont of data.recipes.continuous) {
        for (const value of Object.values(cont)) {
            if (isQuantityBag(value)) {
                for (const id of resourceIdsFromBag(value))
                    assertKnownResource(cont.id, id, RES);
            }
        }
    }
    for (const sink of data.recipes.sinks) {
        if (Array.isArray(sink.consumes)) {
            for (const id of sink.consumes)
                assertKnownResource(sink.id, id, RES);
        }
        for (const value of Object.values(sink)) {
            if (isQuantityBag(value)) {
                for (const id of resourceIdsFromBag(value))
                    assertKnownResource(sink.id, id, RES);
            }
        }
    }
    for (const hull of data.hulls.hulls) {
        for (const id of resourceIdsFromBag(hull.buildRecipe))
            assertKnownResource(hull.id, id, RES);
    }
    for (const mod of data.modules.modules) {
        for (const id of resourceIdsFromBag(mod.cost))
            assertKnownResource(mod.id, id, RES);
        assertKnownTech(mod.id, String(mod.tech), techById);
    }
    for (const doctrine of data.doctrines.doctrines) {
        for (const hullId of doctrine.hulls) {
            if (!hullById.has(hullId)) {
                throw new GameDataValidationError(`Doctrine ${doctrine.id}: hull "${hullId}" does not exist.`);
            }
        }
        doctrineById.get(doctrine.id);
    }
    for (const tech of data.techs.techs) {
        for (const effect of techEffects(tech)) {
            validateTechEffect(tech.id, effect, moduleById, hullById, buildingById);
        }
    }
    for (const startBuilding of data.startPackage.buildings) {
        assertKnownBuilding("start-package", startBuilding.id, buildingById);
    }
    for (const [id, value] of Object.entries(data.startPackage.stockpiles)) {
        if (typeof value === "number")
            assertKnownResource("start-package", id, RES);
    }
    for (const ship of data.startPackage.ships) {
        if (!hullById.has(ship.hull)) {
            throw new GameDataValidationError(`Start package: hull "${ship.hull}" does not exist.`);
        }
        if (!doctrineById.has(ship.doctrine)) {
            throw new GameDataValidationError(`Start package: doctrine "${ship.doctrine}" does not exist.`);
        }
    }
    for (const id of data.startPackage.technologies)
        assertKnownTech("start-package", id, techById);
    const producedBy = new Map();
    for (const [id, recipes] of producedByMutable)
        producedBy.set(id, recipes);
    return {
        data,
        RES,
        BATCH: data.recipes.batchRecipes,
        CONT: data.recipes.continuous,
        SINKS: data.recipes.sinks,
        BUILDINGS: data.buildings.buildings,
        producedBy
    };
}
function schemaFor(key, schemas) {
    return schemas[key];
}
function dataFor(key, data) {
    return data[key];
}
function formatAjvErrors(key, errors) {
    const details = errors
        .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
        .join("; ");
    return `${key}.json failed schema validation: ${details}`;
}
function indexById(label, items) {
    const map = new Map();
    for (const item of items) {
        if (map.has(item.id))
            throw new GameDataValidationError(`Duplicate ${label} id "${item.id}".`);
        map.set(item.id, item);
    }
    return map;
}
function assertKnownResource(owner, id, resources) {
    if (!resources.has(id))
        throw new GameDataValidationError(`${owner}: resource "${id}" does not exist.`);
}
function assertKnownBuilding(owner, id, buildings) {
    if (!buildings.has(id))
        throw new GameDataValidationError(`${owner}: building "${id}" does not exist.`);
}
function assertKnownTech(owner, id, techs) {
    if (!techs.has(id))
        throw new GameDataValidationError(`${owner}: tech "${id}" does not exist.`);
}
function validateTechEffect(owner, effect, modules, hulls, buildings) {
    if (effect.type === "unlockModule" && (effect.id === undefined || !modules.has(effect.id))) {
        throw new GameDataValidationError(`${owner}: unlockModule "${effect.id ?? ""}" does not exist.`);
    }
    if (effect.type === "unlockHull" && (effect.id === undefined || !hulls.has(effect.id))) {
        throw new GameDataValidationError(`${owner}: unlockHull "${effect.id ?? ""}" does not exist.`);
    }
    if (effect.type === "unlockBuilding" && (effect.id === undefined || !buildings.has(effect.id))) {
        throw new GameDataValidationError(`${owner}: unlockBuilding "${effect.id ?? ""}" does not exist.`);
    }
}
function techEffects(tech) {
    const values = Array.isArray(tech.effects)
        ? tech.effects
        : Array.isArray(tech.effectPerLevel)
            ? tech.effectPerLevel
            : [];
    const effects = [];
    for (const value of values) {
        if (typeof value !== "object" || value === null || !("type" in value))
            continue;
        const type = typeof value.type === "string" ? value.type : "";
        const id = "id" in value && typeof value.id === "string" ? value.id : undefined;
        if (id === undefined) {
            effects.push({ type });
        }
        else {
            effects.push({ type, id });
        }
    }
    return effects;
}
function resourceIdsFromBag(bag) {
    return Object.keys(bag);
}
function isQuantityBag(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    for (const item of Object.values(value)) {
        if (typeof item !== "number")
            return false;
    }
    return true;
}
//# sourceMappingURL=load.js.map