/* These tests inspect document metadata rather than rendered form controls. */
/* eslint-disable testing-library/no-node-access */
import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import vm from "vm";
import useDocumentBranding from "../../shared/useDocumentBranding";

jest.mock("react-router-dom", () => require("../../../node_modules/react-router/dist/development/index.js"), { virtual: true });
global.TextEncoder = require("util").TextEncoder;
global.TextDecoder = require("util").TextDecoder;
const { MemoryRouter, useLocation, useNavigate } = require("react-router-dom");
const PublicReportingMetadata = require("./PublicReportingMetadata").default;

const publicDir = path.join(__dirname, "../../../public");
const template = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const source = fs.readFileSync(path.join(publicDir, "reporting-metadata.js"), "utf8");
const portalTitle = "Mauban LGU | Tourism & Sanitary Compliance Portal";
const originalHead = document.head.innerHTML;

function boot(pathname, publicUrl = "") {
  window.history.replaceState({}, "", pathname);
  document.head.innerHTML = template.match(/<head>([\s\S]*?)<\/head>/)[1].replaceAll("%PUBLIC_URL%", publicUrl);
  const script = document.querySelector('script[src$="/reporting-metadata.js"]');
  const currentScript = jest.spyOn(document, "currentScript", "get").mockReturnValue(script);
  vm.runInNewContext(source, { window, document });
  currentScript.mockRestore();
}
function manifestHref() { return document.querySelector('link[rel="manifest"]').getAttribute("href"); }
function appleHref() { return document.querySelector('link[rel="apple-touch-icon"]').getAttribute("href"); }

afterEach(() => {
  delete window.capstoneReportingMetadata;
  document.head.innerHTML = originalHead;
  jest.restoreAllMocks();
});

test("manifest has a stable reporting identity, slash-delimited scope and online-only standalone metadata", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "report-sanitation.webmanifest"), "utf8"));
  expect(manifest).toMatchObject({ name: "Mauban Sanitation Reporting", short_name: "Report Sanitation",
    id: "/report-sanitation/", start_url: "/report-sanitation/", scope: "/report-sanitation/",
    display: "standalone", theme_color: "#07613B", background_color: "#f1f5f4" });
  expect(new URL(manifest.start_url, "https://example.test").pathname.startsWith(manifest.scope)).toBe(true);
  expect(manifest).not.toHaveProperty("serviceworker");
  expect(manifest).not.toHaveProperty("share_target");
});

test("both manifest PNGs exist with actual dimensions matching their declarations", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "report-sanitation.webmanifest"), "utf8"));
  expect(manifest.icons).toHaveLength(2);
  for (const [index, size] of [192, 512].entries()) {
    const icon = manifest.icons[index];
    expect(icon).toMatchObject({ src: `/report-sanitation/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" });
    const png = fs.readFileSync(path.join(publicDir, icon.src.slice(1)));
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
  }
});

test.each(["/report-sanitation", "/report-sanitation/"])("initial HTML selects reporting metadata for %s, including reload", (pathname) => {
  for (let load = 0; load < 2; load += 1) {
    boot(pathname);
    expect(manifestHref()).toBe("/report-sanitation.webmanifest");
    expect(document.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
    expect(appleHref()).toBe("/report-sanitation/icon-192.png");
    expect(document.title).toBe("Mauban Sanitation Reporting");
    expect(document.querySelector('meta[name="apple-mobile-web-app-title"]').content).toBe("Report Sanitation");
    expect(document.querySelector('meta[name="description"]').content).toContain("Internet connection required");
  }
});

test.each(["/", "/login", "/tourism", "/sanitation/permits", "/report-sanitation-other", "/report-sanitation/other"])("initial HTML keeps portal metadata on %s", (pathname) => {
  boot(pathname);
  expect(manifestHref()).toBe("/manifest.json"); expect(appleHref()).toBe("/logo192.png");
  expect(document.title).toBe(portalTitle);
  expect(document.querySelector('meta[name="theme-color"]').content).toBe("#07613B");
  expect(document.querySelector('meta[name="description"]').content).toBe("Official Tourism and Sanitary Compliance Monitoring System - Municipality of Mauban");
  expect(document.querySelector('meta[name="apple-mobile-web-app-title"]')).toBeNull();
});

test("metadata asset links respect the existing PUBLIC_URL asset prefix", () => {
  boot("/report-sanitation", "/assets");
  expect(manifestHref()).toBe("/assets/report-sanitation.webmanifest");
  window.capstoneReportingMetadata.apply("/login");
  expect(manifestHref()).toBe("/assets/manifest.json");
});

function StaffBranding({ module }) {
  useDocumentBranding({ module, pageTitle: "Existing page" });
  return null;
}
function Navigation() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return <>
    <PublicReportingMetadata />
    {pathname.startsWith("/tourism") && <StaffBranding module="tourism" />}
    {pathname.startsWith("/sanitation") && <StaffBranding module="sanitation" />}
    {["/tourism", "/tourism/", "/report-sanitation", "/report-sanitation/", "/sanitation/permits", "/login"].map(url => <button key={url} onClick={() => navigate(url)}>{url}</button>)}
  </>;
}
test("SPA navigation preserves existing module branding and restores reporting metadata after staff cleanup", () => {
  boot("/tourism");
  render(<React.StrictMode><MemoryRouter initialEntries={["/tourism"]}><Navigation /></MemoryRouter></React.StrictMode>);
  expect(document.title).toBe("Existing page | Mauban Tourism");
  fireEvent.click(screen.getByRole("button", { name: "/tourism/", exact: true }));
  expect(document.title).toBe("Existing page | Mauban Tourism");
  fireEvent.click(screen.getByRole("button", { name: "/report-sanitation", exact: true }));
  expect(document.title).toBe("Mauban Sanitation Reporting"); expect(manifestHref()).toBe("/report-sanitation.webmanifest");
  expect(appleHref()).toBe("/report-sanitation/icon-192.png");
  fireEvent.click(screen.getByRole("button", { name: "/report-sanitation/", exact: true }));
  expect(document.title).toBe("Mauban Sanitation Reporting");
  fireEvent.click(screen.getByRole("button", { name: "/sanitation/permits", exact: true }));
  expect(manifestHref()).toBe("/manifest.json"); expect(document.title).toBe("Existing page | Mauban Sanitation");
  fireEvent.click(screen.getByRole("button", { name: "/login", exact: true }));
  expect(document.title).toBe(portalTitle); expect(appleHref()).toBe("/favicon.png");
});

test("metadata selection never registers workers, accesses recovery, fetches APIs or sends requests", () => {
  const previousFetch = window.fetch;
  const fetchSpy = jest.fn(() => { throw new Error("Unexpected request"); });
  window.fetch = fetchSpy;
  const storageSpy = jest.spyOn(Storage.prototype, "setItem");
  const worker = { register: jest.fn() };
  const previous = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: worker });
  try {
    boot("/report-sanitation");
    render(<MemoryRouter initialEntries={["/report-sanitation"]}><PublicReportingMetadata /></MemoryRouter>);
    expect(fetchSpy).not.toHaveBeenCalled(); expect(storageSpy).not.toHaveBeenCalled();
    expect(worker.register).not.toHaveBeenCalled();
    expect(source).not.toMatch(/serviceWorker|\bfetch\s*\(|localStorage|indexedDB|\bcaches\./);
  } finally {
    window.fetch = previousFetch;
    if (previous) Object.defineProperty(navigator, "serviceWorker", previous);
    else delete navigator.serviceWorker;
  }
});
