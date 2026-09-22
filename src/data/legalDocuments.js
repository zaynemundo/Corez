// Legal content for Corez.
//
// Every statement below is grounded in what the codebase actually does: the
// storage it writes, the providers it calls and the controls it implements.
// When a product change alters any of that, edit the matching document and
// bump LEGAL_DOCUMENT_VERSION so the consent receipts and the "last updated"
// date stay truthful.
//
// NOTE FOR THE OPERATOR: these documents are an accurate, plain-English
// starting point written against the implementation, not legal advice. Have
// them reviewed by a qualified UAE lawyer before relying on them commercially.
//
// Inline links use [label](href) and are rendered by src/pages/Legal.jsx.

export const LEGAL_DOCUMENT_VERSION = "1.0";
export const LEGAL_UPDATED = "22 September 2026";
export const LEGAL_ENTITY = "Corez (United Arab Emirates)";

export const LEGAL_CONTACTS = {
  privacy: "privacy@corez.pro",
  legal: "legal@corez.pro",
  support: "support@corez.pro",
};

const CONTACT_SECTION = {
  id: "contact",
  heading: "Contact us",
  blocks: [
    {
      type: "p",
      text: `Questions or requests about this document can be sent to [${LEGAL_CONTACTS.legal}](mailto:${LEGAL_CONTACTS.legal}). Privacy and data-protection requests go to [${LEGAL_CONTACTS.privacy}](mailto:${LEGAL_CONTACTS.privacy}), and billing or refund requests go to [${LEGAL_CONTACTS.support}](mailto:${LEGAL_CONTACTS.support}). We answer within 30 days, usually much sooner.`,
    },
  ],
};

export const LEGAL_DOCUMENTS = {
  privacy: {
    id: "privacy",
    title: "Privacy Policy",
    short: "How Corez collects, uses and protects personal data",
    summary:
      "What we collect when you use Corez, why we hold it, who processes it on our behalf, how long we keep it and how you can get it back or get it deleted.",
    sections: [
      {
        id: "who-we-are",
        heading: "1. Who we are",
        blocks: [
          {
            type: "p",
            text: `Corez is an AI creation platform operated from the United Arab Emirates. For the purposes of data-protection law, ${LEGAL_ENTITY} is the controller of the personal data described in this policy.`,
          },
          {
            type: "p",
            text: `You can reach the privacy team at [${LEGAL_CONTACTS.privacy}](mailto:${LEGAL_CONTACTS.privacy}). This policy covers the corez.pro website and the Corez application (the "Service"). It does not cover websites you build with Corez, or third-party services you reach from a published link.`,
          },
        ],
      },
      {
        id: "what-we-collect",
        heading: "2. What we collect",
        blocks: [
          { type: "ul", items: [
            "**Account data.** Your email address, a password stored only as a PBKDF2-SHA256 hash with a random salt (never in clear text), the sign-in method you used (email or Google), and your account creation date.",
            "**Your content.** Chat titles and messages you send, prompts, attachments you upload, descriptions generated from those attachments so the models can understand them, creations produced for you, and pages you publish together with their public slug.",
            "**Plan and billing data.** Your plan, subscription status, billing period and payment-reference identifiers returned by our payment provider. Card and bank details are entered on the provider's own checkout page and never reach Corez.",
            "**Technical data.** The session cookie described in the [Cookie Policy](/cookies), rate-limiting counters, and server logs at our hosting provider that necessarily include IP address and user agent for delivering and protecting the Service.",
            "**Consent records.** Which consent choices you made, when, and from which surface, so we can prove the choice was recorded and can honour a withdrawal.",
            "**Analytics (only if you allow it).** Page paths, a small set of named product events, coarse country, and a random session identifier held in memory for the current page only. See section 6.",
          ]},
          {
            type: "note",
            text: "We do not buy personal data, do not sell or share it for advertising, and do not build advertising profiles. There is no third-party advertising or cross-site tracking pixel on corez.pro.",
          },
        ],
      },
      {
        id: "how-we-use-it",
        heading: "3. How and why we use it",
        blocks: [
          { type: "table", columns: ["Purpose", "Data used", "Legal basis"], rows: [
            ["Creating and operating your account, building and storing your creations, publishing a link you asked for", "Account data, your content", "Performance of our contract with you"],
            ["Billing, plan changes, invoices and accounting records", "Plan and billing data", "Contract, and legal obligations for record-keeping"],
            ["Keeping the Service secure: abuse prevention, rate limiting, fraud and misuse detection", "Technical data, account data", "Legitimate interests in protecting the Service and its users"],
            ["Support: diagnosing a failed build or a broken page", "Account data, your content, technical data", "Contract and legitimate interests"],
            ["Product analytics that shows which features are used and where flows break", "Analytics data, only after you allow the Analytics category", "Consent (withdrawable at any time)"],
            ["News and offers by email, if you allow the Marketing category", "Email address", "Consent (withdrawable at any time)"],
            ["Responding to legal requests and enforcing our Terms", "As necessary and proportionate", "Legal obligation and legitimate interests"],
          ]},
        ],
      },
      {
        id: "ai-processing",
        heading: "4. AI processing of your content",
        blocks: [
          {
            type: "p",
            text: "To produce a response, the prompt you type, the recent conversation and any attachment you send are transmitted to the model providers listed in section 5. Attachments are processed so the model can understand them — an image, video or audio file is described by a vision model, and the description is what the text model reads.",
          },
          {
            type: "p",
            text: "Do not submit special-category or highly sensitive data about yourself or anyone else: health, biometric, financial, identity-document, or another person's private information. Also avoid third-party confidential material you have no right to share. Builds are processed to deliver the result, not to train our own models, and no prompt or creation is published by us — publishing happens only when you press Publish, and it makes that page public.",
          },
          {
            type: "note",
            text: "AI output can be wrong. Generated code, text, images and research summaries may contain errors or may resemble other output. Verify anything you rely on or publish.",
          },
        ],
      },
      {
        id: "sharing",
        heading: "5. Who processes data on our behalf",
        blocks: [
          {
            type: "p",
            text: "We share personal data only with providers that make the Service work, and only for the purposes below. Each is bound by its own data-processing terms with us.",
          },
          { type: "table", columns: ["Provider", "Purpose", "Data involved"], rows: [
            ["Cloudflare (Workers, D1, R2, KV, Durable Objects)", "Hosting, database, file storage, edge security and edge AI models", "All data stored by the Service, plus delivery logs"],
            ["OpenCode Zen", "Text and vision model inference for chat, builds and attachment understanding", "Prompts, conversation context, attachment descriptions"],
            ["OpenRouter", "Image generation when that route is configured", "Image prompts"],
            ["Cloudflare Workers AI", "Image generation, embeddings and search reranking", "Prompts and search queries"],
            ["Exa and DuckDuckGo", "Web search used by the @research command", "Search queries only"],
            ["Ziina", "Subscription payments", "Email, plan, amount, payment reference; card data stays with Ziina"],
            ["Resend", "Transactional email such as password reset and receipts", "Email address and the contents of that email"],
          ]},
          {
            type: "p",
            text: "We may also disclose data if the law requires it, if it is necessary to investigate abuse or protect someone's safety, or as part of a merger or acquisition — in which case this policy continues to apply until it is replaced.",
          },
        ],
      },
      {
        id: "analytics",
        heading: "6. Analytics and browser signals",
        blocks: [
          {
            type: "p",
            text: "Analytics is off by default and runs only after you allow the Analytics category in the consent banner. When it is on it is first-party: events go to our own Worker endpoint and are stored as aggregate counters (day, event, path, country, coarse device class). There is no analytics cookie, no third-party analytics script, no cross-site identifier, and the session identifier is held in memory for the current page and disappears when you close the tab.",
          },
          {
            type: "p",
            text: "Our tracker ignores the request entirely when your browser sends Do Not Track (`DNT: 1`) or Global Privacy Control. Turning the Analytics category off stops collection immediately, clears anything still buffered, and does not affect your plan or your access to the Service.",
          },
        ],
      },
      {
        id: "transfers",
        heading: "7. International transfers",
        blocks: [
          {
            type: "p",
            text: "Corez runs on Cloudflare's global network and uses providers that may process data outside your country, including in the United States and the European Union. Where personal data leaves a jurisdiction that restricts transfers, we rely on appropriate safeguards such as the European Commission's standard contractual clauses (and the UK addendum where relevant), or an adequacy decision such as the EU-US Data Privacy Framework for providers that certify under it.",
          },
        ],
      },
      {
        id: "retention",
        heading: "8. How long we keep it",
        blocks: [
          { type: "ul", items: [
            "**Account data** — while your account exists. Delete your account and it is removed from the live database.",
            "**Chats, messages and stored assets** — until you delete the chat or your account. Individual chats can be deleted in the app at any time.",
            "**Published pages** — until you unpublish or delete them, or delete your account.",
            "**Billing records** — retained as long as tax and accounting law requires (up to five years in the UAE), even after account deletion.",
            "**Password reset tokens** — single use and short-lived, then expired and purged.",
            "**Rate-limit counters** — minutes, in memory at the edge.",
            "**Analytics counters** — aggregate only, kept for up to 24 months, with no identifier that could isolate you.",
            "**Consent records** — kept while the choice is relied on (at least 12 months) so the decision can be evidenced.",
            "**Backups** — residual copies in encrypted backups are purged on a rolling basis, normally within 30 days.",
          ]},
        ],
      },
      {
        id: "security",
        heading: "9. How we protect it",
        blocks: [
          { type: "ul", items: [
            "Passwords are stored as PBKDF2-SHA256 hashes with a random per-user salt and 100,000 iterations; clear-text passwords are never stored or logged.",
            "Session cookies are `HttpOnly`, `Secure` and `SameSite=Lax`, and expire after seven days.",
            "Stored files and generated apps are access-checked by owner before they are read, written or deleted.",
            "Previews of generated code run inside sandboxed iframes that cannot navigate the top-level page.",
            "Third-party embeds are blocked until you allow them, and are constrained to a small allowlist of providers when loaded.",
            "Access to production systems is limited to personnel who need it, with authentication in front of the provider accounts.",
          ]},
          {
            type: "p",
            text: "No online service can promise perfect security. If a breach affects your rights, we will notify affected users and the competent authority as required by law.",
          },
        ],
      },
      {
        id: "your-rights",
        heading: "10. Your rights",
        blocks: [
          {
            type: "p",
            text: "Depending on where you live, you may have the right to access a copy of your personal data, correct it, delete it, restrict or object to certain processing, receive it in a portable format, withdraw consent at any time, and not be subject to purely automated decisions with legal effects. We do not make such automated decisions, and we do not sell your data.",
          },
          {
            type: "p",
            text: `To exercise any of these, email [${LEGAL_CONTACTS.privacy}](mailto:${LEGAL_CONTACTS.privacy}) from the address on your account, or with enough detail for us to verify you own it. We respond within 30 days; if a request is complex we will tell you when to expect the answer. You may also complain to your local supervisory authority — in the UAE, the Data Office at the UAE Artificial Intelligence, Digital Economy and Remote Work Applications Office.`,
          },
        ],
      },
      {
        id: "children",
        heading: "11. Children",
        blocks: [
          {
            type: "p",
            text: "Corez is not intended for children. You must be at least 16 years old (or older where your country sets a higher digital age of consent) to create an account, and attachments must not contain images of identifiable children. If we learn that a child has created an account, we will delete it.",
          },
        ],
      },
      {
        id: "changes",
        heading: "12. Changes to this policy",
        blocks: [
          {
            type: "p",
            text: `Version ${LEGAL_DOCUMENT_VERSION}, last updated ${LEGAL_UPDATED}. When a change materially affects what we do with your data, we will tell you in the app or by email before it takes effect, and where consent is the legal basis we will ask for it again.`,
          },
        ],
      },
      CONTACT_SECTION,
    ],
  },

  terms: {
    id: "terms",
    title: "Terms and Conditions",
    short: "The rules for using Corez",
    summary:
      "The agreement between you and Corez: what you may build and publish, what you own, what we owe you, what you owe us, and how disputes are handled.",
    sections: [
      {
        id: "agreement",
        heading: "1. The agreement",
        blocks: [
          {
            type: "p",
            text: `These Terms and Conditions govern your use of Corez, operated from the United Arab Emirates. By creating an account, signing in or using the Service, you agree to them, together with the [Privacy Policy](/privacy), [Cookie Policy](/cookies) and [Refund Policy](/refunds). If you do not agree, do not use the Service.`,
          },
          {
            type: "p",
            text: "If you use Corez for an organisation, you confirm that you are authorised to accept these Terms for it, and \"you\" includes that organisation.",
          },
        ],
      },
      {
        id: "eligibility",
        heading: "2. Who may use Corez",
        blocks: [
          { type: "ul", items: [
            "You must be at least 16 years old, or the digital age of consent in your country if higher.",
            "You must provide an email address you control, keep your password secure and tell us promptly about unauthorised use of your account. You are responsible for activity under your account.",
            "You must not be barred from using the Service under the laws that apply to you, and you must not use it from a country subject to comprehensive sanctions that prohibit it.",
          ]},
        ],
      },
      {
        id: "plans-billing",
        heading: "3. Plans, prices and billing",
        blocks: [
          { type: "ul", items: [
            "**Free** — 20 generations a month, 1 project, publishing with a small \"Made with Corez\" badge.",
            "**Standard** — 18.36 AED per month (or 176.28 AED per year when billed yearly). 200 generations a month, 10 projects, badge-free publishing and a custom URL slug.",
            "**Premium** — 27.54 AED per month (or 264.36 AED per year when billed yearly). Unlimited generations, unlimited projects, badge-free publishing, custom URL slug and priority support.",
            "Paid plans are billed in advance in United Arab Emirates Dirham through Ziina and renew automatically at the end of each period until you cancel.",
            "You can upgrade at any time, and the change takes effect immediately. Downgrades and cancellations take effect at the end of the period you have already paid for; you keep your current plan's features until then.",
            "Generations reset on your monthly cycle. Unused generations do not carry over and are not refundable. Usage limits exist to keep the Service available and are enforced by our systems.",
            "We may change prices or plan contents with at least 30 days' notice. If you do not accept a change, cancel before it takes effect. Taxes are included where required by law, otherwise they are added at checkout.",
          ]},
          {
            type: "p",
            text: "Refunds are governed by the [Refund Policy](/refunds).",
          },
        ],
      },
      {
        id: "your-content",
        heading: "4. Your content and your creations",
        blocks: [
          {
            type: "p",
            text: "You keep ownership of what you put into Corez and what Corez produces for you. We claim no ownership of your prompts, your uploaded files or your generated creations, and we do not use them to train our own models.",
          },
          {
            type: "p",
            text: "You grant us the limited licence we need to run the Service: to store, copy, transmit, transform and display your content for the purpose of generating the result you asked for, publishing a page you asked us to publish, and keeping your account working. That licence ends when you delete the content or your account, except where we must keep something for legal or accounting reasons, or where it remains in a published page or backup for the short periods described in the Privacy Policy.",
          },
          {
            type: "p",
            text: "You are responsible for your content: you must have the rights needed to upload it, and it must not infringe anyone's copyright, trademark, privacy or other rights. AI output is not guaranteed to be unique — similar prompts can produce similar results — so clear third-party rights before commercial use and check that generated code, text and images are fit for your purpose.",
          },
        ],
      },
      {
        id: "acceptable-use",
        heading: "5. Acceptable use",
        blocks: [
          {
            type: "p",
            text: "Use Corez to create, not to harm. You must not use the Service to:",
          },
          { type: "ul", items: [
            "break any law, infringe anyone's rights, or help someone else do either;",
            "create or distribute malware, phishing pages, scams, deceptive look-alike sites, or content that impersonates a person, brand or public authority;",
            "generate sexual content involving minors, content that sexualises real people without consent, credible threats, harassment, or instructions for weapons, drugs or violence with intent to cause harm;",
            "collect personal data from published pages unlawfully, or build a page whose purpose is credential harvesting;",
            "send spam or bulk unsolicited messages, or use the Service to run a mail relay;",
            "probe, scan or overload the Service, bypass rate limits, plan quotas or authentication, or access data that is not yours;",
            "reverse engineer, scrape or copy the Service in order to build a competing product, or resell it as your own;",
            "upload content you do not have the right to upload, including other people's confidential material.",
          ]},
          {
            type: "p",
            text: "We may suspend or terminate an account, remove a published page, or block access where we reasonably believe this section is being broken, and we will say why unless the law prevents us.",
          },
        ],
      },
      {
        id: "publishing",
        heading: "6. Publishing and sharing",
        blocks: [
          {
            type: "p",
            text: "Publishing creates a public link that anyone with the URL can open. Only publish material you are comfortable making public, and only content you have the right to publish. You are responsible for what is on your published pages, including any claims, offers, prices or personal data you include. Free-plan publications carry a small \"Made with Corez\" badge; paid plans may remove it.",
          },
          {
            type: "p",
            text: "We do not review pages before they are published. We may remove a page or a link if it breaks these Terms, breaks the law, or is the subject of a substantiated complaint, and we may reuse the slug after removal.",
          },
        ],
      },
      {
        id: "our-ip",
        heading: "7. Our intellectual property",
        blocks: [
          {
            type: "p",
            text: "Corez, the Corez name and logo, the interface, the harness that builds your results and all of our code and documentation remain ours or our licensors' property. Your subscription gives you a right to use the Service; it does not transfer ownership of it. You may not copy, rehost or resell the Service, or remove the Corez badge from a page where your plan requires it.",
          },
        ],
      },
      {
        id: "third-parties",
        heading: "8. Third-party services and embeds",
        blocks: [
          {
            type: "p",
            text: "The Service depends on third parties for hosting, payment and AI inference, and creations you publish may reference third-party assets. Those services have their own terms and privacy policies, and we are not responsible for them. Embedded third-party media is blocked until you or your visitor allows it — see the [Cookie Policy](/cookies) for how that works.",
          },
        ],
      },
      {
        id: "availability",
        heading: "9. Availability and changes",
        blocks: [
          {
            type: "p",
            text: "We work to keep Corez available, but the Service is provided without an uptime guarantee. Features may be added, changed, deprecated or removed, and preview or beta features may change without notice. We may suspend the Service for maintenance or for reasons outside our control. Where a material outage of a paid feature is caused by us and lasts longer than 24 hours in a billing period, tell us and we will extend your period by the affected time — this is the remedy we offer for downtime.",
          },
        ],
      },
      {
        id: "disclaimer",
        heading: "10. Disclaimers",
        blocks: [
          {
            type: "p",
            text: "Corez generates output with artificial intelligence. It is provided \"as is\" and \"as available\", without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy, or non-infringement. Output may be wrong or incomplete, and it is not legal, medical, financial or other professional advice. Verify anything you rely on. Nothing in these Terms excludes rights you have under mandatory consumer law, or liability that cannot lawfully be excluded.",
          },
        ],
      },
      {
        id: "liability",
        heading: "11. Limitation of liability",
        blocks: [
          {
            type: "p",
            text: "To the maximum extent permitted by law, Corez is not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, lost data, lost business or loss of goodwill. Our total liability for all claims relating to the Service in any twelve-month period is limited to the amount you paid us in the twelve months before the event giving rise to the claim, or 100 AED if you paid nothing.",
          },
          {
            type: "p",
            text: "You agree to indemnify us against third-party claims, losses and reasonable costs arising from content you upload or publish, or from your breach of these Terms or of someone else's rights.",
          },
        ],
      },
      {
        id: "termination",
        heading: "12. Suspension and termination",
        blocks: [
          {
            type: "p",
            text: "You may stop using Corez at any time and cancel your plan in Settings. We may suspend or terminate your access if you materially breach these Terms, if we are required to by law, or if we discontinue the Service — in the last case we will give reasonable notice and refund any unused paid period unless the law requires otherwise. On termination your right to use the Service ends, published pages may be removed, and clauses that by their nature should survive (ownership, disclaimers, liability, governing law) continue to apply.",
          },
        ],
      },
      {
        id: "governing-law",
        heading: "13. Governing law and disputes",
        blocks: [
          {
            type: "p",
            text: "These Terms are governed by the laws of the United Arab Emirates as applied in the Emirate of Dubai, and the courts of Dubai have exclusive jurisdiction — except that either party may seek relief in the courts of the place where you reside where mandatory consumer law gives you that right. Before starting proceedings, write to us at " +
              `[${LEGAL_CONTACTS.legal}](mailto:${LEGAL_CONTACTS.legal}) and give us 30 days to resolve the issue.`,
          },
        ],
      },
      {
        id: "changes",
        heading: "14. Changes to these Terms",
        blocks: [
          {
            type: "p",
            text: `Version ${LEGAL_DOCUMENT_VERSION}, last updated ${LEGAL_UPDATED}. We may update these Terms; material changes will be announced in the app or by email at least 14 days before they take effect, and continued use after that date means you accept them. If you do not accept them, cancel and stop using the Service.`,
          },
        ],
      },
      CONTACT_SECTION,
    ],
  },

  cookies: {
    id: "cookies",
    title: "Cookie Policy",
    short: "Cookies, local storage and how to control them",
    summary:
      "Exactly what Corez stores in your browser, why, for how long, and how to change or withdraw your choices at any time.",
    sections: [
      {
        id: "what-they-are",
        heading: "1. Cookies and local storage",
        blocks: [
          {
            type: "p",
            text: "A cookie is a small file a site asks your browser to store and send back with later requests. Local storage is a similar in-browser store that is not sent with requests. We use both, for the reasons in the tables below. Products described as \"strictly necessary\" are needed for the Service to function at all — so under data-protection rules they do not require consent. Everything optional is off until you actively allow it, and there are no pre-ticked boxes.",
          },
        ],
      },
      {
        id: "essential",
        heading: "2. Strictly necessary",
        blocks: [
          { type: "table", columns: ["Name", "Type", "Purpose", "Lifetime"], rows: [
            ["corez_session", "Cookie (HttpOnly, Secure, SameSite=Lax)", "Keeps you signed in; sent only to corez.pro", "7 days, or until you log out"],
            ["oauth_state", "Cookie (HttpOnly, Secure, SameSite=Lax)", "Prevents cross-site request forgery during Google sign-in", "10 minutes"],
            ["corez_theme", "Local storage", "Remembers light or dark appearance", "Until you clear site data"],
            ["corez_pending_request", "Local storage", "Lets an in-flight build resume if the page is reloaded mid-generation", "Until the build finishes, or 5 minutes"],
            ["corez_pending_plan, corez_next", "Local storage", "Resumes a checkout you started after signing in", "Until the checkout starts, or clearing site data"],
            ["corez_consent_v1", "Local storage", "Records your consent choices so the banner is not shown again", "12 months, then you are asked again"],
          ]},
        ],
      },
      {
        id: "analytics-storage",
        heading: "3. Analytics — optional",
        blocks: [
          { type: "table", columns: ["Name", "Type", "Purpose", "Lifetime"], rows: [
            ["None", "No cookie and no local storage", "First-party product analytics: page paths, named product events, coarse country and device class, aggregated into counters on our own server. The session identifier exists only in page memory and vanishes when the tab closes.", "Not applicable"],
          ]},
          {
            type: "note",
            text: "Blocked by default. The tracker does not run at all until you allow Analytics, and it also stays off when your browser sends Do Not Track or Global Privacy Control. Withdrawing consent stops it immediately and discards anything still buffered.",
          },
        ],
      },
      {
        id: "embeds-storage",
        heading: "4. External media and embeds — optional",
        blocks: [
          {
            type: "p",
            text: "When a page contains a third-party player or map (for example YouTube, Vimeo or Google Maps), it is shown as a click-to-load placeholder. Nothing is requested from that provider — no cookies, not even a poster image — until you or the visitor chooses to load it. If you allow the External media category, embeds load automatically from then on.",
          },
          {
            type: "p",
            text: "Once an embed is loaded, the provider can set its own cookies and see the IP address of the browser that loaded it, under its own policies: [Google](https://policies.google.com/privacy) (including YouTube) and [Vimeo](https://vimeo.com/privacy). We rebuild embed URLs from a validated identifier, so tracking parameters in the original link are dropped, and YouTube embeds use youtube-nocookie.com.",
          },
        ],
      },
      {
        id: "marketing-storage",
        heading: "5. Marketing — optional",
        blocks: [
          {
            type: "p",
            text: "Corez does not use advertising, retargeting or cross-site tracking cookies, and there are none on this site today. If advertising measurement is ever introduced, it will run only under the Marketing category, only after you allow it. Your choice to receive product emails is made in the consent dialog, and unsubscribing is always available from the email footer.",
          },
        ],
      },
      {
        id: "control",
        heading: "6. How to change or withdraw your choice",
        blocks: [
          { type: "ul", items: [
            "Use **Cookie settings** in the site footer (or in Settings inside the app) to reopen the preferences dialog and change any category.",
            "Choose **Reject non-essential** on the banner to allow strictly necessary storage only.",
            "Clear or block cookies and site data in your browser settings. Blocking strictly necessary cookies will sign you out and may stop the Service from working.",
            "Use a private or incognito window to avoid persistent storage for that session.",
            "Withdrawing analytics consent deletes nothing from your account; it only stops the counters from growing from your visits.",
          ]},
          {
            type: "p",
            text: "Your consent record is kept for at least 12 months from the last decision, then we ask again. Deleting it does not delete your account.",
          },
        ],
      },
      {
        id: "signals",
        heading: "7. Browser privacy signals",
        blocks: [
          {
            type: "p",
            text: "We honour Do Not Track (`DNT: 1`) and Global Privacy Control as an instruction to keep analytics off, whether or not you previously allowed it. Because there is no cross-site tracking on Corez, those signals do not change anything else about how the Service works.",
          },
        ],
      },
      {
        id: "changes",
        heading: "8. Changes to this policy",
        blocks: [
          {
            type: "p",
            text: `Version ${LEGAL_DOCUMENT_VERSION}, last updated ${LEGAL_UPDATED}. If we add a cookie or an optional technology, we will update this page and ask for consent again where the law requires it.`,
          },
        ],
      },
      CONTACT_SECTION,
    ],
  },

  refunds: {
    id: "refunds",
    title: "Refund Policy",
    short: "Cancelling, downgrading and refunds",
    summary:
      "How billing works, how to cancel or downgrade, and the situations in which we refund — including your statutory rights.",
    sections: [
      {
        id: "summary",
        heading: "1. In short",
        blocks: [
          { type: "ul", items: [
            "Cancel any time; you keep the plan you paid for until the end of the current billing period.",
            "We do not refund part-used billing periods, unused generations or periods you chose not to use.",
            "We do refund charges that should not have happened — duplicates, charges after a valid cancellation, and unauthorised charges.",
            "If you are a consumer in the EU or UK, you have a 14-day right of withdrawal for a new paid subscription, subject to the rules in section 5.",
            "Nothing here limits rights you have under mandatory consumer protection law in the UAE or your country of residence.",
          ]},
        ],
      },
      {
        id: "billing",
        heading: "2. How billing works",
        blocks: [
          { type: "ul", items: [
            "Paid plans are billed in advance in AED: Standard 18.36 AED per month (176.28 AED per year) and Premium 27.54 AED per month (264.36 AED per year).",
            "Payments are processed by Ziina. Your payment method is charged at the start of each period and renews automatically until you cancel.",
            "The Free plan costs nothing and therefore has nothing to refund.",
            "Upgrades take effect immediately and are charged at the new rate. Downgrades and cancellation are scheduled for the end of the period you already paid for.",
          ]},
        ],
      },
      {
        id: "cancelling",
        heading: "3. How to cancel or downgrade",
        blocks: [
          { type: "ul", items: [
            "In the app: open **Settings → Plan & Billing → Manage plan**, choose the Free plan or a lower tier, and confirm. Your access continues to the end of the paid period.",
            "By email: write to " + `[${LEGAL_CONTACTS.support}](mailto:${LEGAL_CONTACTS.support})` + " from your account address and ask us to cancel. We action requests within 2 business days and confirm by reply.",
            "If a scheduled downgrade has not yet taken effect and you change your mind, you can undo it in Settings before the period ends.",
          ]},
          {
            type: "note",
            text: "Cancelling stops future charges. It does not by itself refund the current period, which is why section 1 says to cancel before the renewal date if you do not want the next cycle.",
          },
        ],
      },
      {
        id: "when-we-refund",
        heading: "4. When we do refund",
        blocks: [
          { type: "table", columns: ["Situation", "What we do"], rows: [
            ["You were charged twice for the same period", "Refund the duplicate in full"],
            ["You were charged after cancelling, and the charge is for a period starting after your cancellation", "Refund that charge in full"],
            ["The charge was not authorised by you", "Refund in full once we have confirmed the unauthorised charge with our payment provider"],
            ["A paid feature was unavailable because of our error for more than 24 hours in a billing period", "Extend the period by the affected time, or refund the affected portion if you prefer"],
            ["You are a consumer exercising a statutory withdrawal right under section 5", "Refund in accordance with that right"],
            ["You changed your mind mid-period, or did not use the plan", "Not refunded — the period continues to its end; you may cancel to stop renewal"],
            ["Your account was terminated for breaking the Terms", "Not refunded"],
          ]},
        ],
      },
      {
        id: "statutory-rights",
        heading: "5. Your statutory rights",
        blocks: [
          {
            type: "p",
            text: "Consumers in the European Union and the United Kingdom normally have 14 days from the start of a new paid subscription to withdraw from it without giving a reason. Where you ask us to start supplying the service immediately and you acknowledge that you lose the withdrawal right once the service has been fully supplied, the right ends when we have fully performed — for a monthly plan, that means a billing period that has already been supplied in full. If you are within the withdrawal window and have not used the plan, contact us and we will refund the charge.",
          },
          {
            type: "p",
            text: "If you are in the UAE or elsewhere, you keep all rights granted by your mandatory consumer protection law, including where a paid service is not supplied as described. Nothing in this policy excludes or replaces those rights — if there is a conflict, the law prevails.",
          },
          {
            type: "p",
            text: "Business, company and reseller accounts are not consumers for these purposes, and the withdrawal right does not apply to them.",
          },
        ],
      },
      {
        id: "requesting",
        heading: "6. How to request a refund",
        blocks: [
          { type: "ul", items: [
            `Email [${LEGAL_CONTACTS.support}](mailto:${LEGAL_CONTACTS.support}) from the address on your account.`,
            "Include your account email, the plan, the date and amount of the charge, and any Ziina payment or transaction reference you have.",
            "We reply within 5 business days with a decision and the reasons for it.",
            "Approved refunds go back to the original payment method through Ziina, typically within 5–10 business days, depending on your bank. Refunds are made in AED; if your card is in another currency, bank exchange rates may mean the amount you receive differs slightly from the amount charged.",
          ]},
        ],
      },
      {
        id: "chargebacks",
        heading: "7. Chargebacks",
        blocks: [
          {
            type: "p",
            text: "Please contact us before starting a chargeback — most billing problems are fixed in a single reply. If a card issuer opens a dispute, the amount is frozen while the bank investigates, and we may suspend access to the disputed plan until the dispute closes. Fraudulent chargebacks may end in account termination.",
          },
        ],
      },
      {
        id: "changes",
        heading: "8. Changes to this policy",
        blocks: [
          {
            type: "p",
            text: `Version ${LEGAL_DOCUMENT_VERSION}, last updated ${LEGAL_UPDATED}. Refunds are assessed under the policy in force on the date of the charge you are asking about.`,
          },
        ],
      },
      CONTACT_SECTION,
    ],
  },
};

export const LEGAL_ORDER = ["privacy", "terms", "cookies", "refunds"];

export function getLegalDocument(id) {
  return LEGAL_DOCUMENTS[id] || null;
}
