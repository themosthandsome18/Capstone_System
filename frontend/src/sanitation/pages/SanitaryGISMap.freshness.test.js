import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SanitaryGISMap from "./SanitaryGISMap";
import HouseholdRecords from "./HouseholdRecords";
import { SanitationDataProvider, useSanitationData } from "../context/SanitationDataContext";
import * as api from "../services/sanitationApi";

// Real page/provider behavior; only API transport and Leaflet rendering are controlled.
jest.mock("../services/sanitationApi");
jest.mock("react-router-dom", () => ({ useLocation: () => ({ state: null }), useNavigate: () => jest.fn() }), { virtual: true });
const mockMap = { stop: jest.fn(), flyTo: jest.fn(), fitBounds: jest.fn(), setView: jest.fn() };
jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null, GeoJSON: () => null,
  Popup: ({ children }) => <div>{children}</div>,
  Marker: ({ position, icon, title, children }) => <div data-testid="marker" title={title} data-position={JSON.stringify(position)} data-icon={icon.options.html}>{children}</div>,
  useMap: () => mockMap,
}));
const OLD = { id: 11, household_code: "SYN-GIS", household_head: "Synthetic, Household", barangay: "Alitap",
  address: "Original address", male_count: 2, female_count: 1, total_members: 3,
  toilet_type: "water_sealed", septic_tank_type: "vault_sealed", water_level: "level_3", water_source: "Other",
  waste_disposal: "collected", remarks: "001", status: "good_standing", latitude: 14.14, longitude: 121.715 };
const SAVED = { ...OLD, address: "Authoritative new address", toilet_type: "none", septic_tank_type: null, status: "violation" };
const MOVED = { ...SAVED, latitude: 14.145, longitude: 121.718 };
const EST = { id: 55, business_name: "Synthetic establishment", barangay: "Alitap", compliance_status: "good_standing", latitude: 14.14, longitude: 121.71 };
let rows, establishments, context;
const snapshot = () => ({ barangays: [{ name: "Alitap" }], householdRecords: rows.map(r => ({ ...r })), householdDashboardData: { summary: { totalHouseholds: rows.length }, riskByBarangay: [] } });
function Probe() { context = useSanitationData(); return null; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const gis = () => within(document.querySelector('.sanitary-gis-page'));
const marker = () => gis().getByTestId('marker');
function observe(label) {
 console.info('GIS_FRESHNESS', JSON.stringify({ label, fetches: api.fetchHouseholdRecords.mock.calls.length,
  markers: gis().queryAllByTestId('marker').map(el => ({ title: el.title, position: el.dataset.position, text: el.textContent })),
  alerts: gis().queryAllByRole('alert').map(el => el.textContent) }));
}
beforeEach(() => {
 jest.resetAllMocks(); rows = [{ ...OLD }]; establishments = [{ ...EST }];
 api.fetchSanitationBootstrap.mockImplementation(async () => ({ establishments }));
 api.fetchSanitationReports.mockResolvedValue({});
 api.fetchHouseholdBootstrap.mockImplementation(async () => snapshot());
 api.fetchHouseholdRecords.mockImplementation(async () => rows.map(r => ({ ...r })));
 api.updateHouseholdRecord.mockImplementation(async () => { rows = [{ ...SAVED }]; return { ...SAVED }; });
 api.updateSanitationEstablishment.mockImplementation(async (_id, data) => { establishments = [{ ...EST, ...data }]; return establishments[0]; });
 Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
async function mount(withRecords = false) {
 render(<SanitationDataProvider><Probe /><SanitaryGISMap />{withRecords && <HouseholdRecords />}</SanitationDataProvider>);
 await waitFor(() => expect(context.loading).toBe(false));
 fireEvent.click(gis().getByRole('button', { name: 'Households', exact: true }));
 await waitFor(() => expect(marker()).toHaveAttribute('title', 'Synthetic, Household: Good Standing'));
}
async function edit() {
 fireEvent.click(screen.getByTitle('Edit Household Record'));
 fireEvent.change(screen.getByLabelText('Existing combined address'), { target: { value: SAVED.address } });
 fireEvent.click(screen.getAllByRole('radio', { name: 'None', exact: true })[0]);
 fireEvent.click(screen.getByRole('button', { name: 'Save Changes', exact: true }));
 await waitFor(() => expect(api.updateHouseholdRecord).toHaveBeenCalledTimes(1));
}
async function activate() { await act(async () => { fireEvent.focus(window); fireEvent(document, new Event('visibilitychange')); }); }

test('successful real Household Records edit refreshes the mounted GIS compliance marker', async () => {
 await mount(true); await edit();
 await waitFor(() => expect(context.householdRecords[0].status).toBe('violation'));
 await waitFor(() => expect(context.loading).toBe(false));
 observe('provider saved violation, GIS must follow');
 await waitFor(() => expect(marker()).toHaveAttribute('title', 'Synthetic, Household: Needs Assistance'));
 expect(marker().dataset.icon).toContain('#dc2626');
 expect(within(marker()).getByText(SAVED.address)).toBeVisible();
 expect(api.updateHouseholdRecord.mock.calls[0][1]).not.toHaveProperty('latitude');
});

test('returning to the mounted browser tab reads authoritative address and stored coordinates', async () => {
 await mount(); rows = [{ ...MOVED }]; await activate(); observe('external saved record on activation');
 await waitFor(() => expect(marker()).toHaveAttribute('data-position', '[14.145,121.718]'));
 expect(within(marker()).getByText(MOVED.address)).toBeVisible();
 expect(marker().title).toContain('Needs Assistance');
});

test('rejected Household Records edit does not invent saved GIS data or a successful refresh', async () => {
 await mount(true); api.updateHouseholdRecord.mockRejectedValueOnce(new Error('Synthetic edit rejected'));
 await edit(); await screen.findByText('Synthetic edit rejected'); observe('rejected edit');
 expect(marker()).toHaveAttribute('title', 'Synthetic, Household: Good Standing');
 expect(within(marker()).getByText(OLD.address)).toBeVisible();
 expect(api.fetchHouseholdRecords).toHaveBeenCalledTimes(1);
 expect(context.householdRecords[0]).toEqual(OLD);
});

test('failed activation refresh cannot present old green compliance as verified current', async () => {
 await mount(); api.fetchHouseholdRecords.mockRejectedValueOnce(new Error('Synthetic GIS refresh offline'));
 await activate(); observe('activation refresh failure');
 await waitFor(() => expect(gis().getByRole('alert')).toHaveTextContent(/offline|stale|unverified|unavailable/i));
 // Either hiding old markers or explicitly qualifying them is truthful.
 if (gis().queryAllByTestId('marker').length) expect(gis().getByRole('alert')).toHaveTextContent(/stale|unverified|not current/i);
});

test('activation refresh preserves filters and selected household while updating its payload', async () => {
 await mount(); fireEvent.change(gis().getByLabelText('Barangay:'), { target: { value: 'Alitap' } });
 fireEvent.change(gis().getByLabelText('Status:'), { target: { value: 'good_standing' } });
 fireEvent.click(document.querySelector('.gis-item'));
 rows = [{ ...OLD, address: 'Fresh same-status address' }]; await activate();
 await waitFor(() => expect(within(marker()).getByText('Fresh same-status address')).toBeVisible());
 expect(gis().getByLabelText('Barangay:')).toHaveValue('Alitap');
 expect(gis().getByLabelText('Status:')).toHaveValue('good_standing');
 expect(document.querySelector('.gis-selected-card')).toHaveTextContent(OLD.household_head);
});

test('paired repeated activation events coalesce one pending refresh and never loop', async () => {
 await mount(); const pending = deferred(); api.fetchHouseholdRecords.mockReturnValueOnce(pending.promise);
 await activate(); await activate(); await activate();
 await waitFor(() => expect(api.fetchHouseholdRecords).toHaveBeenCalledTimes(2));
 await act(async () => { pending.resolve([MOVED]); });
 await waitFor(() => expect(marker()).toHaveAttribute('data-position', '[14.145,121.718]'));
 expect(api.fetchHouseholdRecords).toHaveBeenCalledTimes(2);
});

test('late older request cannot overwrite a newer mode re-entry result', async () => {
 await mount(); const old = deferred(); api.fetchHouseholdRecords.mockReturnValueOnce(old.promise);
 fireEvent.click(gis().getByRole('button', { name: 'Establishments', exact: true }));
 fireEvent.click(gis().getByRole('button', { name: 'Households', exact: true }));
 await waitFor(() => expect(api.fetchHouseholdRecords).toHaveBeenCalledTimes(2));
 fireEvent.click(gis().getByRole('button', { name: 'Establishments', exact: true }));
 rows = [MOVED]; fireEvent.click(gis().getByRole('button', { name: 'Households', exact: true }));
 await waitFor(() => expect(marker()).toHaveAttribute('data-position', '[14.145,121.718]'));
 await act(async () => { old.resolve([OLD]); });
 expect(marker()).toHaveAttribute('data-position', '[14.145,121.718]');
 expect(marker().title).toContain('Needs Assistance');
});

test('existing failed mode-entry fetch clears markers and offers retry', async () => {
 await mount(); fireEvent.click(gis().getByRole('button', { name: 'Establishments', exact: true }));
 api.fetchHouseholdRecords.mockRejectedValueOnce(new Error('Synthetic entry failure'));
 fireEvent.click(gis().getByRole('button', { name: 'Households', exact: true }));
 await waitFor(() => expect(gis().getByRole('alert')).toHaveTextContent('Synthetic entry failure'));
 expect(gis().queryAllByTestId('marker')).toHaveLength(0);
 fireEvent.click(gis().getByRole('button', { name: 'Retry household GIS' }));
 await waitFor(() => expect(marker()).toHaveAttribute('title', 'Synthetic, Household: Good Standing'));
});

test('establishment GIS still follows successful real-provider updates', async () => {
 await mount(); fireEvent.click(gis().getByRole('button', { name: 'Establishments', exact: true }));
 await act(async () => { await context.updateEstablishment(55, { business_name: 'Saved establishment' }); });
 expect(marker()).toHaveAttribute('title', 'Saved establishment: Good Standing');
 expect(marker()).toHaveAttribute('data-position', '[14.14,121.71]');
 expect(api.fetchHouseholdRecords).toHaveBeenCalledTimes(1);
});

test.each(['resolve', 'reject'])('provider invalidation supersedes an older activation %s', async completion => {
 await mount(); const older = deferred(); api.fetchHouseholdRecords.mockReturnValueOnce(older.promise);
 await activate(); await waitFor(() => expect(api.fetchHouseholdRecords).toHaveBeenCalledTimes(2));
 rows = [MOVED]; await act(async () => { await context.reloadHouseholds(); });
 await waitFor(() => expect(marker()).toHaveAttribute('data-position', '[14.145,121.718]'));
 await act(async () => { completion === 'resolve' ? older.resolve([OLD]) : older.reject(new Error('Old request failed')); });
 expect(marker()).toHaveAttribute('data-position', '[14.145,121.718]');
 expect(gis().queryByRole('alert')).toBeNull();
 expect(api.fetchHouseholdRecords).toHaveBeenCalledTimes(3);
});

test('older activation success cannot erase a newer failed provider-triggered fetch', async () => {
 await mount(); const older = deferred(); api.fetchHouseholdRecords.mockReturnValueOnce(older.promise);
 await activate(); await waitFor(() => expect(api.fetchHouseholdRecords).toHaveBeenCalledTimes(2));
 api.fetchHouseholdRecords.mockRejectedValueOnce(new Error('Newest GIS request failed'));
 rows = [MOVED]; await act(async () => { await context.reloadHouseholds(); });
 await waitFor(() => expect(gis().getByRole('alert')).toHaveTextContent('Newest GIS request failed'));
 await act(async () => { older.resolve([OLD]); });
 expect(gis().queryAllByTestId('marker')).toHaveLength(0);
 expect(gis().getByRole('alert')).toHaveTextContent('Newest GIS request failed');
});

test('hidden activation does not fetch and complete GIS rows never come from a partial provider snapshot', async () => {
 await mount(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
 await activate(); expect(api.fetchHouseholdRecords).toHaveBeenCalledTimes(1);
 const extra = { ...MOVED, id: 12, household_head: 'Second complete GIS row' };
 rows = [MOVED, extra]; api.fetchHouseholdBootstrap.mockResolvedValueOnce({ ...snapshot(), householdRecords: [MOVED] });
 await act(async () => { await context.reloadHouseholds(); });
 await waitFor(() => expect(gis().getAllByTestId('marker')).toHaveLength(2));
 expect(context.householdRecords).toHaveLength(1);
 expect(gis().getAllByTestId('marker').some(el => el.title.includes('Second complete GIS row'))).toBe(true);
});

test('metadata-only activation refresh does not recenter an already fitted household viewport', async () => {
 await mount(); await waitFor(() => expect(mockMap.setView).toHaveBeenCalledWith([14.14, 121.715], 15, { animate: false }));
 const before = mockMap.setView.mock.calls.length;
 rows = [{ ...OLD, address: 'Metadata-only address' }]; await activate();
 await waitFor(() => expect(within(marker()).getByText('Metadata-only address')).toBeVisible());
 await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
 expect(mockMap.setView).toHaveBeenCalledTimes(before);
});
