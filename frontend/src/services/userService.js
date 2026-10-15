import api from './api.js';

export const getProfile = (id) => api.get(`/users/${id}`).then((r) => r.data.profile);
export const updateMe = (data) => api.put('/users/me', data).then((r) => r.data);
export const changePassword = (data) => api.put('/users/me/password', data).then((r) => r.data);
export const uploadAvatar = (file) => {
  const f = new FormData();
  f.append('avatar', file);
  return api.post('/users/me/avatar', f).then((r) => r.data);
};
