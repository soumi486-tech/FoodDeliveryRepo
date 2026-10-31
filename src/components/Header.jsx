import { Link, NavLink } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useSession } from '../lib/auth';

export default function Header() {
  const { data: session, isPending } = useSession();
  const cart = useCart();
  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo">🍔 FoodDash</Link>
        <nav className="nav">
          <NavLink to="/" end>Restaurants</NavLink>
          <NavLink to="/checkout">Cart{cart.count > 0 && <span className="badge">{cart.count}</span>}</NavLink>
          <NavLink to="/orders">Orders</NavLink>
          {!isPending && (session
            ? <NavLink to="/account">{session.user.name}</NavLink>
            : <><NavLink to="/login">Sign in</NavLink><NavLink to="/signup">Sign up</NavLink></>)}
        </nav>
      </div>
    </header>
  );
}
