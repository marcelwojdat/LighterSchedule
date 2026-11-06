import axios from 'axios';
import { refreshAccessToken } from './client';

jest.mock('axios', () => {
  const instance = { interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { create: jest.fn(() => instance), post: jest.fn() };
});

beforeEach(() => {
  localStorage.setItem('refresh', 'refresh-1');
  axios.post.mockReset();
});

test('parallel refreshes share one request, because the used refresh token is revoked', async () => {
  axios.post.mockResolvedValue({ data: { access: 'access-2', refresh: 'refresh-2' } });

  const results = await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);

  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(results).toEqual(['access-2', 'access-2', 'access-2']);
  expect(localStorage.getItem('access')).toBe('access-2');
  expect(localStorage.getItem('refresh')).toBe('refresh-2');
});

test('a later refresh sends the rotated token', async () => {
  axios.post
    .mockResolvedValueOnce({ data: { access: 'access-2', refresh: 'refresh-2' } })
    .mockResolvedValueOnce({ data: { access: 'access-3', refresh: 'refresh-3' } });

  await refreshAccessToken();
  await refreshAccessToken();

  expect(axios.post).toHaveBeenCalledTimes(2);
  expect(axios.post.mock.calls[1][1]).toEqual({ refresh: 'refresh-2' });
});

test('a failed refresh can be retried', async () => {
  axios.post.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: { access: 'access-2' } });

  await expect(refreshAccessToken()).rejects.toThrow('network');
  await expect(refreshAccessToken()).resolves.toBe('access-2');
});
