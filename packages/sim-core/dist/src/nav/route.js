export class RoutePlanner {
    dist;
    jumps;
    previous;
    visited;
    constructor(initialCapacity = 32) {
        this.dist = new Float64Array(initialCapacity);
        this.jumps = new Uint16Array(initialCapacity);
        this.previous = new Int32Array(initialCapacity);
        this.visited = new Uint8Array(initialCapacity);
    }
    find(systems, gates, from, to) {
        this.ensureCapacity(systems.length);
        for (let i = 0; i < systems.length; i += 1) {
            this.dist[i] = Number.POSITIVE_INFINITY;
            this.jumps[i] = 0;
            this.previous[i] = -1;
            this.visited[i] = 0;
        }
        this.dist[from] = 0;
        for (let iteration = 0; iteration < systems.length; iteration += 1) {
            const current = this.nextUnvisited(systems.length);
            if (current < 0)
                break;
            if (current === to)
                break;
            this.visited[current] = 1;
            let gate = systems.firstGate[current] ?? -1;
            while (gate >= 0) {
                if (gates.blocked[gate] !== 1) {
                    const neighbor = gates.to[gate] ?? 0;
                    const nextCost = (this.dist[current] ?? 0) + (gates.travelTicks[gate] ?? 0);
                    const nextJumps = (this.jumps[current] ?? 0) + 1;
                    if (nextCost < (this.dist[neighbor] ?? Number.POSITIVE_INFINITY)) {
                        this.dist[neighbor] = nextCost;
                        this.jumps[neighbor] = nextJumps;
                        this.previous[neighbor] = current;
                    }
                }
                gate = gates.nextInSystem[gate] ?? -1;
            }
        }
        const travelTicks = this.dist[to] ?? Number.POSITIVE_INFINITY;
        if (!Number.isFinite(travelTicks)) {
            return { reachable: false, travelTicks: 0, jumps: 0, nextSystem: from };
        }
        return {
            reachable: true,
            travelTicks,
            jumps: this.jumps[to] ?? 0,
            nextSystem: this.nextHop(from, to)
        };
    }
    connectedComponentCount(systems, gates) {
        this.ensureCapacity(systems.length);
        for (let i = 0; i < systems.length; i += 1)
            this.visited[i] = 0;
        let components = 0;
        for (let start = 0; start < systems.length; start += 1) {
            if (this.visited[start] === 1)
                continue;
            components += 1;
            this.markComponent(systems, gates, start);
        }
        return components;
    }
    markComponent(systems, gates, start) {
        this.dist[0] = start;
        let read = 0;
        let write = 1;
        this.visited[start] = 1;
        while (read < write) {
            const system = this.dist[read] ?? 0;
            read += 1;
            let gate = systems.firstGate[system] ?? -1;
            while (gate >= 0) {
                const neighbor = gates.to[gate] ?? 0;
                if (this.visited[neighbor] !== 1) {
                    this.visited[neighbor] = 1;
                    this.dist[write] = neighbor;
                    write += 1;
                }
                gate = gates.nextInSystem[gate] ?? -1;
            }
        }
    }
    nextUnvisited(count) {
        let best = -1;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < count; i += 1) {
            if (this.visited[i] === 1)
                continue;
            const distance = this.dist[i] ?? Number.POSITIVE_INFINITY;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = i;
            }
        }
        return best;
    }
    nextHop(from, to) {
        let current = to;
        let previous = this.previous[current] ?? -1;
        while (previous >= 0 && previous !== from) {
            current = previous;
            previous = this.previous[current] ?? -1;
        }
        return previous === from ? current : to;
    }
    ensureCapacity(required) {
        if (required <= this.dist.length)
            return;
        let next = this.dist.length;
        while (next < required)
            next *= 2;
        this.dist = new Float64Array(next);
        this.jumps = new Uint16Array(next);
        this.previous = new Int32Array(next);
        this.visited = new Uint8Array(next);
    }
}
//# sourceMappingURL=route.js.map