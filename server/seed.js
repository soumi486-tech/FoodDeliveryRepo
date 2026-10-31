// Initial data. Must be a no-op when the database already has rows.
const TZ = 'America/New_York';

// [id, name, cuisine, description, rating, etaMin, etaMax, fee, minOrder, open, close, emoji, color]
const restaurants = [
  ['r1', 'Napoli Slice', 'Italian', 'Wood-fired pizza and fresh pasta.', 4.7, 25, 35, 2.99, 12, '10:00', '23:00', '🍕', '#fecaca'],
  ['r2', 'Spice Route', 'Indian', 'Curries, tandoor and biryani from scratch.', 4.6, 30, 45, 3.49, 15, '11:00', '22:30', '🍛', '#fde68a'],
  ['r3', 'Dragon Wok', 'Chinese', 'Noodles, dumplings and stir-fries.', 4.4, 20, 30, 1.99, 10, '11:00', '22:00', '🥡', '#fed7aa'],
  ['r4', 'Burger Barn', 'American', 'Smashed burgers, fries and shakes.', 4.5, 15, 25, 2.49, 8, '10:00', '23:59', '🍔', '#fbcfe8'],
  ['r5', 'Green Bowl', 'Healthy', 'Salads, grain bowls and smoothies.', 4.8, 15, 25, 2.99, 10, '09:00', '20:00', '🥗', '#bbf7d0'],
  ['r6', 'Taco Loco', 'Mexican', 'Street tacos, burritos and churros.', 4.3, 20, 30, 2.49, 9, '11:00', '23:00', '🌮', '#d9f99d'],
];

// [id, restaurantId, category, name, description, price, veg, emoji]
const menu = [
  ['m1', 'r1', 'Pizza', 'Margherita', 'Tomato, mozzarella, basil.', 11.5, true, '🍕'],
  ['m2', 'r1', 'Pizza', 'Pepperoni', 'Spicy pepperoni, mozzarella.', 13.5, false, '🍕'],
  ['m3', 'r1', 'Pasta', 'Spaghetti Carbonara', 'Egg, pecorino, guanciale.', 14.0, false, '🍝'],
  ['m4', 'r1', 'Pasta', 'Penne Arrabbiata', 'Spicy tomato sauce.', 12.0, true, '🍝'],
  ['m5', 'r1', 'Desserts', 'Tiramisu', 'Espresso-soaked layers.', 6.5, true, '🍰'],
  ['m6', 'r2', 'Curries', 'Butter Chicken', 'Creamy tomato gravy.', 15.5, false, '🍛'],
  ['m7', 'r2', 'Curries', 'Paneer Tikka Masala', 'Grilled paneer in spiced gravy.', 14.5, true, '🍛'],
  ['m8', 'r2', 'Rice & Bread', 'Chicken Biryani', 'Basmati rice, slow-cooked chicken.', 16.0, false, '🍚'],
  ['m9', 'r2', 'Rice & Bread', 'Garlic Naan', 'Tandoor-baked flatbread.', 3.5, true, '🫓'],
  ['m10', 'r3', 'Noodles', 'Chow Mein', 'Stir-fried noodles with vegetables.', 11.0, true, '🍜'],
  ['m11', 'r3', 'Noodles', 'Beef Lo Mein', 'Soft noodles, beef, scallions.', 13.0, false, '🍜'],
  ['m12', 'r3', 'Starters', 'Pork Dumplings', 'Eight pan-fried dumplings.', 8.5, false, '🥟'],
  ['m13', 'r3', 'Starters', 'Veg Spring Rolls', 'Crispy rolls with sweet chili.', 6.0, true, '🥠'],
  ['m14', 'r4', 'Burgers', 'Classic Smash', 'Double patty, cheddar, pickles.', 10.5, false, '🍔'],
  ['m15', 'r4', 'Burgers', 'Veggie Burger', 'Black bean patty, avocado.', 10.0, true, '🍔'],
  ['m16', 'r4', 'Sides', 'Fries', 'Crispy, salted.', 4.0, true, '🍟'],
  ['m17', 'r4', 'Drinks', 'Chocolate Shake', 'Thick and creamy.', 5.5, true, '🥤'],
  ['m18', 'r5', 'Bowls', 'Teriyaki Chicken Bowl', 'Brown rice, greens, edamame.', 12.5, false, '🥗'],
  ['m19', 'r5', 'Bowls', 'Falafel Bowl', 'Hummus, quinoa, pickled onion.', 11.5, true, '🥙'],
  ['m20', 'r5', 'Drinks', 'Berry Smoothie', 'Strawberry, blueberry, banana.', 6.0, true, '🥤'],
  ['m21', 'r6', 'Tacos', 'Carne Asada Tacos', 'Three tacos with salsa verde.', 11.0, false, '🌮'],
  ['m22', 'r6', 'Tacos', 'Mushroom Tacos', 'Three tacos with chipotle crema.', 10.0, true, '🌮'],
  ['m23', 'r6', 'Burritos', 'Chicken Burrito', 'Rice, beans, cheese, salsa.', 11.5, false, '🌯'],
  ['m24', 'r6', 'Desserts', 'Churros', 'Cinnamon sugar, chocolate dip.', 5.5, true, '🍩'],
];

export async function seed(pool, withTransaction) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM restaurants');
  if (rows[0].n > 0) return;

  await withTransaction(async (tx) => {
    for (const [id, name, cuisine, description, rating, etaMin, etaMax, fee, min, open, close, emoji, color] of restaurants) {
      await tx.query(
        `INSERT INTO restaurants (id, name, cuisine, description, rating, eta_min, eta_max, delivery_fee, min_order,
           open_time, close_time, tz, emoji, color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
        [id, name, cuisine, description, rating, etaMin, etaMax, fee, min, open, close, TZ, emoji, color]
      );
    }
    for (const [id, rid, category, name, description, price, veg, emoji] of menu) {
      await tx.query(
        `INSERT INTO menu_items (id, restaurant_id, category, name, description, price, veg, emoji)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [id, rid, category, name, description, price, veg, emoji]
      );
    }
  });
  console.log(`Seeded ${restaurants.length} restaurants and ${menu.length} menu items`);
}
