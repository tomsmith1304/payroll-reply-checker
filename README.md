# Payroll Reply Checker

A second pair of eyes for AI-drafted payroll support replies. Paste the customer
message and the draft reply; it flags **compliance** terms the reply ignores,
**escalation** language that should block a send, and **tone** problems — then
lets you copy the findings straight into a ticket note.

Every check runs in the browser. **No backend, no API calls, nothing leaves the
page** — that's a deliberate positioning choice, not a limitation. The whole
thing is a zero-build static site.

## Project layout

```
index.html            Markup only — head/meta, the ticket form, the results panel
css/styles.css        The visual design system (ink/paper/blueprint-blue, IBM Plex)
js/analyzer.js        Core logic: rule tables + analyze(). Pure, no DOM. ES module.
js/app.js             Browser glue: example tickets, result rendering, event wiring
test/analyze.test.js  Unit tests for analyze() (Node's built-in test runner)
scripts/generate-og.mjs  Regenerates assets/og-image.png from the brand palette
assets/og-image.png   1200×630 social-share card
favicon.svg           Tab / bookmark icon
```

`analyzer.js` is deliberately split from `app.js`: it has no `window`, no
`document`, and no side effects, so it can be unit-tested directly and reused
anywhere. `app.js` imports `analyze()` and owns everything DOM.

## Running it locally

Because the JS uses native ES modules, open it through a static server rather than
`file://`:

```
npx serve .
# or: python -m http.server
```

Then visit the printed URL.

## Tests

```
npm test          # runs test/analyze.test.js once
npm run test:watch
```

No dependencies to install — the suite uses Node's built-in `node:test` runner
(Node 18+). It exercises `analyze()` against fixed inputs, including:

- a message that raises **overtime** with a reply that ignores it → a Compliance flag
- a message containing **"checks bounced"** → escalation, regardless of the reply
- case-insensitive escalation matching and multi-synonym compliance terms
- tone checks: over-brief replies, urgency with no acknowledgement, ALL-CAPS
  (with an acronym allow-list)
- a clean customer/reply pair → no escalation, zero flags

## Regenerating the share image

```
npm run og        # rewrites assets/og-image.png
```

The card is drawn straight into a pixel buffer and encoded with Node's built-in
`zlib` — no image tooling or dependencies. Edit the copy or palette in
`scripts/generate-og.mjs` and re-run.

## Deploy to Vercel

Still no config. **Add New → Project → Import** the repo, framework preset
**Other**, no build command, no output directory — Vercel serves `index.html`
at the root and the `css/`, `js/`, and `assets/` folders alongside it. The
`package.json` is dev-only (tests + the OG script); there is no build step.

Or straight from this folder:

```
npx vercel --prod
```

The canonical / `og:` URLs in `index.html` assume
`https://payroll-reply-checker.vercel.app/`. If the deployed domain differs,
update the `<link rel="canonical">`, `og:image`, and `twitter:image` values to
match (they need absolute URLs to unfurl).

## What changed from the first version

The original was a single `index.html` with an inline `<style>` and `<script>`.
This revision keeps the concept and the visual design system identical and:

- **Split** the file into `index.html` + `css/styles.css` + `js/analyzer.js` +
  `js/app.js`. Still zero-build.
- **Extracted** the rule data and `analyze()` into a pure, importable module with
  JSDoc types, and added the `test/` suite above with a `test` script.
- **Added** `<meta>` description, Open Graph + Twitter card tags, a real
  `favicon.svg`, and a generated `og-image.png` so the tab and shared-link
  previews look finished.
- **Added** a third example — a clean, ready-to-send reply — so the tool shows
  its positive state, not only the two flawed cases.
- **Added** an `aria-live` region on the results panel so flags are announced to
  screen readers, `aria-pressed` on the example buttons, and a shared
  `:focus-visible` ring across every control. Audited contrast: interactive
  controls and body copy meet WCAG AA; a few muted labels were nudged from
  `--ink-faint` to `--ink-soft` while leaving the palette tokens themselves
  untouched.
- **Added** a "Copy results" button that serializes the flags to plain text for
  pasting into a ticket or Slack thread.
