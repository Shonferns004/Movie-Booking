import axios from 'axios';

const api = axios.create({ baseURL: `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

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
