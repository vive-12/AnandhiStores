// Your laptop's local IP on Wi-Fi — phones on the same network will connect here.
// If it stops working, run: ipconfig   and update SERVER_IP below.
const SERVER_IP = '192.168.0.4';
const SERVER_PORT = '3001';

export const API_BASE = `http://${SERVER_IP}:${SERVER_PORT}/api`;

export const ENDPOINTS = {
  orders:        `${API_BASE}/orders`,
  order:         (id) => `${API_BASE}/orders/${id}`,
  orderStatus:   (id) => `${API_BASE}/orders/${id}/status`,
  emptyReturned: (id) => `${API_BASE}/orders/${id}/empty-returned`,
  agents:        `${API_BASE}/agents`,
  agentAvail:    `${API_BASE}/agents/available`,
  adminAlerts:   `${API_BASE}/admin/alerts`,
  adminStats:    `${API_BASE}/admin/stats`,
  inventory:     `${API_BASE}/inventory`,
  offers:        `${API_BASE}/offers`,
};
