/* =============================================================================
   analyzer.js — the checker's core logic
   -----------------------------------------------------------------------------
   Pure functions only. No DOM, no network, no `window`. Everything here is
   deterministic string analysis so it can be unit-tested directly (see
   test/analyze.test.js) and reused anywhere.

   Sections:
     1. RULE DATA   — the keyword / phrase / pattern tables the checks run on
     2. ANALYSIS    — wordCount() helper and the analyze() entry point
   ========================================================================== */

/* -----------------------------------------------------------------------------
   1. RULE DATA
   -------------------------------------------------------------------------- */

/**
 * Compliance vocabulary. If the customer message contains any `synonyms` entry
 * and the draft reply contains none of them, that topic is flagged as unaddressed.
 * `label` is the human-readable name shown in the flag text.
 *
 * @type {ReadonlyArray<{ label: string, synonyms: string[] }>}
 */
export const COMPLIANCE_TERMS = [
  { label: "Certified payroll", synonyms: ["certified payroll"] },
  { label: "Prevailing wage", synonyms: ["prevailing wage"] },
  { label: "Apprentice ratio or rate", synonyms: ["apprentice"] },
  { label: "Overtime", synonyms: ["overtime"] },
  { label: "Union rules", synonyms: ["union"] },
  { label: "Per diem", synonyms: ["per diem"] },
  { label: "Fringe benefits", synonyms: ["fringe"] },
  { label: "Worker misclassification", synonyms: ["misclassif"] },
  { label: "1099 contractor status", synonyms: ["1099"] },
  { label: "W-2 status", synonyms: ["w-2", "w2 status"] },
  { label: "FLSA", synonyms: ["flsa"] },
  { label: "Davis-Bacon Act", synonyms: ["davis-bacon", "davis bacon"] },
];

/**
 * Payroll-blocking phrases. A single match anywhere in the customer message
 * trips the escalation banner regardless of what the reply says.
 *
 * @type {ReadonlyArray<string>}
 */
export const ESCALATION_PHRASES = [
  "checks bounced", "check bounced", "did not run", "didn't run",
  "have not been paid", "haven't been paid", "has not been paid", "hasn't been paid",
  "missed pay date", "missed payday", "no paycheck", "failed again",
  "direct deposit failed", "payroll did not process", "payroll didn't process",
];

/** Words in the customer message that signal urgency or frustration. */
export const URGENCY_WORDS = [
  "asap", "urgent", "immediately", "right now", "furious", "frustrated",
  "upset", "worried", "angry", "please help", "deadline",
];

/** Phrases in the reply that count as acknowledging the customer's state. */
export const EMPATHY_WORDS = [
  "sorry", "apologize", "understand", "appreciate", "hear you", "that sounds",
  "frustrating", "thanks for your patience", "i know this is",
];

/** All-caps tokens that are legitimate acronyms, not shouting. */
export const CAPS_ALLOWLIST = ["FLSA", "OSHA", "IRS", "NYC", "USA", "ADP", "ASAP"];

/* -----------------------------------------------------------------------------
   2. ANALYSIS
   -------------------------------------------------------------------------- */

/**
 * Count whitespace-delimited words in a string.
 *
 * @param {string} str
 * @returns {number} word count (0 for empty / whitespace-only input)
 */
export function wordCount(str) {
  const trimmed = str.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * @typedef {Object} Flag
 * @property {"warn" | "critical" | "ok"} severity  rendering + sort weight
 * @property {"Compliance" | "Tone"}       tag       which check produced it
 * @property {string}                      text      human-readable explanation
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {string | null} escalation  the matched escalation phrase, or null
 * @property {Flag[]}        flags       compliance + tone findings (unsorted)
 */

/**
 * Run every check against a customer message / draft reply pair.
 *
 * The three checks are independent:
 *   - Escalation: any {@link ESCALATION_PHRASES} match in the customer message.
 *   - Compliance: any {@link COMPLIANCE_TERMS} topic the customer raises that
 *     the reply never mentions.
 *   - Tone: reply far shorter than the message, urgency with no acknowledgement,
 *     or all-caps shouting in the reply.
 *
 * Matching is case-insensitive, substring-based, and entirely local — no model
 * call, nothing leaves the caller.
 *
 * @param {string} customer  the customer's message
 * @param {string} reply     the draft reply under review
 * @returns {AnalysisResult}
 */
export function analyze(customer, reply) {
  const cLower = customer.toLowerCase();
  const rLower = reply.toLowerCase();
  /** @type {Flag[]} */
  const flags = [];

  // --- Escalation: first matching phrase wins ------------------------------
  let escalation = null;
  for (const phrase of ESCALATION_PHRASES) {
    if (cLower.includes(phrase)) {
      escalation = phrase;
      break;
    }
  }

  // --- Compliance: topic raised by customer, absent from reply -----------
  for (const term of COMPLIANCE_TERMS) {
    const raised = term.synonyms.some((s) => cLower.includes(s));
    if (!raised) continue;
    const addressed = term.synonyms.some((s) => rLower.includes(s.trim()));
    if (!addressed) {
      flags.push({
        severity: "warn",
        tag: "Compliance",
        text: `Customer raised "${term.label}" - the reply does not address it.`,
      });
    }
  }

  // --- Tone: brevity relative to the message ----------------------------
  const cWords = wordCount(customer);
  const rWords = wordCount(reply);
  if (cWords > 40 && rWords > 0 && rWords < 25) {
    flags.push({
      severity: "warn",
      tag: "Tone",
      text: `Reply is only ${rWords} words for a ${cWords}-word message - likely too brief to cover what was raised.`,
    });
  }

  // --- Tone: urgency with no acknowledgement ----------------------------
  const urgent = URGENCY_WORDS.some((w) => cLower.includes(w));
  const empathetic = EMPATHY_WORDS.some((w) => rLower.includes(w));
  if (urgent && reply.trim() && !empathetic) {
    flags.push({
      severity: "warn",
      tag: "Tone",
      text: "Message reads urgent or frustrated, but the reply does not acknowledge that before jumping to the fix.",
    });
  }

  // --- Tone: all-caps shouting in the reply ---------------------------
  const capsMatches = reply.match(/\b[A-Z]{4,}\b/g) || [];
  const shouty = capsMatches.filter((w) => !CAPS_ALLOWLIST.includes(w));
  if (shouty.length) {
    flags.push({
      severity: "warn",
      tag: "Tone",
      text: `Reply contains all-caps text (${shouty.join(", ")}) - reads as shouting.`,
    });
  }

  return { escalation, flags };
}
