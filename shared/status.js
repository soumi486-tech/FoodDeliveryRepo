// Order lifecycle shared by the tracker UI and the API.
export const STATUSES = ['placed', 'accepted', 'preparing', 'out_for_delivery', 'delivered'];

export const STATUS_LABELS = {
  placed: 'Order placed',
  accepted: 'Restaurant accepted',
  preparing: 'Preparing your food',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// Pickup orders skip the courier step; the last step reads "Ready for pickup".
export const PICKUP_LABELS = { out_for_delivery: 'Ready for pickup', delivered: 'Picked up' };

export const CANCELLABLE = ['placed', 'accepted'];

// Demo simulator: seconds after creation at which each status is reached.
export const DEMO_SCHEDULE = [
  ['delivered', 12 * 60],
  ['out_for_delivery', 6 * 60],
  ['preparing', 2 * 60],
  ['accepted', 30],
  ['placed', 0],
];

export const statusForAge = (ageSeconds) => DEMO_SCHEDULE.find(([, at]) => ageSeconds >= at)[0];
