// A stand-in for react-router-dom in tests (react-router-dom v7 is ESM that CRA's Jest cannot load). Used as
//   jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
// Navigate renders a marker; useSearchParams is a real, working one: it keeps the query string in state, so a tab
// that is chosen really changes what the page reads next, and every change it is asked for is recorded (with its
// options), so a test can say "in place, not a new entry of the history".
const React = require("react");

const state = { initial: "", changes: [], clicks: [] };

function useSearchParams() {
  const [params, setParams] = React.useState(() => new URLSearchParams(state.initial));
  const change = React.useCallback((next, options) => {
    const value = new URLSearchParams(typeof next === "function" ? next(params) : next);
    state.changes.push({ search: value.toString(), options: options || {} });
    setParams(value);
  }, [params]);
  return [params, change];
}

function Navigate({ to, replace }) {
  return React.createElement("div", { "data-testid": "redirect", "data-to": to, "data-replace": String(Boolean(replace)) });
}

// A real <a href>: it can be read, copied and opened in a new tab. A click is recorded (and does not leave the test page), as a router would go to `to`.
function Link({ to, replace, children, onClick, ...rest }) {
  return React.createElement(
    "a",
    {
      ...rest,
      href: to,
      onClick: (event) => {
        if (onClick) onClick(event);
        state.clicks.push({ to, replace: Boolean(replace) });
        event.preventDefault();
      },
    },
    children
  );
}

module.exports = {
  Navigate,
  Link,
  useSearchParams,
  // the query string the page is opened with, as after a refresh (e.g. "?tab=welcome")
  __setSearch: (search) => {
    state.initial = search;
    state.changes = [];
    state.clicks = [];
  },
  // the links that were clicked, in order: { to, replace }
  __clicks: () => state.clicks,
  __changes: () => state.changes,
};
