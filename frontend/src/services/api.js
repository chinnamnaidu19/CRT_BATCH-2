import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

// Normalise errors so pages can just show `err.message`.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const message = error.response?.data?.message || 'Network error. Please try again.';
    return Promise.reject({ message, status: error.response?.status, details: error.response?.data?.details });
  }
);

export default api;
