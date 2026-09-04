/* =============================================================================
   app.js — browser glue for the Payroll Reply Checker
   -----------------------------------------------------------------------------
   Loaded as an ES module (<script type="module">). Owns everything the core
   analyzer deliberately does not: the sample tickets, turning an analysis
   result into DOM / plain text, and wiring up the controls.

   Sections:
     1. EXAMPLE TICKETS — the three canned cases behind the pill buttons
     2. RENDERING       — result -> HTML, result -> clipboard text
     3. EVENT WIRING    — DOM refs, run(), example loading, copy button, init
   ========================================================================== */

import { analyze } from "./analyzer.js";

/* -----------------------------------------------------------------------------
   1. EXAMPLE TICKETS
   -------------------------------------------------------------------------- */

/**
 * Canned customer/reply pairs. `compliance` and `escalation` each demonstrate a
 * failure mode; `clean` shows a ready-to-send reply so the tool also has a
 * visible positive state. `blank` resets both fields.
 *
 * @type {Record<string, { id: string, customer: string, reply: string }>}
 */
const EXAMPLES = {
  compliance: {
    id: "TCKT-3381 · Certified payroll question",
    customer:
      "Going through the certified payroll report for this week before we submit Friday morning, and a couple of things are not sitting right. We have an apprentice logged at the journeyman rate on line 4, but our approved ratio only allows him at 60% until his next step-up. Separately, Dave and Marco both show 46 hours this week and there is no overtime broken out on the report - everything is rolled into straight time. The compliance deadline is Friday morning and this needs to be fixed before it goes anywhere near the GC. Can someone take a look today?",
    reply:
      "Hi there, thanks for reaching out! Everything looks good and the report is ready to go. Let us know if you need anything else!",
  },
  escalation: {
    id: "TCKT-3402 · Payroll did not go through",
    customer:
      "This is the second week in a row our checks bounced. Three of our carpenters just called me because their direct deposits failed again this morning. Payday was supposed to be today and there are guys standing on a job site right now asking where their money is. I need this fixed right now.",
    reply:
      "Thanks for flagging this - we will look into the payroll run and get back to you within one to two business days.",
  },
  clean: {
    id: "TCKT-3417 · Per diem rate check",
    customer:
      "Quick question on the per diem line for the crew that traveled to the Albany site last week. Our policy sheet says $75 a day for jobs more than 50 miles out, but I'm seeing $65 on a few of the timesheets and I want to make sure we're applying the right rate before this cycle closes. No rush - the next payroll run is fine. Can you confirm which rate should be used, and whether the ones already entered need adjusting?",
    reply:
      "Thanks for checking on this before the run - happy to sort it out. You're right that the Albany site qualifies for the $75 per diem rate, since it is more than the 50-mile threshold in the policy. The $65 entries were set at the in-town rate by mistake. I have flagged the affected timesheets and will correct them to $75 per day before this cycle closes, then send you a short summary of what changed so you can confirm. Nothing further needed on your end for now.",
  },
  blank: {
    id: "TCKT-0000 · New ticket",
    customer: "",
    reply: "",
  },
};

/* -----------------------------------------------------------------------------
   2. RENDERING
   -------------------------------------------------------------------------- */

/** Severity -> sort weight, so critical rows come first. */
const SEVERITY_ORDER = { critical: 0, warn: 1, ok: 2 };

/**
 * Escape the five HTML-significant characters. Current inputs to the result
 * markup are all trusted constants, but rendering stays defensive on principle.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Count flags by check so the coverage pills can show a per-check tally.
 *
 * @param {import("./analyzer.js").Flag[]} flags
 * @returns {{ compliance: number, tone: number }}
 */
function countByTag(flags) {
  return {
    compliance: flags.filter((f) => f.tag === "Compliance").length,
    tone: flags.filter((f) => f.tag === "Tone").length,
  };
}

/**
 * Build the results-panel markup for one analysis result.
 *
 * @param {import("./analyzer.js").AnalysisResult} result
 * @returns {string} HTML string for injection into #results
 */
function buildResultsHtml(result) {
  const { escalation, flags } = result;
  const { compliance, tone } = countByTag(flags);
  let html = "";

  // Coverage pills: one per check, clear / warn / critical.
  html +=
    '<div class="coverage-row">' +
    '<span class="coverage-pill ' +
    (escalation ? "is-critical" : "is-clear") +
    '">Escalation' +
    (escalation ? " flagged" : " clear") +
    "</span>" +
    '<span class="coverage-pill ' +
    (compliance ? "is-warn" : "is-clear") +
    '">Compliance' +
    (compliance ? " · " + compliance : " clear") +
    "</span>" +
    '<span class="coverage-pill ' +
    (tone ? "is-warn" : "is-clear") +
    '">Tone' +
    (tone ? " · " + tone : " clear") +
    "</span>" +
    "</div>";

  // Red banner for anything payroll-blocking.
  if (escalation) {
    html +=
      '<div class="banner">' +
      '<span class="banner-icon" aria-hidden="true"></span>' +
      "<div>" +
      '<div class="banner-title">Payroll-blocking - escalate immediately</div>' +
      '<div class="banner-detail">Customer message matches an escalation pattern: <code>' +
      escapeHtml(escalation) +
      "</code></div>" +
      "</div>" +
      "</div>";
  }

  // One-line summary chip.
  const chipSeverity = escalation ? "critical" : flags.length ? "warn" : "ok";
  const totalCount = flags.length + (escalation ? 1 : 0);
  let chipLabel;
  if (escalation) {
    chipLabel = totalCount + (totalCount === 1 ? " issue - escalation" : " issues - escalation");
  } else if (flags.length) {
    chipLabel = flags.length + (flags.length === 1 ? " issue found" : " issues found");
  } else {
    chipLabel = "No issues found";
  }

  html +=
    '<div class="summary-row">' +
    '<span class="chip chip-' +
    chipSeverity +
    '">' +
    escapeHtml(chipLabel) +
    "</span>" +
    '<span class="summary-note">Checked against compliance keywords, escalation language, and tone patterns.</span>' +
    "</div>";

  // Flag list (or the all-clear row).
  html += '<div class="flag-list">';
  if (flags.length === 0 && !escalation) {
    html +=
      '<div class="flag-row flag-ok"><div class="flag-tag">OK</div><div class="flag-body">' +
      '<div class="flag-text">No compliance or tone issues detected. The reply addresses the topics raised and reads clearly.</div>' +
      "</div></div>";
  } else {
    const ordered = [...flags].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
    for (const f of ordered) {
      html +=
        '<div class="flag-row flag-' +
        f.severity +
        '"><div class="flag-tag">' +
        escapeHtml(f.tag) +
        '</div><div class="flag-body"><div class="flag-text">' +
        escapeHtml(f.text) +
        "</div></div></div>";
    }
  }
  html += "</div>";

  return html;
}

/**
 * Flatten an analysis result into plain text for the "Copy results" button —
 * the shape someone would paste into a ticket note or a Slack thread.
 *
 * @param {import("./analyzer.js").AnalysisResult} result
 * @param {string} ticketId
 * @returns {string}
 */
function buildResultsText(result, ticketId) {
  const { escalation, flags } = result;
  const { compliance, tone } = countByTag(flags);
  const lines = ["Payroll Reply Checker - review results", `Ticket: ${ticketId}`, ""];

  const total = flags.length + (escalation ? 1 : 0);
  let summary;
  if (escalation) summary = `${total} ${total === 1 ? "issue" : "issues"} - escalation`;
  else if (flags.length) summary = `${flags.length} ${flags.length === 1 ? "issue" : "issues"} found`;
  else summary = "No issues found";

  lines.push(`Summary: ${summary}`);
  lines.push(
    "Coverage: " +
      `Escalation ${escalation ? "flagged" : "clear"} · ` +
      `Compliance ${compliance || "clear"} · ` +
      `Tone ${tone || "clear"}`,
  );
  lines.push("");

  if (escalation) {
    lines.push("ESCALATION - payroll-blocking, escalate immediately");
    lines.push(`  Customer message matches an escalation pattern: "${escalation}"`);
    lines.push("");
  }

  if (flags.length) {
    const ordered = [...flags].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
    for (const f of ordered) lines.push(`[${f.tag}] ${f.text}`);
  } else if (!escalation) {
    lines.push(
      "[OK] No compliance or tone issues detected. The reply addresses the topics raised and reads clearly.",
    );
  }

  return lines.join("\n");
}

/* -----------------------------------------------------------------------------
   3. EVENT WIRING
   -------------------------------------------------------------------------- */

const els = {
  customer: document.getElementById("customer-msg"),
  reply: document.getElementById("draft-reply"),
  results: document.getElementById("results"),
  ticketId: document.getElementById("ticket-id"),
  runBtn: document.getElementById("run-btn"),
  copyBtn: document.getElementById("copy-btn"),
  switchBtns: document.querySelectorAll(".pill-btn[data-example]"),
};

/** Most recent analysis, kept so the copy button has something to serialize. */
let lastResult = null;
let copyResetTimer = 0;

const WAITING_HTML =
  '<div class="flag-row"><div class="flag-tag">Waiting</div><div class="flag-body">' +
  '<div class="flag-text">Paste a customer message and draft reply, or load an example, then click Review.</div>' +
  "</div></div>";

/**
 * Read both textareas, run the analyzer, and paint the results panel. Called on
 * "Review reply" and whenever an example is loaded. The #results container is an
 * aria-live region, so replacing its contents announces the outcome.
 *
 * @returns {void}
 */
function run() {
  const customer = els.customer.value;
  const reply = els.reply.value;

  if (!customer.trim() && !reply.trim()) {
    lastResult = null;
    els.results.innerHTML = WAITING_HTML;
    setCopyEnabled(false);
    return;
  }

  lastResult = analyze(customer, reply);
  els.results.innerHTML = buildResultsHtml(lastResult);
  setCopyEnabled(true);
}

/**
 * Load one of the {@link EXAMPLES} into the form and re-run the checks.
 *
 * @param {keyof typeof EXAMPLES} key
 * @returns {void}
 */
function loadExample(key) {
  const example = EXAMPLES[key];
  if (!example) return;

  els.customer.value = example.customer;
  els.reply.value = example.reply;
  els.ticketId.textContent = example.id;
  els.switchBtns.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.example === key);
    btn.setAttribute("aria-pressed", String(btn.dataset.example === key));
  });
  run();
}

/**
 * Toggle the copy button's availability and reset its transient "Copied" state.
 *
 * @param {boolean} enabled
 * @returns {void}
 */
function setCopyEnabled(enabled) {
  if (!els.copyBtn) return;
  els.copyBtn.disabled = !enabled;
  els.copyBtn.classList.remove("is-copied");
  els.copyBtn.textContent = "Copy results";
}

/**
 * Copy the current results as plain text, with a synchronous fallback for
 * browsers without the async clipboard API (or a denied permission).
 *
 * @returns {Promise<void>}
 */
async function copyResults() {
  if (!lastResult) return;
  const text = buildResultsText(lastResult, els.ticketId.textContent.trim());

  let ok = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch {
    ok = false;
  }
  if (!ok) ok = legacyCopy(text);

  els.copyBtn.classList.toggle("is-copied", ok);
  els.copyBtn.textContent = ok ? "Copied ✓" : "Copy failed";
  window.clearTimeout(copyResetTimer);
  copyResetTimer = window.setTimeout(() => setCopyEnabled(!els.copyBtn.disabled), 1800);
}

/**
 * Fallback clipboard write via a temporary textarea + execCommand.
 *
 * @param {string} text
 * @returns {boolean} whether the copy succeeded
 */
function legacyCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/** Attach listeners and load the default example. */
function init() {
  els.switchBtns.forEach((btn) => {
    btn.addEventListener("click", () => loadExample(btn.dataset.example));
  });
  els.runBtn.addEventListener("click", run);
  if (els.copyBtn) els.copyBtn.addEventListener("click", copyResults);
  loadExample("compliance");
}

init();

export { EXAMPLES, buildResultsHtml, buildResultsText };
