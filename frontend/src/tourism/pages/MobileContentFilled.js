import { Fragment } from "react";

// The parts of a text, drawn (the parts come from previewParts): what was filled in has a soft tint, what could not be filled in (or is not a
// placeholder) is marked. The same drawing as the editor of the blocks and the page of a tile use; written once more here so that the tab of the
// Travel Guide needs neither of them.
export function Parts({ parts }) {
  return parts.map((part, index) => {
    if (part.kind === "text") return <Fragment key={index}>{part.text}</Fragment>;
    const bad = part.kind === "missing" || part.kind === "unknown";
    return (
      <span key={index} className={bad ? "mobile-content-missing" : "mobile-content-filled"} title={part.token} data-kind={part.kind}>
        {part.text}
      </span>
    );
  });
}
