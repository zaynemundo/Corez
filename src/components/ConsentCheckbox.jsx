import { AlertCircle } from "lucide-react";

// Reusable consent checkbox for any form that collects personal data or creates
// an account. Required consent is never pre-ticked (a pre-ticked box is not
// valid consent), and the error is announced rather than just coloured.
//
// Links inside the label are safe: per the HTML spec a label does not forward
// activation from interactive content such as an anchor, so clicking "Terms"
// does not toggle the box in any current browser.

export default function ConsentCheckbox({
  id,
  checked,
  onChange,
  required = false,
  error = "",
  children,
  hint = "",
  testId,
}) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`consent-field${error ? " has-error" : ""}`}>
      <label className="consent-field-label" htmlFor={id}>
        <input
          id={id}
          name={id}
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(event) => onChange(event.target.checked)}
          aria-required={required || undefined}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          data-testid={testId}
        />
        <span className="consent-field-text">{children}</span>
      </label>
      {hint && (
        <p className="consent-field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="consent-field-error" id={errorId} role="alert">
          <AlertCircle size={13} strokeWidth={1.75} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
