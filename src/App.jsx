import { Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import RequireAuth from './components/RequireAuth';
import Account from './pages/Account';
import Checkout from './pages/Checkout';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import OrderTracking from './pages/OrderTracking';
import Orders from './pages/Orders';
import RestaurantMenu from './pages/RestaurantMenu';

export default function App() {
  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/restaurants/:id" element={<RestaurantMenu />} />
          <Route path="/login" element={<Login mode="login" />} />
          <Route path="/signup" element={<Login mode="signup" />} />
          <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
          <Route path="/orders/:id" element={<RequireAuth><OrderTracking /></RequireAuth>} />
          <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer">FoodDash · demo app, no real payments or deliveries</footer>
    </>
  );
}
