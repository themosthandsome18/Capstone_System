// A box for a text of ONE line (the title and the short line of a tile): it grows as the text gets longer and wraps it, so that a person can read all
// of what they wrote, but it stays one line: Enter does nothing in it, and a new line that comes in another way (a paste) becomes a space.
// The same behaviour as the title and the subtitle of a block (Commit 5c-fix, MobileContentBlockEditor.js), written once more for the tile
// page so that the editor of the blocks stays as it is. The server cleans the text the same way (every run of white space is one space).

export const NEW_LINES = /\r\n|\r|\n/g;
export const withoutNewLines = (value) => String(value == null ? "" : value).replace(NEW_LINES, " ");

// The box is as high as its text (and no higher). It is made small first so that it can also shrink.
export function fitBox(control) {
  if (!control) return;
  control.style.height = "auto";
  if (control.scrollHeight > 0) {
    const border = Math.max(0, control.offsetHeight - control.clientHeight);
    control.style.height = `${control.scrollHeight + border}px`;
  }
}
