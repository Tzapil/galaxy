import { EventKind } from "../events/kinds.js";
import { EventBatch, EventQueue } from "../events/queue.js";
import { InstrumentSubsystem, type Instrumentation } from "../instrument.js";
import { Rng } from "../rng.js";
import { readStateSnapshot } from "../snapshot/read.js";
import { hashState } from "../snapshot/hash.js";
import { writeStateSnapshot } from "../snapshot/write.js";
import type { SnapshotState } from "../snapshot/types.js";
import { SoAArena } from "../soa/arena.js";

export interface StageZeroRunReport {
  readonly ticks: number;
  readonly finalHash: string;
  readonly intermediateHashes: readonly HashCheckpoint[];
  readonly counters: {
    readonly systems: number;
    readonly factions: number;
    readonly ships: number;
    readonly buildings: number;
  };
}

export interface HashCheckpoint {
  readonly tick: number;
  readonly hash: string;
}

type StageZeroColumn = "mass" | "signal" | "owner";

export class StageZeroSimulation {
  private readonly eventBatch = new EventBatch(1024);

  private constructor(
    private readonly rootRng: Rng,
    private readonly eventRng: Rng,
    private readonly queue: EventQueue,
    private readonly probes: SoAArena<StageZeroColumn>,
    public tick: number
  ) {}

  public static create(seed: number): StageZeroSimulation {
    const rootRng = Rng.fromSeed(seed);
    const eventRng = rootRng.derive("stage-zero-events");
    const queue = new EventQueue(1024);
    const probes = new SoAArena<StageZeroColumn>(
      "stage_zero_probes",
      [
        { name: "mass", kind: "f64" },
        { name: "signal", kind: "u32" },
        { name: "owner", kind: "u16" }
      ],
      32
    );

    const mass = probes.column("mass") as Float64Array;
    const signal = probes.column("signal") as Uint32Array;
    const owner = probes.column("owner") as Uint16Array;
    for (let i = 0; i < 32; i += 1) {
      const row = probes.addRow();
      mass[row] = 100 + rootRng.nextInt(0, 10_000) / 100;
      signal[row] = rootRng.nextU32();
      owner[row] = rootRng.nextInt(0, 4);
    }

    for (let i = 0; i < 512; i += 1) {
      queue.schedule(eventRng.nextInt(1, 100_000), EventKind.BatchComplete, i % probes.length);
    }

    return new StageZeroSimulation(rootRng, eventRng, queue, probes, 0);
  }

  public static fromSnapshot(buffer: ArrayBuffer): StageZeroSimulation {
    const restored = readStateSnapshot(buffer);
    const root = restored.rngStreams.find((stream) => stream.name === "root");
    const events = restored.rngStreams.find((stream) => stream.name === "events");
    const probes = restored.arenas.find((arena) => arena.name === "stage_zero_probes");
    if (root === undefined || events === undefined || probes === undefined) {
      throw new Error("Stage zero snapshot is missing required streams or arenas.");
    }
    return new StageZeroSimulation(
      Rng.deserialize(root.state),
      Rng.deserialize(events.state),
      EventQueue.deserialize(restored.eventQueueBuffer),
      SoAArena.fromSnapshot(probes) as SoAArena<StageZeroColumn>,
      restored.tick
    );
  }

  public step(instrumentation?: Instrumentation): void {
    const totalStart = instrumentation?.begin(InstrumentSubsystem.Total) ?? 0;
    const continuousStart = instrumentation?.begin(InstrumentSubsystem.Continuous) ?? 0;
    this.applyContinuousTick();
    instrumentation?.end(InstrumentSubsystem.Continuous, continuousStart);

    const eventStart = instrumentation?.begin(InstrumentSubsystem.Events) ?? 0;
    const drained = this.queue.drainUntil(this.tick, this.eventBatch);
    this.applyEvents(drained);
    instrumentation?.end(InstrumentSubsystem.Events, eventStart);

    this.tick += 1;
    if (instrumentation?.enabled === true) {
      instrumentation.setEntityCounters({
        systems: 0,
        factions: 0,
        ships: 0,
        buildings: this.probes.length
      });
      const totalMs = instrumentation.end(InstrumentSubsystem.Total, totalStart);
      instrumentation.recordTick(totalMs);
    }
  }

  public run(
    ticks: number,
    checkpointEvery = 10_000,
    instrumentation?: Instrumentation
  ): StageZeroRunReport {
    const checkpoints: HashCheckpoint[] = [];
    const targetTick = this.tick + ticks;
    while (this.tick < targetTick) {
      this.step(instrumentation);
      if (checkpointEvery > 0 && this.tick % checkpointEvery === 0) {
        checkpoints.push({ tick: this.tick, hash: this.hash() });
      }
    }
    return {
      ticks,
      finalHash: this.hash(),
      intermediateHashes: checkpoints,
      counters: { systems: 0, factions: 0, ships: 0, buildings: this.probes.length }
    };
  }

  public snapshot(): ArrayBuffer {
    return writeStateSnapshot(this.snapshotState());
  }

  public hash(): string {
    return hashState(this.snapshotState());
  }

  public snapshotState(): SnapshotState {
    return {
      tick: this.tick,
      rngStreams: [
        { name: "root", state: this.rootRng.serialize() },
        { name: "events", state: this.eventRng.serialize() }
      ],
      eventQueue: this.queue,
      arenas: [this.probes.snapshot()]
    };
  }

  private applyContinuousTick(): void {
    const mass = this.probes.column("mass") as Float64Array;
    const signal = this.probes.column("signal") as Uint32Array;
    const owner = this.probes.column("owner") as Uint16Array;
    for (let i = 0; i < this.probes.length; i += 1) {
      const wave = ((signal[i] ?? 0) & 7) + 1;
      mass[i] = (mass[i] ?? 0) + wave * 0.001;
      signal[i] =
        (Math.imul(signal[i] ?? 0, 1664525) + 1013904223 + (owner[i] ?? 0) + this.tick) >>> 0;
    }
  }

  private applyEvents(count: number): void {
    const mass = this.probes.column("mass") as Float64Array;
    const signal = this.probes.column("signal") as Uint32Array;
    for (let i = 0; i < count; i += 1) {
      const row = (this.eventBatch.payloadIndices[i] ?? 0) % this.probes.length;
      mass[row] = (mass[row] ?? 0) + (this.eventBatch.kinds[i] ?? 0) * 0.25;
      signal[row] = ((signal[row] ?? 0) ^ (this.eventBatch.sequenceIds[i] ?? 0)) >>> 0;
    }
  }
}
