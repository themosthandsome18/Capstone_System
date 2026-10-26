// How the text of Mobile App Content is cleaned and counted, the way the SERVER does it (api/views/mobile_content.py, _clean), so that
// the number the page shows is the number the server will find.
//
// The server counts CODE POINTS (Python len), after cleaning. JavaScript's .length counts UTF-16 units, so an emoji is 2 there and 1
// on the server: a title of 160 emoji is 320 for .length and 160 for the server, and the server allows it. That is why the page counts
// with Array.from(...).length and never uses .length, and why an input of this page has no maxlength (the browser counts like .length).
//
// Cleaning on the server, for a text of ONE line: trimmed, every run of white space (a new line too) made one space. For a text of
// PARAGRAPHS: new lines made "\n", the end of every line trimmed, three or more new lines made two, the whole trimmed. The server
// stays the authority: what comes back from it is what the page shows after a save.

export const countLetters = (text) => Array.from(text == null ? "" : String(text)).length;

export function normalizeLine(text) {
  return (text == null ? "" : String(text)).split(/\s+/).filter(Boolean).join(" ");
}

export function normalizeText(text) {
  const lines = (text == null ? "" : String(text))
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// `kind` is the one the server names for a field: "line" or "text".
export const normalizeFor = (kind, text) => (kind === "text" ? normalizeText(text) : normalizeLine(text));
