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

// A text of LINES (the port guide: each line is a bullet in the app): every line cleaned as a line, the blank lines gone (api/views/mobile_content.py,
// _clean_lines). The lines are kept apart by a new line; a text with no line at all is "".
export const BULLET = "\u2022";
const splitLines = (text) => (text == null ? "" : String(text)).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

export function linesOf(text) {
  return splitLines(text).map(normalizeLine).filter((line) => line !== "");
}

export const normalizeLines = (text) => linesOf(text).join("\n");

// How many lines the server will find, and the letters of the longest one (the two numbers that the limits of a text of lines are about).
export const lineCount = (text) => linesOf(text).length;
export const longestLine = (text) => linesOf(text).reduce((most, line) => Math.max(most, countLetters(line)), 0);

// The numbers (1, 2, ...) of the lines, counted as the server counts them (after the blank lines are gone), that are longer than `max`.
export function longLines(text, max) {
  return linesOf(text)
    .map((line, index) => ({ number: index + 1, over: countLetters(line) - max }))
    .filter((entry) => entry.over > 0);
}

// The numbers of the lines that start with a bullet: the server refuses them, because the app puts the bullet in front of every line by itself.
export const bulletLines = (text) => linesOf(text).flatMap((line, index) => (line.startsWith(BULLET) ? [index + 1] : []));

// `kind` is the one the server names for a field: "line", "text" or "lines".
export function normalizeFor(kind, text) {
  if (kind === "text") return normalizeText(text);
  if (kind === "lines") return normalizeLines(text);
  return normalizeLine(text);
}
