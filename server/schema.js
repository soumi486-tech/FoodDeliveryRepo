// Idempotent schema, applied on every server start. Keep it a JS module (not .sql):
// reading files under server/ at runtime triggers dev restart loops on Windows.
export const schema = `
CREATE TABLE IF NOT EXISTS restaurants (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  cuisine      text NOT NULL,
  description  text NOT NULL DEFAULT '',
  rating       numeric(2,1) NOT NULL DEFAULT 4.0,
  eta_min      integer NOT NULL,
  eta_max      integer NOT NULL,
  delivery_fee numeric(10,2) NOT NULL CHECK (delivery_fee >= 0),
  min_order    numeric(10,2) NOT NULL CHECK (min_order >= 0),
  open_time    text NOT NULL,
  close_time   text NOT NULL,
  tz           text NOT NULL,
  is_open      boolean NOT NULL DEFAULT true,
  emoji        text NOT NULL DEFAULT '🍽️',
  color        text NOT NULL DEFAULT '#fde68a'
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category      text NOT NULL,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  price         numeric(10,2) NOT NULL CHECK (price >= 0),
  veg           boolean NOT NULL DEFAULT false,
  available     boolean NOT NULL DEFAULT true,
  emoji         text NOT NULL DEFAULT '🍽️'
);
CREATE INDEX IF NOT EXISTS menu_items_restaurant_idx ON menu_items (restaurant_id, category);

CREATE TABLE IF NOT EXISTS orders (
  id              text PRIMARY KEY,
  customer_id     text NOT NULL,
  restaurant_id   text NOT NULL REFERENCES restaurants(id),
  restaurant_name text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL CHECK (status IN ('placed','accepted','preparing','out_for_delivery','delivered','cancelled')),
  fulfilment      text NOT NULL CHECK (fulfilment IN ('delivery','pickup')),
  address         jsonb,
  notes           text NOT NULL DEFAULT '',
  card_last4      text,
  subtotal        numeric(10,2) NOT NULL,
  delivery_fee    numeric(10,2) NOT NULL,
  tax             numeric(10,2) NOT NULL,
  tip             numeric(10,2) NOT NULL,
  total           numeric(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id  text NOT NULL,
  name     text NOT NULL,
  price    numeric(10,2) NOT NULL,
  qty      integer NOT NULL CHECK (qty > 0),
  emoji    text NOT NULL DEFAULT '🍽️',
  PRIMARY KEY (order_id, item_id)
);

CREATE TABLE IF NOT EXISTS order_events (
  id       bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status   text NOT NULL,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, id);
`;
