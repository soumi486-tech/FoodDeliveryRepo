export const money = (n) => `$${Number(n).toFixed(2)}`;

export const formatTime = (iso, tz = 'America/New_York') =>
  new Date(iso).toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
