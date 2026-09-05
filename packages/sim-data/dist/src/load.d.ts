import type { GameDataFiles, GameDataSchemas, LoadedGameData } from "./types.js";
export declare class GameDataValidationError extends Error {
    constructor(message: string);
}
export declare function validateGameDataSchemas(data: GameDataFiles, schemas: GameDataSchemas): void;
export declare function load(data: GameDataFiles, schemas: GameDataSchemas): LoadedGameData;
//# sourceMappingURL=load.d.ts.map