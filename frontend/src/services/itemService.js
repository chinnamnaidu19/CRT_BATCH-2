import api from './api.js';

export const getCategories = () => api.get('/categories').then((r) => r.data.categories);
export const getItem = (id) => api.get(`/items/${id}`).then((r) => r.data.item);
export const getMyItems = () => api.get('/items/mine').then((r) => r.data.items);
export const createItem = (formData) => api.post('/items', formData).then((r) => r.data);
export const updateItem = (id, formData) => api.put(`/items/${id}`, formData).then((r) => r.data);
export const deleteItem = (id) => api.delete(`/items/${id}`).then((r) => r.data);
