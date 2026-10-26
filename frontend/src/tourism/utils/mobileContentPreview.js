// The preview of a text of Mobile App Content: what a visitor will read once the server has filled in the {placeholders} (Commit 5c).
//
// This is a SECOND implementation of the filling the server does (api/services/mobile_content.py, fill): one pass over the text, a placeholder
// the table knows is replaced, one it does not know stays as written, what is put in is never read again. Its test holds it to the REAL value the
// server sends (mobile/test/data/app_content_commit3.json), so the two cannot drift apart without a test failing.
//
// The only thing the preview adds is {name}: the server leaves it for the app, and the preview shows the guest's name.
import { GUEST_NAME } from "./mobileContentBuiltIn";

export const FEE_NOT_AVAILABLE = "[fee not available]";
export const PLACEHOLDER = /\{[^{}]*\}/g; // the same definition as the server's

const isAmount = (value) => typeof value === "number" && Number.isFinite(value);

// Where the amounts and the place come from: the answer of the list (`fee`, and the body of the block `fee_office`). Anything can be
// missing; nothing here may throw.
export function previewContext(data) {
  const fee = data && typeof data === "object" && data.fee && typeof data.fee === "object" ? data.fee : {};
  const blocks = data && Array.isArray(data.blocks) ? data.blocks : [];
  const office = blocks.find((block) => block && block.key === "fee_office");
  return {
    regular: isAmount(fee.regular) ? fee.regular : null,
    discounted: isAmount(fee.discounted) ? fee.discounted : null,
    office: office && typeof office.body === "string" && office.body.trim() !== "" ? office.body.trim() : null,
  };
}

// -> { parts, officeMissing, feeMissing, usesName }
//   parts: [{ kind: "text" | "filled" | "name" | "missing" | "unknown", text, token? }]
//   officeMissing: the text says {fee_office} and there is no place to put in
//   feeMissing: the text says {fee_regular} or {fee_discounted} and that amount could not be read
//   usesName: the text says {name}, shown here as the guest's name
// `allowed` is the list of the placeholders the server allows in this field; a token outside it is marked "unknown".
export function previewParts(text, context, allowed = []) {
  const source = text == null ? "" : String(text);
  const result = { parts: [], officeMissing: false, feeMissing: false, usesName: false };
  let last = 0;
  const push = (part) => result.parts.push(part);
  for (const found of source.matchAll(PLACEHOLDER)) {
    if (found.index > last) push({ kind: "text", text: source.slice(last, found.index) });
    last = found.index + found[0].length;
    const name = found[0].slice(1, -1);
    if (name === "fee_regular" || name === "fee_discounted") {
      const amount = name === "fee_regular" ? context.regular : context.discounted;
      if (amount === null) {
        result.feeMissing = true;
        push({ kind: "missing", text: FEE_NOT_AVAILABLE, token: found[0] });
      } else {
        push({ kind: "filled", text: `₱${amount}`, token: found[0] });
      }
    } else if (name === "fee_office") {
      if (context.office === null) {
        result.officeMissing = true;
        push({ kind: "missing", text: found[0], token: found[0] });
      } else {
        push({ kind: "filled", text: context.office, token: found[0] });
      }
    } else if (name === "name") {
      result.usesName = true;
      push({ kind: "name", text: GUEST_NAME, token: found[0] });
    } else {
      push({ kind: "unknown", text: found[0], token: found[0] });
    }
  }
  if (last < source.length) push({ kind: "text", text: source.slice(last) });
  // a token outside the list the server allows is marked, even when the table knows its name (e.g. {name} in a text that may not use it)
  result.parts = result.parts.map((part) =>
    part.token && !allowed.includes(part.token.slice(1, -1)) && allowed.length ? { ...part, kind: "unknown", text: part.token } : part
  );
  return result;
}

export const previewText = (parts) => parts.map((part) => part.text).join("");

// -> the warnings (never a refusal) for a text before it is saved. The server is the authority: it will say more, and it may say less.
//    Only two things are looked for, the two the server's own list of refusals starts with: a placeholder that is not on the allowed list,
//    and a curly bracket that has no partner. (A fee amount typed by hand is NOT looked for: the server alone says that.)
export function placeholderWarnings(text, allowed) {
  const source = text == null ? "" : String(text);
  const warnings = [];
  const seen = new Set();
  for (const found of source.matchAll(PLACEHOLDER)) {
    const name = found[0].slice(1, -1);
    if (!allowed.includes(name) && !seen.has(found[0])) {
      seen.add(found[0]);
      warnings.push(`${found[0]} is not one of the placeholders listed above, so this text will be refused when you save.`);
    }
  }
  const rest = source.replace(PLACEHOLDER, "");
  if (rest.includes("{") || rest.includes("}")) {
    warnings.push("A curly bracket in this text has no partner, so this text will be refused when you save.");
  }
  return warnings;
}

// The text with `token` put in place of the selection (or at the end when the position is not known).
export function insertAt(value, token, start, end) {
  const text = value == null ? "" : String(value);
  const from = Number.isInteger(start) ? Math.min(Math.max(start, 0), text.length) : text.length;
  const to = Number.isInteger(end) ? Math.min(Math.max(end, from), text.length) : from;
  return { value: text.slice(0, from) + token + text.slice(to), caret: from + token.length };
}
