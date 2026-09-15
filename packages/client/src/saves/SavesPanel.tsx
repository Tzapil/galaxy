import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";

import type { GameSaveRepository } from "../persist/repository.js";
import type { SaveMetadata } from "../persist/save-format.js";

export function SavesPanel({
  repository,
  revision,
  canSave = true,
  onSave,
  onLoad,
  onClose
}: {
  readonly repository: GameSaveRepository;
  readonly revision: number;
  readonly canSave?: boolean;
  readonly onSave: (id: string, name: string) => void;
  readonly onLoad: (id: string) => void;
  readonly onClose: () => void;
}): ReactElement {
  const [slots, setSlots] = useState<readonly SaveMetadata[]>([]);
  const [name, setName] = useState("Manual save");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void repository
      .list()
      .then(setSlots)
      .catch((cause: unknown) => setError(messageFor(cause)));
  }, [repository, revision]);

  function createSave(): void {
    onSave(`manual-${crypto.randomUUID()}`, name);
  }

  async function remove(id: string, slotName: string): Promise<void> {
    if (!window.confirm(`Delete save “${slotName}”?`)) return;
    await repository.delete(id);
    setSlots(await repository.list());
  }

  async function rename(slot: SaveMetadata): Promise<void> {
    const next = window.prompt("Save name", slot.name);
    if (next === null) return;
    await repository.rename(slot.id, next);
    setSlots(await repository.list());
  }

  async function exportSave(slot: SaveMetadata): Promise<void> {
    const buffer = await repository.export(slot.id);
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/octet-stream" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(slot.name)}.galaxy-save`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importSave(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    if (file === undefined) return;
    try {
      await repository.import(await file.arrayBuffer(), `import-${crypto.randomUUID()}`);
      setSlots(await repository.list());
      setError("");
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      event.currentTarget.value = "";
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal saves-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Save games"
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Full snapshots + milestone journal</span>
            <h2>Save archive</h2>
          </div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {error.length > 0 ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}
        <div className="save-create-row">
          {canSave ? (
            <>
              <input
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                aria-label="Save name"
              />
              <button type="button" className="primary" onClick={createSave}>
                Create full save
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import file
          </button>
          <input
            ref={fileInput}
            hidden
            type="file"
            accept=".galaxy-save"
            onChange={(event) => void importSave(event)}
          />
        </div>
        <div className="save-list">
          {slots.length === 0 ? (
            <div className="empty-state">No saves yet.</div>
          ) : (
            slots.map((slot) => (
              <article key={slot.id} className="save-slot">
                <div>
                  <strong>{slot.name}</strong>
                  <span>
                    {slot.automatic ? "Autosave" : "Manual"} · year {slot.gameYear.toLocaleString()}{" "}
                    · {formatBytes(slot.byteLength)}
                  </span>
                  <small>
                    {new Date(slot.updatedAt).toLocaleString()} · {slot.hash.slice(0, 12)}
                  </small>
                </div>
                <div className="button-row">
                  <button type="button" className="primary" onClick={() => onLoad(slot.id)}>
                    Load
                  </button>
                  <button type="button" onClick={() => void rename(slot)}>
                    Rename
                  </button>
                  <button type="button" onClick={() => void exportSave(slot)}>
                    Export
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void remove(slot.id, slot.name)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9а-яё_-]+/giu, "-").replace(/^-|-$/g, "") || "galaxy-save";
}

function messageFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Save operation failed.";
}
