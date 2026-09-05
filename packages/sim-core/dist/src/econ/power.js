export function clampLocalEnergyBuffer(data, amount) {
    return Math.max(0, Math.min(data.storageDefault[data.energyResource] ?? 260, amount));
}
export function scorePowerSourcesForLogistics(data, distanceTicks) {
    const scores = [];
    for (let i = 0; i < data.powerProcessIndices.length; i += 1) {
        const processIndex = data.powerProcessIndices[i] ?? -1;
        const process = data.continuous[processIndex];
        if (process === undefined)
            continue;
        const output = outputEnergy(process.outputsPerTick, data.energyResource);
        if (output <= 0)
            continue;
        let inputCost = process.workers * 0.5;
        let logisticsVolume = 0;
        for (let j = 0; j < process.inputsPerTick.length; j += 1) {
            const input = process.inputsPerTick[j];
            if (input === undefined)
                throw new RangeError("Power source input is inconsistent.");
            inputCost += (data.baseValue[input.resource] ?? 0) * input.amount;
            logisticsVolume += (data.unitVolume[input.resource] ?? 0) * input.amount;
        }
        const logisticsVolumePer100Energy = (logisticsVolume / output) * 100;
        const unitCost = inputCost / output;
        scores.push({
            buildingId: process.buildingId,
            energyPerTick: output,
            logisticsVolumePer100Energy,
            unitCost,
            score: unitCost + logisticsVolumePer100Energy * Math.max(0, distanceTicks) * 0.003
        });
    }
    scores.sort((a, b) => a.score - b.score || a.buildingId.localeCompare(b.buildingId));
    return scores;
}
export function choosePowerSourceForRemoteBase(data, distanceTicks, minimumEnergyPerTick = 60) {
    const scores = scorePowerSourcesForLogistics(data, distanceTicks);
    for (let i = 0; i < scores.length; i += 1) {
        const score = scores[i];
        if (score !== undefined && score.energyPerTick >= minimumEnergyPerTick)
            return score.buildingId;
    }
    return scores[0]?.buildingId ?? "";
}
function outputEnergy(outputs, energy) {
    for (let i = 0; i < outputs.length; i += 1) {
        const output = outputs[i];
        if (output?.resource === energy)
            return output.amount;
    }
    return 0;
}
//# sourceMappingURL=power.js.map