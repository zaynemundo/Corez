import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { openConsentPreferences } from "../services/consentService";
import {
  ArrowRight,
  Gamepad2,
  Globe2,
  FileText,
  ImageIcon,
  MonitorPlay,
  Share2,
  Download,
  Boxes,
} from "lucide-react";

const DEMO_PROMPTS = [
  {
    command: "@game",
    text: "neon snake with power-ups and a two-player room",
    tag: "game · real multiplayer",
  },
  {
    command: "@website",
    text: "landing page for a Dubai specialty coffee roaster",
    tag: "website · multi-page",
  },
  {
    command: "@research",
    text: "the state of solar adoption in the UAE in 2026",
    tag: "research · PDF report",
  },
  {
    command: "@image",
    text: "isometric night market, warm amber light",
    tag: "image · generated",
  },
];

const FEATURES = [
  {
    icon: Gamepad2,
    title: "Playable games, not code dumps",
    body: "Describe the loop, controls and look. Corez builds a canvas game with a fixed-timestep engine, then verifies it actually runs before you see it.",
  },
  {
    icon: Globe2,
    title: "Websites and apps that hold together",
    body: "Multi-page sites, dashboards and tools with working navigation, responsive layout and a live preview you can inspect in source view.",
  },
  {
    icon: MonitorPlay,
    title: "Watch it build, then take over",
    body: "Streamed builds show each phase — planning, verifying, fixing — and the preview pane lets you switch to the generated source at any point.",
  },
  {
    icon: Share2,
    title: "Publish a link in one click",
    body: "Turn the current creation into a public corez.pro link with a scannable QR code and an embed snippet for any site or doc.",
  },
  {
    icon: FileText,
    title: "Research grounded in real sources",
    body: "@research searches the live web, writes a report with citations, and hands back a downloadable PDF — or says it found nothing.",
  },
  {
    icon: ImageIcon,
    title: "Images and reference-aware artwork",
    body: "@image generates artwork from a prompt, and can use an image you attach or one from the conversation as a reference.",
  },
];

const STEPS = [
  {
    title: "Describe it",
    body: "Type a sentence — or use @website, @game, @research or @image for an explicit intent. Plain English is enough.",
  },
  {
    title: "Watch the live build",
    body: "The preview opens beside the chat while Corez builds, verifies and repairs the result in the open.",
  },
  {
    title: "Publish and share",
    body: "Download the HTML or a ZIP of a multi-page site, or publish a link with QR and embed options.",
  },
];

const FAQS = [
  {
    q: "Do I need to know how to code?",
    a: "No. You describe what you want in the chat; Corez writes the code and shows it to you. If you do code, the source is still there to inspect and edit.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes — the Free plan includes 20 generations a month, one project and publishing. Free publications show a small \u201cMade with Corez\u201d badge; paid plans remove the badge and add more generations and projects.",
  },
  {
    q: "Can I download what I make?",
    a: "Yes. Single creations download as a standalone HTML file; multi-page sites download as a ZIP that keeps working on any host.",
  },
  {
    q: "What can I build?",
    a: "Websites, interactive apps, tools, dashboards and 2D or 3D games — including online multiplayer games connected through a real-time server.",
  },
];

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    setReduced(Boolean(query.matches));
    const listener = (event) => setReduced(Boolean(event.matches));
    if (query.addEventListener) query.addEventListener("change", listener);
    else query.addListener(listener);
    return () => {
      if (query.removeEventListener) query.removeEventListener("change", listener);
      else query.removeListener(listener);
    };
  }, []);
  return reduced;
}

export default function Landing() {
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const [promptIndex, setPromptIndex] = useState(0);
  const [typedCount, setTypedCount] = useState(0);
  const pageRef = useRef(null);

  const active = DEMO_PROMPTS[promptIndex];

  // The landing page scrolls inside its own container, so keyboard scrolling
  // needs focus inside it (the document itself is not the scroller).
  useEffect(() => {
    const node = pageRef.current;
    if (node && typeof node.focus === "function") node.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const full = active.text;
    if (typedCount < full.length) {
      const timer = setTimeout(() => setTypedCount((c) => c + 1), 26);
      return () => clearTimeout(timer);
    }
    const hold = setTimeout(() => {
      setTypedCount(0);
      setPromptIndex((i) => (i + 1) % DEMO_PROMPTS.length);
    }, 1900);
    return () => clearTimeout(hold);
  }, [active, typedCount, reducedMotion]);

  const typedText = reducedMotion ? DEMO_PROMPTS[0].text : active.text.slice(0, typedCount);
  const activeTag = useMemo(
    () => (reducedMotion ? DEMO_PROMPTS[0] : active).tag,
    [active, reducedMotion],
  );

  return (
    <div className="landing" ref={pageRef} tabIndex={-1}>
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Corez home">
          <img src="/corez-logo.png" alt="" aria-hidden="true" />
          <span>Corez</span>
        </a>
        <nav className="landing-nav-links" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
          <button type="button" className="landing-nav-plain" onClick={() => navigate("/pricing")}>
            Pricing
          </button>
        </nav>
        <div className="landing-nav-actions">
          <button type="button" className="landing-btn landing-btn-ghost" onClick={() => navigate("/login")}>
            Sign in
          </button>
          <button type="button" className="landing-btn landing-btn-solid" onClick={() => navigate("/login")}>
            Start building <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-heading">
          <p className="landing-eyebrow">Conversational AI creation platform</p>
          <h1 id="landing-heading">
            Describe it.
            <br />
            Watch it build.
            <br />
            Share it.
          </h1>
          <p className="landing-lede">
            Corez turns a chat message into a working website, app or game — live in the
            preview, publishable as a link.
          </p>
          <div className="landing-hero-actions">
            <button type="button" className="landing-btn landing-btn-solid landing-btn-lg" onClick={() => navigate("/login")}>
              Build something free
            </button>
            <button type="button" className="landing-btn landing-btn-ghost landing-btn-lg" onClick={() => navigate("/pricing")}>
              See pricing
            </button>
          </div>
          <p className="landing-note">
            Free plan: 20 generations a month, publishing included, no card required.
          </p>

          <div className="landing-commands" aria-label="Chat commands">
            {DEMO_PROMPTS.map((demo, index) => (
              <span
                key={demo.command}
                className={`landing-command ${index === promptIndex && !reducedMotion ? "is-active" : ""}`}
              >
                {demo.command}
              </span>
            ))}
          </div>
        </section>

        <section className="landing-demo" aria-label="Example prompt and result">
          <div className="landing-demo-card" aria-live="polite">
            <div className="landing-demo-head">
              <span className="landing-demo-dot" aria-hidden="true" />
              <span>corez.pro</span>
              <span className="landing-demo-tag">{activeTag}</span>
            </div>
            <div className="landing-demo-chat">
              <span className="landing-demo-command">{active.command}</span>
              <p>
                {typedText}
                {!reducedMotion && typedCount < active.text.length && (
                  <span className="landing-caret" aria-hidden="true" />
                )}
              </p>
            </div>
            <div className="landing-demo-build" aria-hidden="true">
              <span className="landing-demo-phase">building…</span>
              <span className="landing-demo-bar landing-demo-bar-a" />
              <span className="landing-demo-bar landing-demo-bar-b" />
              <span className="landing-demo-bar landing-demo-bar-c" />
            </div>
            <div className="landing-demo-preview" aria-hidden="true">
              <span className="landing-preview-nav" />
              <span className="landing-preview-hero" />
              <span className="landing-preview-row" />
              <span className="landing-preview-row short" />
              <span className="landing-preview-block" />
            </div>
          </div>
        </section>
      </main>

      <section className="landing-section" id="features" aria-labelledby="landing-features-heading">
        <h2 id="landing-features-heading">Everything in one chat</h2>
        <p className="landing-section-lede">
          The same conversation can start a game, turn it into a landing page, research the
          market and generate the artwork.
        </p>
        <div className="landing-grid">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article className="landing-card" key={title}>
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-how" id="how" aria-labelledby="landing-how-heading">
        <h2 id="landing-how-heading">From sentence to shareable</h2>
        <ol className="landing-steps">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="landing-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="landing-inline-cta">
          <Boxes size={18} strokeWidth={1.5} aria-hidden="true" />
          <p>
            Every build is verified before delivery, and failures are reported honestly —
            no fake success screens.
          </p>
        </div>
      </section>

      <section className="landing-section landing-pricing-teaser" aria-labelledby="landing-pricing-heading">
        <div>
          <h2 id="landing-pricing-heading">Start free, publish when you are ready</h2>
          <p>
            The Free plan covers 20 generations a month and publishing with a small Corez
            badge. Standard adds 200 generations, more projects, custom URL slugs and
            badge-free pages.
          </p>
        </div>
        <button type="button" className="landing-btn landing-btn-solid landing-btn-lg" onClick={() => navigate("/pricing")}>
          Compare plans <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </section>

      <section className="landing-section" id="faq" aria-labelledby="landing-faq-heading">
        <h2 id="landing-faq-heading">Questions</h2>
        <div className="landing-faq">
          {FAQS.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <img src="/corez-logo.png" alt="" aria-hidden="true" />
          <span>Corez — Turn ideas into websites, apps &amp; games.</span>
        </div>
        <nav className="landing-footer-legal" aria-label="Legal">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms and Conditions</Link>
          <Link to="/cookies">Cookie Policy</Link>
          <Link to="/refunds">Refund Policy</Link>
          <button
            type="button"
            className="landing-nav-plain"
            onClick={openConsentPreferences}
          >
            Cookie settings
          </button>
        </nav>
        <div className="landing-footer-links">
          <button type="button" className="landing-nav-plain" onClick={() => navigate("/pricing")}>
            Pricing
          </button>
          <button type="button" className="landing-nav-plain" onClick={() => navigate("/login")}>
            Sign in
          </button>
          <Download size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>Your creations download as HTML or ZIP.</span>
        </div>
      </footer>
    </div>
  );
}
