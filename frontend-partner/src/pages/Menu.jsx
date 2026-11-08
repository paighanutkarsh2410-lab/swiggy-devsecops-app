import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/context";
import { api } from "../services/api";
import { formatPrice } from "../utils/format";

const EMPTY_ITEM = { name: "", description: "", price: "", is_veg: true };

function ItemForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [item, setItem] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await onSubmit({
        name: item.name,
        description: item.description,
        price: Number(item.price),
        is_veg: item.is_veg,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="item-form" onSubmit={submit}>
      <label>
        Name
        <input
          required
          maxLength={150}
          value={item.name}
          onChange={(event) => setItem({ ...item, name: event.target.value })}
        />
      </label>
      <label>
        Price (₹)
        <input
          required
          type="number"
          min="0"
          max="100000"
          step="0.01"
          value={item.price}
          onChange={(event) => setItem({ ...item, price: event.target.value })}
        />
      </label>
      <label className="wide">
        Description
        <input
          maxLength={500}
          value={item.description ?? ""}
          onChange={(event) => setItem({ ...item, description: event.target.value })}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={item.is_veg}
          onChange={(event) => setItem({ ...item, is_veg: event.target.checked })}
        />
        Vegetarian
      </label>
      <div className="form-actions">
        <button className="button primary" disabled={saving}>
          {saving ? "Saving..." : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="button ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
      {error && <p className="notice error wide" role="alert">{error}</p>}
    </form>
  );
}

export default function Menu() {
  const { isOwner } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(
    () =>
      api.getMenu()
        .then((data) => {
          setItems(data);
          setError("");
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  async function run(id, action) {
    setBusyId(id);
    setError("");

    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function remove(item) {
    if (window.confirm(`Remove "${item.name}" from the menu? Past orders keep their details.`)) {
      run(item.id, () => api.removeMenuItem(item.id));
    }
  }

  const soldOut = items.filter((item) => !item.is_available).length;

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">MENU</span>
          <h1>Menu</h1>
          <p className="subtle">
            {items.length} items{soldOut > 0 ? ` · ${soldOut} sold out` : ""}
          </p>
        </div>
        {isOwner && !adding && (
          <button type="button" className="button primary" onClick={() => setAdding(true)}>
            + Add item
          </button>
        )}
      </div>

      {!isOwner && (
        <p className="notice">
          You can mark items sold out. Only the restaurant owner can add, edit or remove items.
        </p>
      )}

      {adding && (
        <div className="panel">
          <h2>New menu item</h2>
          <ItemForm
            initial={EMPTY_ITEM}
            submitLabel="Add to menu"
            onCancel={() => setAdding(false)}
            onSubmit={async (item) => {
              await api.createMenuItem(item);
              setAdding(false);
              await load();
            }}
          />
        </div>
      )}

      {error && <p className="notice error" role="alert">{error}</p>}
      {loading && <p className="notice">Loading menu...</p>}

      <div className="menu-list">
        {items.map((item) =>
          editingId === item.id ? (
            <div className="panel" key={item.id}>
              <h2>Edit {item.name}</h2>
              <ItemForm
                initial={item}
                submitLabel="Save changes"
                onCancel={() => setEditingId(null)}
                onSubmit={async (changes) => {
                  await api.updateMenuItem(item.id, changes);
                  setEditingId(null);
                  await load();
                }}
              />
            </div>
          ) : (
            <div className={`menu-row ${item.is_available ? "" : "sold-out"}`} key={item.id}>
              <span
                className={`veg-mark ${item.is_veg ? "veg" : "non-veg"}`}
                title={item.is_veg ? "Vegetarian" : "Non-vegetarian"}
              />
              <div className="menu-info">
                <strong>{item.name}</strong>
                {item.description && <span>{item.description}</span>}
              </div>
              <strong className="menu-price">{formatPrice(item.price)}</strong>
              <label className="switch" title="Customers can order this item">
                <input
                  type="checkbox"
                  aria-label={`${item.name} in stock`}
                  checked={item.is_available}
                  disabled={busyId === item.id}
                  onChange={(event) =>
                    run(item.id, () =>
                      api.updateMenuItem(item.id, { is_available: event.target.checked })
                    )
                  }
                />
                <span className="slider" aria-hidden="true" />
                <span className="switch-label">{item.is_available ? "In stock" : "Sold out"}</span>
              </label>
              {isOwner && (
                <div className="row-actions">
                  <button type="button" className="button ghost" onClick={() => setEditingId(item.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button ghost danger"
                    disabled={busyId === item.id}
                    onClick={() => remove(item)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </section>
  );
}
