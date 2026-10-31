// Data access layer: thin wrappers around the Express REST API.
// Pages never call fetch directly.

// Same-origin requests carry the Better Auth session cookie automatically. A 401 means signed out:
// the error has `status` 401 so pages can send the user to /login.
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 && method === 'GET') return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

export const getHealth = () => request('/health');

export const getRestaurants = ({ q = '', cuisine = '' } = {}) =>
  request(`/restaurants?q=${encodeURIComponent(q)}&cuisine=${encodeURIComponent(cuisine)}`);
export const getCuisines = () => request('/cuisines');
export const getRestaurant = (id) => request(`/restaurants/${encodeURIComponent(id)}`);
export const getOrders = () => request('/orders');
export const getOrder = (id) => request(`/orders/${encodeURIComponent(id)}`);
export const placeOrder = (order) => request('/orders', { method: 'POST', body: order });
export const cancelOrder = (id) => request(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
