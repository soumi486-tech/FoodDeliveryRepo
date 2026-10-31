import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { storage } from '../api/storage';
import { computeTotals } from '../../shared/pricing';

// One cart belongs to ONE restaurant. Lines snapshot name/price for display only; the server re-prices.
const CartContext = createContext(null);
const empty = { restaurant: null, lines: [] };

function reducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { restaurant, item } = action;
      const base = state.restaurant && state.restaurant.id !== restaurant.id ? empty : state;
      const lines = base.lines.some((l) => l.id === item.id)
        ? base.lines.map((l) => (l.id === item.id ? { ...l, qty: Math.min(l.qty + 1, 50) } : l))
        : [...base.lines, { id: item.id, name: item.name, price: item.price, emoji: item.emoji, qty: 1 }];
      return { restaurant: { id: restaurant.id, name: restaurant.name, deliveryFee: restaurant.deliveryFee, minOrder: restaurant.minOrder }, lines };
    }
    case 'setQty': {
      const lines = state.lines.map((l) => (l.id === action.id ? { ...l, qty: action.qty } : l)).filter((l) => l.qty > 0);
      return lines.length ? { ...state, lines } : empty;
    }
    case 'clear':
      return empty;
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => storage.get('cart', empty));
  useEffect(() => storage.set('cart', state), [state]);

  const value = useMemo(() => ({
    ...state,
    count: state.lines.reduce((n, l) => n + l.qty, 0),
    add: (restaurant, item) => dispatch({ type: 'add', restaurant, item }),
    setQty: (id, qty) => dispatch({ type: 'setQty', id, qty }),
    clear: () => dispatch({ type: 'clear' }),
    totalsFor: (fulfilment, tip) =>
      computeTotals({ lines: state.lines, restaurant: state.restaurant ?? { deliveryFee: 0 }, fulfilment, tip }),
  }), [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
