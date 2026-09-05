export function compactJournalEntries(entries, snapshotTick) {
    const compacted = [];
    for (const entry of entries) {
        if (entry.tick >= snapshotTick || entry.milestone)
            compacted.push(entry);
    }
    return compacted;
}
//# sourceMappingURL=port.js.map