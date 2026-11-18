import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import FrontPhoto from "./FrontPhoto";
import { uploadFrontPhoto, validatePhotoFile } from "../services/frontPhotoApi";

const response = (status = 200) => ({ ok: status === 200, status,
  headers: { get: () => "image/png" }, blob: async () => new Blob(["fake-image"], { type: "image/png" }),
  json: async () => ({ has_front_photo: true, cleanup_pending: true }) });
const png = () => new File(["synthetic"], "front.png", { type: "image/png" });
beforeEach(() => {
  localStorage.setItem("capstone_auth_token", "synthetic-session");
  global.fetch = jest.fn().mockResolvedValue(response());
  let number = 0; URL.createObjectURL = jest.fn(() => `blob:photo-${++number}`);
  URL.revokeObjectURL = jest.fn();
});
afterEach(() => { localStorage.clear(); jest.restoreAllMocks(); });

describe.each([['household', 'Household', 'households/records'], ['establishment', 'Establishment', 'sanitation/establishments']])('%s photos', (kind, title, path) => {
  const open = () => render(<FrontPhoto kind={kind} recordId={71} />);
  // The picker's accessible name contains its visible label, which follows the saved/selected state.
  const pickerName = new RegExp(`^(Choose|Replace|Choose a different) ${kind} front photo$`);
  const select = file => fireEvent.change(screen.getByLabelText(pickerName), { target: { files: [file] } });
  test('preview, create and refreshed display use authenticated multipart PUT', async () => {
    fetch.mockResolvedValueOnce(response(404)); open();
    await screen.findByText('No front photo saved.');
    const file = png(); select(file);
    expect(screen.getByAltText(`${title} selected preview`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));
    await screen.findByText('Photo saved. Refreshing the saved image.');
    await screen.findByAltText(`${title} frontage`);
    const [url, options] = fetch.mock.calls.find(([, opt]) => opt.method === 'PUT');
    expect(url).toContain(`/${path}/71/front-photo/`);
    expect(options.headers).toEqual({ Authorization: 'Token synthetic-session' });
    expect([...options.body.keys()]).toEqual(['photo']); expect(options.body.get('photo')).toBe(file);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(screen.queryByAltText(`${title} selected preview`)).not.toBeInTheDocument();
  });
  test('replacement keeps saved image during upload, prevents duplicates and refreshes', async () => {
    open(); const saved = await screen.findByAltText(`${title} frontage`);
    const old = saved.getAttribute('src'); select(png());
    let finish; fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const save = screen.getByRole('button', { name: 'Replace photo' });
    fireEvent.click(save); fireEvent.click(save);
    expect(save).toBeDisabled(); expect(screen.getByText('Uploading photo. Please wait.')).toBeInTheDocument();
    expect(saved).toHaveAttribute('src', old);
    await act(async () => finish(response()));
    await waitFor(() => expect(screen.getByAltText(`${title} frontage`)).not.toHaveAttribute('src', old));
    expect(fetch.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(old);
  });
  test('failed upload preserves saved display and requires reload before retry', async () => {
    open(); const saved = await screen.findByAltText(`${title} frontage`); const old = saved.getAttribute('src');
    select(png()); fetch.mockResolvedValueOnce(response(503));
    fireEvent.click(screen.getByRole('button', { name: 'Replace photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed');
    expect(saved).toHaveAttribute('src', old);
    expect(screen.getByRole('button', { name: 'Replace photo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload photo' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace photo' })).toBeEnabled());
  });
  test('invalid and oversized selections send no upload', async () => {
    open(); await screen.findByAltText(`${title} frontage`);
    for (const file of [new File(['x'], 'a.txt', { type: 'text/plain' }), new File([new Uint8Array(5*1024*1024+1)], 'a.png', { type: 'image/png' })]) {
      select(file); expect(screen.getByRole('alert')).toHaveTextContent('JPEG or PNG up to 5 MiB');
      expect(screen.queryByRole('button', { name: 'Replace photo' })).not.toBeInTheDocument();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test('same-tab session change clears both images and late upload cannot restore them', async () => {
    open(); await screen.findByAltText(`${title} frontage`); select(png());
    let finish; fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace photo' }));
    act(() => { localStorage.setItem('capstone_auth_token', 'new-session'); window.dispatchEvent(new Event('capstone-auth-changed')); });
    await act(async () => finish(response()));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sign in again');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-2');
  });
  test('unmount revokes preview and saved resources', async () => {
    const view = open(); await screen.findByAltText(`${title} frontage`); select(png()); view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-2');
  });
  test('empty box is hidden while a file is selected and returns when no photo and no selection', async () => {
    fetch.mockResolvedValueOnce(response(404)); open();
    expect(await screen.findByText('No front photo saved.')).toBeInTheDocument();
    select(png());
    expect(screen.getByAltText(`${title} selected preview`)).toBeInTheDocument();
    expect(screen.queryByText('No front photo saved.')).not.toBeInTheDocument();
    select(new File(['x'], 'a.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent('JPEG or PNG up to 5 MiB');
    expect(screen.queryByAltText(`${title} selected preview`)).not.toBeInTheDocument();
    expect(screen.getByText('No front photo saved.')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test.each([401,403])('authorization %i disables photo selection', async status => {
    fetch.mockResolvedValue(response(status)); open(); await screen.findByRole('alert');
    expect(screen.getByLabelText(`Choose ${kind} front photo`)).toBeDisabled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
test('JPEG is accepted and session mismatch prevents PUT', async () => {
  expect(() => validatePhotoFile(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).not.toThrow();
  await expect(uploadFrontPhoto('household', 1, png(), undefined, 'other-session')).rejects.toThrow('Sign in again');
  expect(fetch).not.toHaveBeenCalled();
});
