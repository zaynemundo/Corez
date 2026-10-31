import { useState } from "react";

function handleFor(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

function clonePersonas(personas) {
  return personas.map((persona) => ({ ...persona }));
}

export default function ConversationSetupModal({
  personas,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(() => clonePersonas(personas));
  const [error, setError] = useState("");

  const update = (index, field, value) => {
    setDraft((prev) =>
      prev.map((persona, personaIndex) => {
        if (personaIndex !== index) return persona;
        if (field === "name") {
          return { ...persona, name: value, handle: handleFor(value) };
        }
        return { ...persona, [field]: value };
      }),
    );
    setError("");
  };

  const save = () => {
    const next = draft.map((persona, index) => ({
      ...persona,
      id: persona.id || `p${index + 1}`,
      name: String(persona.name || "").trim(),
      handle: handleFor(persona.handle || persona.name),
    }));
    if (next.some((persona) => !persona.name || !persona.handle)) {
      setError("Both personas need a name.");
      return;
    }
    if (next[0].handle === next[1].handle) {
      setError("Persona handles must be different.");
      return;
    }
    onSave(next);
  };

  return (
    <div
      className="conversation-setup-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="conversation-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-setup-title"
      >
        <div className="conversation-setup-head">
          <div>
            <p className="conversation-setup-kicker">New Conversation</p>
            <h2 id="conversation-setup-title">Who’s joining?</h2>
          </div>
          <button
            type="button"
            className="conversation-setup-close"
            onClick={onClose}
            aria-label="Close persona editor"
          >
            ✕
          </button>
        </div>
        <p className="conversation-setup-copy">
          Rename the two AIs and give each one a voice. Mentions use the
          generated handle.
        </p>

        <div className="conversation-persona-grid">
          {draft.map((persona, index) => (
            <div className="conversation-persona-card" key={persona.id || index}>
              <div className="conversation-persona-card-head">
                <span className="conversation-persona-dot" aria-hidden="true" />
                <span>
                  {fieldLabel(index)} · @{persona.handle || "handle"}
                </span>
              </div>
              <label className="conversation-field">
                <span>Name</span>
                <input
                  value={persona.name}
                  maxLength={40}
                  onChange={(event) => update(index, "name", event.target.value)}
                  placeholder={index === 0 ? "John" : "Scarlett"}
                />
              </label>
              <label className="conversation-field">
                <span>Personality</span>
                <textarea
                  value={persona.instructions || ""}
                  maxLength={1200}
                  rows={4}
                  onChange={(event) =>
                    update(index, "instructions", event.target.value)
                  }
                  placeholder="Warm, curious, a little playful…"
                />
              </label>
            </div>
          ))}
        </div>

        {error ? (
          <p className="conversation-setup-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="conversation-setup-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="button" className="btn btn--solid" onClick={save}>
            Save personas
          </button>
        </div>
      </div>
    </div>
  );
}

function fieldLabel(index) {
  return index === 0 ? "First AI" : "Second AI";
}
