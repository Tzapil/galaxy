/** This file is generated from packages/sim-data/schema/*.schema.json. */
export interface BuildingsFile {
    $schema?: string;
    version: string;
    notes?: string[];
    buildings: {
        id: string;
        name: string;
        recipe: string | null;
        slots: number;
        placement: {
            /**
             * @minItems 1
             */
            on: [string, ...string[]];
            requires?: string | string[];
            [k: string]: unknown;
        };
        buildCost: BuildingsQuantityBag;
        buildDays: number;
        tech?: string;
        comment?: string;
        [k: string]: unknown;
    }[];
    [k: string]: unknown;
}
export interface BuildingsQuantityBag {
    [k: string]: number;
}
export interface DoctrinesFile {
    $schema?: string;
    version: string;
    notes?: string[];
    scoring: {
        [k: string]: unknown;
    };
    doctrines: {
        id: string;
        name: string;
        role: "warship" | "civilian" | "support";
        /**
         * @minItems 1
         */
        hulls: [string, ...string[]];
        preferredBand: "long" | "medium" | "short";
        weights: {
            [k: string]: number;
        };
        require: {
            [k: string]: number;
        };
        withdrawAt: number;
        pursueAbove: number;
        [k: string]: unknown;
    }[];
    factionPersonalities: {
        [k: string]: {
            [k: string]: number;
        } | string;
    };
    [k: string]: unknown;
}
export interface HullsFile {
    $schema?: string;
    version: string;
    notes?: string[];
    slotTypes: ("weapon" | "defense" | "propulsion" | "utility")[];
    hulls: {
        id: string;
        name: string;
        tier: number;
        class: "civilian" | "warship" | "support";
        phase: number;
        slots: HullsSlots;
        baseMass: number;
        structure: number;
        crewCapacity: number;
        baseFuel: number;
        buildRecipe: HullsQuantityBag;
        buildDays: number;
        tech: string;
        [k: string]: unknown;
    }[];
    [k: string]: unknown;
}
export interface HullsSlots {
    weapon: number;
    defense: number;
    propulsion: number;
    utility: number;
}
export interface HullsQuantityBag {
    [k: string]: number;
}
export interface ModulesFile {
    $schema?: string;
    version: string;
    tierCurve?: {
        [k: string]: unknown;
    };
    notes?: string[];
    modules: {
        id: string;
        name: string;
        family: string;
        slot: "weapon" | "defense" | "propulsion" | "utility";
        tier: number;
        phase: number;
        powerDraw: number;
        mass: number;
        crew: number;
        cost: ModulesQuantityBag;
        tech: string;
        bands?: ("long" | "medium" | "short")[];
        damage?: number;
        vsShield?: number;
        vsArmor?: number;
        interceptable?: boolean;
        [k: string]: unknown;
    }[];
    [k: string]: unknown;
}
export interface ModulesQuantityBag {
    [k: string]: number;
}
export interface RecipesFile {
    $schema?: string;
    version: string;
    changelog?: string[];
    notes?: string[];
    batchRecipes: {
        id: string;
        tier: number;
        building: string;
        inputs: RecipesQuantityBag;
        outputs: RecipesQuantityBag;
        durationDays: number;
        workers: number;
        comment?: string;
        [k: string]: unknown;
    }[];
    continuous: {
        id: string;
        kind: string;
        building?: string;
        outputsPerDay?: RecipesQuantityBag;
        inputsPerDay?: RecipesQuantityBag;
        perThousandPopPerDay?: RecipesQuantityBag;
        comfortOnly?: string[];
        [k: string]: unknown;
    }[];
    sinks: {
        id: string;
        kind?: string;
        consumes: string[];
        inputs?: RecipesQuantityBag;
        [k: string]: unknown;
    }[];
    strategicChokepoints?: {
        [k: string]: unknown;
    }[];
    [k: string]: unknown;
}
export interface RecipesQuantityBag {
    [k: string]: number;
}
export interface ResourcesFile {
    $schema?: string;
    version: string;
    notes?: string[];
    resources: {
        id: string;
        name: string;
        tier: number;
        category: "utility" | "raw" | "refined" | "component" | "system" | "final" | "consumer" | "data";
        phase: number;
        transportable: boolean;
        unitVolume: number;
        storageDefault: number;
        rarity?: "common" | "rare" | "veryrare";
        deposit?: string;
        comment?: string;
        [k: string]: unknown;
    }[];
    [k: string]: unknown;
}
export interface StartPackageFile {
    $schema?: string;
    version: string;
    notes?: string[];
    homeSystem: {
        bodies: {
            id: string;
            name: string;
            type: string;
            slots: number;
            features: string[];
            [k: string]: unknown;
        }[];
        [k: string]: unknown;
    };
    population: {
        start: number;
        employmentRate: number;
        [k: string]: unknown;
    };
    treasury: {
        credits: number;
        [k: string]: unknown;
    };
    buildings: {
        id: string;
        body: string;
        [k: string]: unknown;
    }[];
    stockpiles: {
        comment?: string;
        [k: string]: number | string | undefined;
    };
    ships: {
        hull: string;
        doctrine: string;
        count: number;
        [k: string]: unknown;
    }[];
    technologies: string[];
    successCriteria: {
        [k: string]: unknown;
    };
    [k: string]: unknown;
}
export interface TechsFile {
    $schema?: string;
    version: string;
    notes?: string[];
    branches: {
        id: string;
        name: string;
        primaryData: "physics" | "engineering" | "bio" | "mixed";
        [k: string]: unknown;
    }[];
    costModel?: {
        [k: string]: unknown;
    };
    techs: ({
        [k: string]: unknown;
    } & {
        id: string;
        name: string;
        branch: string;
        tier: number;
        phase: number;
        requires: string[];
        cost?: TechsDataCost;
        effects?: TechsEffect[];
        effectPerLevel?: TechsEffect[];
        repeatable?: boolean;
        baseCost?: TechsDataCost;
        costGrowth?: number;
        [k: string]: unknown;
    })[];
    [k: string]: unknown;
}
export interface TechsDataCost {
    physics?: number;
    engineering?: number;
    bio?: number;
}
export interface TechsEffect {
    type: "unlockModule" | "unlockHull" | "unlockBuilding" | "modifier" | "ability";
    id?: string;
    target?: string;
    stat?: string;
    value?: number;
    [k: string]: unknown;
}
//# sourceMappingURL=schema-types.d.ts.map