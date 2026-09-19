import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Cookie, FileText, Printer, Scale, Wallet } from "lucide-react";
import {
  LEGAL_CONTACTS,
  LEGAL_DOCUMENTS,
  LEGAL_ORDER,
  LEGAL_UPDATED,
  getLegalDocument,
} from "../data/legalDocuments";
import { openConsentPreferences } from "../services/consentService";

// Public legal surface. One component renders any of the documents so the
// layout, "last updated" date, cross-links and contact block cannot drift
// between them.

const DOC_ICONS = {
  privacy: FileText,
  terms: Scale,
  cookies: Cookie,
  refunds: Wallet,
};

function safeHref(href) {
  const value = String(href || "").trim();
  if (value.startsWith("/") || value.startsWith("#")) return value;
  if (/^https:\/\//i.test(value)) return value;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return value;
  return "#";
}

/**
 * Render the tiny inline syntax used in legalDocuments.js:
 * [label](href) and **bold**. Nothing else is interpreted, and hrefs are
 * restricted to site paths, https and mailto — no HTML injection surface.
 * Internal links go through the router so reading a policy never reloads the
 * whole app.
 */
export function renderInline(text) {
  const source = String(text ?? "");
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(source.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined && match[2] !== undefined) {
      const href = safeHref(match[2]);
      if (href.startsWith("/")) {
        nodes.push(
          <Link key={`link-${key++}`} to={href}>
            {match[1]}
          </Link>,
        );
      } else {
        nodes.push(
          <a
            key={`link-${key++}`}
            href={href}
            {...(/^https:\/\//i.test(href)
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {match[1]}
          </a>,
        );
      }
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={`strong-${key++}`}>{match[3]}</strong>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) nodes.push(source.slice(lastIndex));
  return nodes;
}

function DocumentBlock({ block }) {
  if (!block) return null;
  if (block.type === "ul") {
    return (
      <ul className="legal-list">
        {block.items.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "table") {
    return (
      <div className="legal-table-wrap">
        <table className="legal-table">
          <caption className="sr-only">
            {block.columns.join(", ")}
          </caption>
          <thead>
            <tr>
              {block.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "note") {
    return (
      <p className="legal-note">
        <strong>Note:</strong> {renderInline(block.text)}
      </p>
    );
  }
  return <p>{renderInline(block.text)}</p>;
}

function LegalChrome({ currentId, children }) {
  return (
    <div className="legal-page">
      <header className="legal-nav">
        <Link className="legal-brand" to="/" aria-label="Corez home">
          <img src="/corez-logo.png" alt="" aria-hidden="true" />
          <span>Corez</span>
        </Link>
        <nav className="legal-nav-links" aria-label="Legal documents">
          {LEGAL_ORDER.map((id) => (
            <Link
              key={id}
              to={`/${id}`}
              aria-current={id === currentId ? "page" : undefined}
              className={id === currentId ? "is-current" : undefined}
            >
              {LEGAL_DOCUMENTS[id].title.replace(" and Conditions", "")}
            </Link>
          ))}
        </nav>
        <Link className="legal-back" to="/">
          <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
          Back to Corez
        </Link>
      </header>

      {children}

      <footer className="legal-footer">
        <p>
          Contact{" "}
          <a href={`mailto:${LEGAL_CONTACTS.support}`}>{LEGAL_CONTACTS.support}</a>
          {" · "}
          <a href={`mailto:${LEGAL_CONTACTS.privacy}`}>{LEGAL_CONTACTS.privacy}</a>
          {" · "}
          <a href={`mailto:${LEGAL_CONTACTS.legal}`}>{LEGAL_CONTACTS.legal}</a>
        </p>
        <div className="legal-footer-actions">
          <button
            type="button"
            className="consent-btn consent-btn-ghost"
            onClick={openConsentPreferences}
          >
            <Cookie size={14} strokeWidth={1.75} aria-hidden="true" />
            Cookie settings
          </button>
          <button
            type="button"
            className="consent-btn consent-btn-ghost"
            onClick={() => {
              try {
                window.print();
              } catch {
                /* printing is a convenience, never required */
              }
            }}
          >
            <Printer size={14} strokeWidth={1.75} aria-hidden="true" />
            Print or save as PDF
          </button>
        </div>
        <p className="legal-footer-meta">
          Version 1.0 · Last updated {LEGAL_UPDATED}
        </p>
      </footer>
    </div>
  );
}

export default function Legal({ docId }) {
  const document = getLegalDocument(docId);
  const [activeSection, setActiveSection] = useState(
    () => document?.sections?.[0]?.id || "",
  );
  const sectionRefs = useRef(new Map());

  useEffect(() => {
    if (!document) return undefined;
    const previousTitle = window.document.title;
    window.document.title = `${document.title} · Corez`;
    return () => {
      window.document.title = previousTitle;
    };
  }, [document]);

  // Highlight the section the reader is actually in. IntersectionObserver is
  // absent in some test environments, so this degrades to click-only
  // highlighting instead of throwing.
  useEffect(() => {
    if (!document) return undefined;
    if (typeof IntersectionObserver !== "function") return undefined;
    const headings = document.sections
      .map((section) => sectionRefs.current.get(section.id))
      .filter(Boolean);
    if (headings.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) setActiveSection(visible[0].target.id);
      },
      // A heading counts as "current" once it reaches the top quarter of the
      // viewport and until the next one takes over.
      { rootMargin: "-12% 0px -70% 0px", threshold: 0 },
    );
    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [document]);

  const otherDocuments = useMemo(
    () => LEGAL_ORDER.filter((id) => id !== docId).map((id) => LEGAL_DOCUMENTS[id]),
    [docId],
  );

  if (!document) {
    return (
      <LegalChrome currentId={docId}>
        <main className="legal-main">
          <h1>Document not found</h1>
          <p>
            That legal document does not exist. Choose one from the list above.
          </p>
        </main>
      </LegalChrome>
    );
  }

  return (
    <LegalChrome currentId={document.id}>
      <main className="legal-main">
        <div className="legal-head">
          <p className="legal-eyebrow">Legal</p>
          <h1>{document.title}</h1>
          <p className="legal-summary">{document.summary}</p>
          <p className="legal-meta">
            Version 1.0 · Last updated {LEGAL_UPDATED} · Governed by the laws of
            the United Arab Emirates
          </p>
        </div>

        <div className="legal-body">
          <nav className="legal-toc" aria-label="On this page">
            <p className="legal-toc-title">On this page</p>
            <ol>
              {document.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={activeSection === section.id ? "true" : undefined}
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="legal-article">
            {document.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-heading`}
              >
                <h2
                  id={`${section.id}-heading`}
                  ref={(node) => {
                    if (node) sectionRefs.current.set(section.id, node);
                    else sectionRefs.current.delete(section.id);
                  }}
                >
                  {section.heading}
                </h2>
                {section.blocks.map((block, index) => (
                  <DocumentBlock key={index} block={block} />
                ))}
              </section>
            ))}

            <section className="legal-related" aria-labelledby="legal-related-heading">
              <h2 id="legal-related-heading">Other policies</h2>
              <ul className="legal-related-list">
                {otherDocuments.map((other) => {
                  const Icon = DOC_ICONS[other.id] || FileText;
                  return (
                    <li key={other.id}>
                      <Link to={`/${other.id}`}>
                        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                        <span>
                          <strong>{other.title}</strong>
                          <em>{other.short}</em>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          </article>
        </div>
      </main>
    </LegalChrome>
  );
}

export function LegalIndex() {
  useEffect(() => {
    const previousTitle = window.document.title;
    window.document.title = "Policies and terms · Corez";
    return () => {
      window.document.title = previousTitle;
    };
  }, []);

  return (
    <LegalChrome currentId="">
      <main className="legal-main">
        <div className="legal-head">
          <p className="legal-eyebrow">Legal</p>
          <h1>Policies and terms</h1>
          <p className="legal-summary">
            Everything that governs your use of Corez, written to be read rather
            than skipped.
          </p>
          <p className="legal-meta">Last updated {LEGAL_UPDATED}</p>
        </div>
        <ul className="legal-related-list legal-index-list">
          {LEGAL_ORDER.map((id) => {
            const doc = LEGAL_DOCUMENTS[id];
            const Icon = DOC_ICONS[id] || FileText;
            return (
              <li key={id}>
                <Link to={`/${id}`}>
                  <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                  <span>
                    <strong>{doc.title}</strong>
                    <em>{doc.short}</em>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </LegalChrome>
  );
}
