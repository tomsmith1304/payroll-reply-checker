/* =============================================================================
   Unit tests for analyze() — run with `npm test` (Node's built-in test runner).
   Fixed inputs, one behaviour per test. No DOM, no framework.
   ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";

import { analyze } from "../js/analyzer.js";

/** True if `result.flags` contains a flag with the given tag whose text includes `needle`. */
function hasFlag(result, tag, needle = "") {
  return result.flags.some((f) => f.tag === tag && f.text.includes(needle));
}

/* ---- Compliance ------------------------------------------------------------ */

test("raises a Compliance flag when the customer mentions overtime and the reply ignores it", () => {
  const customer =
    "Two of the guys worked 46 hours this week and I don't see any overtime broken out on the report.";
  const reply = "Thanks for reaching out! The report looks good and is ready to submit.";

  const result = analyze(customer, reply);

  assert.ok(hasFlag(result, "Compliance", "Overtime"), "expected an Overtime compliance flag");
  assert.equal(result.escalation, null);
});

test("no Compliance flag when the reply actually addresses the raised term", () => {
  const customer =
    "Two of the guys worked 46 hours this week and I don't see any overtime broken out on the report.";
  const reply =
    "You're right - the overtime hours were rolled into straight time. I've split the 6 overtime hours out for Dave and Marco and re-run the report.";

  const result = analyze(customer, reply);

  assert.equal(hasFlag(result, "Compliance"), false);
});

test("flags every distinct compliance term the reply leaves untouched", () => {
  const customer =
    "Questions on the certified payroll report: the apprentice ratio looks off and the prevailing wage rate seems low.";
  const reply = "Got it, I'll take a look and circle back.";

  const result = analyze(customer, reply);
  const complianceFlags = result.flags.filter((f) => f.tag === "Compliance");

  assert.equal(complianceFlags.length, 3);
  assert.ok(hasFlag(result, "Compliance", "Certified payroll"));
  assert.ok(hasFlag(result, "Compliance", "Apprentice"));
  assert.ok(hasFlag(result, "Compliance", "Prevailing wage"));
});

test("matches the W-2 synonym variants", () => {
  const result = analyze("Is this worker W-2 status or not?", "Still checking.");
  assert.ok(hasFlag(result, "Compliance", "W-2 status"));
});

/* ---- Escalation ---------------------------------------------------------- */

test("'checks bounced' triggers escalation regardless of what the reply says", () => {
  const customer = "This is the second week in a row our checks bounced.";
  const thoroughReply =
    "I'm so sorry about this. I've escalated the payroll run to our banking team and will update you within the hour with a firm fix.";

  const result = analyze(customer, thoroughReply);

  assert.equal(result.escalation, "checks bounced");
});

test("escalation matching is case-insensitive", () => {
  const result = analyze("Our guys HAVEN'T BEEN PAID and payday was yesterday.", "Looking into it.");
  assert.equal(result.escalation, "haven't been paid");
});

test("no escalation phrase leaves result.escalation null", () => {
  const result = analyze("Quick question about the per diem rate on last week's timesheets.", "Sure - the rate is $75/day for that site.");
  assert.equal(result.escalation, null);
});

/* ---- Tone -------------------------------------------------------------- */

test("flags a reply that is far too brief for a long message", () => {
  const customer =
    "We have a handful of issues on this week's payroll run that I need sorted before the cycle closes on Friday. " +
    "First, the mileage reimbursements are missing for the Albany crew. Second, two timesheets have the wrong cost code. " +
    "Third, one new hire is not showing up in the system at all even though I onboarded him last Monday. Can you walk through each of these?";
  const reply = "Looking into it, will update you soon.";

  const result = analyze(customer, reply);

  assert.ok(hasFlag(result, "Tone", "too brief"));
});

test("flags urgency in the message with no acknowledgement in the reply", () => {
  const customer = "I am extremely frustrated - this is the third time and I need it fixed immediately.";
  const reply = "The payroll run will be reprocessed tonight and funds will land tomorrow.";

  const result = analyze(customer, reply);

  assert.ok(hasFlag(result, "Tone", "does not acknowledge"));
});

test("no urgency tone flag when the reply acknowledges the customer first", () => {
  const customer = "I am extremely frustrated - this is the third time and I need it fixed immediately.";
  const reply =
    "I completely understand the frustration, and I'm sorry this keeps happening. The payroll run will be reprocessed tonight and funds will land tomorrow.";

  const result = analyze(customer, reply);

  assert.equal(hasFlag(result, "Tone", "does not acknowledge"), false);
});

test("flags all-caps shouting but ignores allow-listed acronyms", () => {
  const shouting = analyze("why is my check short", "This was a PAYROLL error, not an FLSA issue.");
  assert.ok(hasFlag(shouting, "Tone", "all-caps text (PAYROLL)"));

  const acronymsOnly = analyze("why is my check short", "This is an FLSA and IRS question for ADP.");
  assert.equal(hasFlag(acronymsOnly, "Tone", "all-caps"), false);
});

/* ---- Clean case ------------------------------------------------------- */

test("a reply that addresses the topic, matches length, and stays calm produces no flags", () => {
  const customer =
    "Quick question on the per diem line for the crew that traveled to the Albany site last week. " +
    "Our policy says $75 a day for jobs more than 50 miles out, but I'm seeing $65 on a few timesheets. " +
    "No rush - next run is fine. Can you confirm the right rate and whether the entered ones need adjusting?";
  const reply =
    "Happy to sort this out. You're right that the Albany site qualifies for the $75 per diem rate since it's past the 50-mile threshold. " +
    "The $65 entries were set at the in-town rate by mistake; I've flagged those timesheets and will correct them to $75 per day before this cycle closes, then send a short summary of what changed.";

  const result = analyze(customer, reply);

  assert.equal(result.escalation, null);
  assert.deepEqual(result.flags, []);
});

/* ---- Shape --------------------------------------------------------- */

test("analyze() always returns { escalation, flags[] } and never mutates the rule tables", () => {
  const result = analyze("", "");
  assert.deepEqual(result, { escalation: null, flags: [] });
  assert.ok(Array.isArray(result.flags));
});
