import React, { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { Plus, Trash2, Package, Loader2 } from "lucide-react";

interface ProductsModuleProps {
  user: any;
  products: string[];
  onProductsChanged: () => void;
  [key: string]: any;
}

export function ProductsModule({ user, products, onProductsChanged }: ProductsModuleProps) {
  const [newProduct, setNewProduct] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [productIds, setProductIds] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("regional_products").select("id,name").eq("user_id", user.id).then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((p: any) => { map[p.name] = p.id; });
        setProductIds(map);
      }
    });
  }, [products]);

  const handleAdd = async () => {
    const name = newProduct.trim();
    if (!name) return;

    // Check if product already exists (case-insensitive)
    if (products.some(p => p.toLowerCase() === name.toLowerCase())) {
      alert(`The product "${name}" already exists.`);
      return;
    }

    setIsAdding(true);
    const { error } = await supabase.from("regional_products").insert({ user_id: user.id, name });
    if (!error) { setNewProduct(""); onProductsChanged(); }
    setIsAdding(false);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete product "${name}"?`)) return;
    setDeletingId(name);
    await supabase.from("regional_products").delete().eq("user_id", user.id).eq("name", name);
    onProductsChanged();
    setDeletingId(null);
  };

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ maxWidth: "100%", margin: "0 auto" }}>
        {/* Subtle count */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ padding: "4px 12px", background: "rgba(34,197,94,0.1)", borderRadius: 10, color: "#16a34a", fontSize: 12, fontWeight: 700 }}>
            {products.length} Products
          </div>
          <div style={{ fontSize: 13, color: "#9ca3af", fontWeight: 500 }}>Manage crop products that farmers can be assigned to</div>
        </div>

        {/* Add product */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "24px", marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "#374151" }}>Add New Product</h3>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={newProduct}
              onChange={e => setNewProduct(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="e.g. Coconut, Rice, Corn..."
              style={{ flex: 1, height: 44, border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "0 14px", fontSize: 14, outline: "none", fontFamily: "inherit", transition: "border 0.2s" }}
              onFocus={e => (e.target.style.borderColor = "#22c55e")}
              onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
            />
            <button
              onClick={handleAdd}
              disabled={isAdding || !newProduct.trim()}
              style={{ height: 44, padding: "0 20px", background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontFamily: "inherit", opacity: isAdding || !newProduct.trim() ? 0.6 : 1, transition: "all 0.2s" }}
            >
              {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Add
            </button>
          </div>
        </div>

        {/* Products list */}
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0", overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #f3f4f6" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#374151" }}>All Products</h3>
          </div>
          {products.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>
              <Package size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: 14 }}>No products added yet</p>
            </div>
          ) : (
            <div style={{ padding: "8px" }}>
              {products.map((name, i) => (
                <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, transition: "background 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,rgba(34,197,94,0.15),rgba(22,163,74,0.1))", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#16a34a" }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#374151" }}>{name}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(name)}
                    disabled={deletingId === name}
                    style={{ width: 32, height: 32, background: "rgba(239,68,68,0.08)", border: "none", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#ef4444", transition: "all 0.15s" }}
                  >
                    {deletingId === name ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
