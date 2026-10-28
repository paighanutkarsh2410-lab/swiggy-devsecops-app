
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";

export default function Restaurant() {
  const { id } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState({});
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([api.getRestaurant(id), api.getMenu(id)])
      .then(([restaurantData, menuData]) => {
        if (!cancelled) {
          setRestaurant(restaurantData);
          setMenu(menuData);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const itemsInCart = menu.filter((item) => cart[item.id] > 0);

  const total = itemsInCart.reduce(
    (sum, item) => sum + Number(item.price) * cart[item.id],
    0
  );

  function changeQuantity(item, delta) {
    setCart((current) => {
      const nextQuantity = Math.max(0, (current[item.id] || 0) + delta);
      return { ...current, [item.id]: nextQuantity };
    });
    setMessage("");
  }

  async function placeOrder(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (itemsInCart.length === 0) {
      setError("Add at least one item to your cart.");
      return;
    }

    setOrdering(true);

    try {
      const order = await api.createOrder({
        restaurant_id: Number(id),
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim(),
        items: itemsInCart.map((item) => ({
          menu_item_id: Number(item.id),
          quantity: cart[item.id],
        })),
      });

      const orderId = order.id ?? order.order?.id;
      setCart({});
      setMessage(
        orderId
          ? `Order placed successfully! Your order number is #${orderId}.`
          : "Order placed successfully!"
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setOrdering(false);
    }
  }

  if (loading) return <main className="page-container message">Loading menu...</main>;

  if (error && !restaurant) {
    return (
      <main className="page-container">
        <p className="message error">{error}</p>
        <Link to="/" className="back-link">← Back to restaurants</Link>
      </main>
    );
  }

  if (!restaurant) return null;

  return (
    <main className="page-container menu-page">
      <Link to="/" className="back-link">← All restaurants</Link>

      <section className="restaurant-banner">
        <div>
          <span className="eyebrow">{restaurant.cuisine} CUISINE</span>
          <h1>{restaurant.name}</h1>
          <p>{restaurant.description}</p>
          <div className="restaurant-meta">
            <span>★ {restaurant.rating}</span>
            <span>{restaurant.delivery_time_minutes} min delivery</span>
            <span>{restaurant.address}</span>
          </div>
        </div>
        <div className="menu-banner-art" aria-hidden="true">
          {restaurant.cuisine === "Italian" ? "🍕" : "🍛"}
        </div>
      </section>

      <div className="menu-layout">
        <section className="menu-section">
          <span className="eyebrow">FRESHLY PREPARED</span>
          <h2>Menu</h2>

          {menu.length === 0 && <p>No menu items available.</p>}

          {menu.map((item) => (
            <article className="menu-item" key={item.id}>
              <div className="menu-item-copy">
                <span className={`food-indicator ${item.is_veg ? "veg" : "non-veg"}`}>
                  {item.is_veg ? "● Veg" : "● Non-veg"}
                </span>
                <h3>{item.name}</h3>
                <strong>₹{Number(item.price).toFixed(2)}</strong>
                <p>{item.description}</p>
              </div>

              <div className="menu-item-action">
                <div className="food-emoji" aria-hidden="true">
                  {item.name.toLowerCase().includes("pizza") ? "🍕" :
                    item.name.toLowerCase().includes("biryani") ? "🍚" :
                    item.name.toLowerCase().includes("dal") ? "🥣" : "🍲"}
                </div>
                {item.is_available ? (
                  <div className="quantity-control">
                    <button type="button" onClick={() => changeQuantity(item, -1)} aria-label={`Remove one ${item.name}`}>−</button>
                    <span>{cart[item.id] || 0}</span>
                    <button type="button" onClick={() => changeQuantity(item, 1)} aria-label={`Add one ${item.name}`}>+</button>
                  </div>
                ) : (
                  <span className="unavailable">Unavailable</span>
                )}
              </div>
            </article>
          ))}
        </section>

        <aside className="cart-panel">
          <h2>Your cart</h2>
          {itemsInCart.length === 0 ? (
            <p className="muted">Your cart is empty. Add something delicious!</p>
          ) : (
            <>
              {itemsInCart.map((item) => (
                <div className="cart-line" key={item.id}>
                  <span>{item.name} × {cart[item.id]}</span>
                  <strong>₹{(Number(item.price) * cart[item.id]).toFixed(2)}</strong>
                </div>
              ))}

              <div className="cart-total">
                <span>Total</span>
                <strong>₹{total.toFixed(2)}</strong>
              </div>

              <form className="checkout-form" onSubmit={placeOrder}>
                <label>
                  Your name
                  <input
                    required
                    maxLength={150}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </label>
                <label>
                  Delivery address
                  <textarea
                    required
                    maxLength={1000}
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Enter your delivery address"
                    rows={3}
                  />
                </label>
                <button className="primary-button checkout-button" disabled={ordering}>
                  {ordering ? "Placing order..." : `Place order · ₹${total.toFixed(2)}`}
                </button>
              </form>
            </>
          )}

          {error && <p className="message error">{error}</p>}
          {message && <p className="message success">{message}</p>}
        </aside>
      </div>
    </main>
  );
}

