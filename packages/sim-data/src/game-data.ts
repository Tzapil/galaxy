import buildings from "../data/buildings.json" with { type: "json" };
import doctrines from "../data/doctrines.json" with { type: "json" };
import galaxyPresets from "../data/galaxy-presets.json" with { type: "json" };
import hulls from "../data/hulls.json" with { type: "json" };
import modules from "../data/modules.json" with { type: "json" };
import personalities from "../data/personalities.json" with { type: "json" };
import recipes from "../data/recipes.json" with { type: "json" };
import resources from "../data/resources.json" with { type: "json" };
import startPackage from "../data/start-package.json" with { type: "json" };
import techs from "../data/techs.json" with { type: "json" };

import type { GameDataFiles } from "./types.js";

/** Static, browser-safe data bundle. Schema validation remains part of the build/CI gate. */
export const GAME_DATA = {
  resources,
  recipes,
  buildings,
  techs,
  hulls,
  modules,
  doctrines,
  startPackage,
  galaxyPresets,
  personalities
} as unknown as GameDataFiles;
