import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({ baseURL: `${API_BASE}/api/v1` });

/**
 * Session storage.
 *
 * The access token is short-lived, so the refresh token is kept as well: that is what
 * lets a signed-in visitor stay signed in across reloads and days, the way an app does,
 * instead of being logged out the moment the access token expires.
 */
const session = {
  get accessToken() {
    return localStorage.getItem('token');
  },
  get refreshToken() {
    return localStorage.getItem('refreshToken');
  },
  save(data) {
    const access = data?.accessToken || data?.token;
    if (access) localStorage.setItem('token', access);
    if (data?.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
  },
  clear() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  },
};

export { session };

api.interceptors.request.use((config) => {
  const token = session.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;

/** Exchanges the refresh token once, even if several requests 401 at the same time. */
function refreshAccessToken() {
  if (!session.refreshToken) return Promise.resolve(null);
  if (!refreshing) {
    refreshing = axios
      .post(`${API_BASE}/api/v1/auth/refresh`, { refreshToken: session.refreshToken })
      .then((res) => {
        session.save(res.data);
        return session.accessToken;
      })
      .catch(() => {
        session.clear();
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err?.config;
    const status = err?.response?.status;

    if (status === 401 && original && !original._retried) {
      const token = await refreshAccessToken();
      if (token) {
        original._retried = true;
        original.headers = { ...(original.headers || {}), Authorization: `Bearer ${token}` };
        return api(original);
      }
    }

    if (status === 401) session.clear();
    return Promise.reject(err);
  }
);

/**
 * Resolves a media URL coming from the API.
 * Absolute URLs are returned untouched; relative paths (e.g. "/uploads/x.jpg")
 * are prefixed with the API origin so they resolve in dev and production.
 */
export function assetUrl(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export default api;
