// A stand-in for react-router-dom in tests (react-router-dom v7 is ESM that CRA's Jest cannot load). Used as
//   jest.mock("react-router-dom", () => require("../testing/routerStub"), { virtual: true });
// Navigate renders a marker; useSearchParams is a real, working one: it keeps the query string in state, so a tab
// that is chosen really changes what the page reads next, and every change it is asked for is recorded (with its
// options), so a test can say "in place, not a new entry of the history".
const React = require("react");

const state = { initial: "", changes: [] };

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

module.exports = {
  Navigate,
  useSearchParams,
  // the query string the page is opened with, as after a refresh (e.g. "?tab=welcome")
  __setSearch: (search) => {
    state.initial = search;
    state.changes = [];
  },
  __changes: () => state.changes,
};
