// Configuración básica
const CURRENCY = "USD";
const LOCALE = "es-ES";
const LS_CART_KEY = "lcimports_cart_v1";
const API_BASE = "http://localhost:3000/api";

// Utilidades
const formatMoney = (n) =>
  new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY }).format(n);

// Cargar productos desde API
let productos = [];
async function loadProducts() {
  try {
    const res = await fetch(`${API_BASE}/productos`);
    if (!res.ok) throw new Error("No se pudo cargar el catálogo");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Formato inválido de catálogo");
    productos = data;
  } catch (err) {
    console.error(err);
    productos = [];
    if (grid) {
      grid.innerHTML = `<div class="col-12"><div class="alert alert-warning">
        Error cargando el catálogo. Asegúrate de que el servidor esté ejecutándose.
        <br><small>Ejecuta: <code>node server.js</code></small>
      </div></div>`;
    }
  }
}

// Estado
let cart = loadCart();

// Referencias DOM
const grid = document.getElementById("productos-grid");
const cartCount = document.getElementById("cart-count");
const cartItems = document.getElementById("cart-items");
const cartTotal = document.getElementById("cart-total");
const filterCategory = document.getElementById("filter-category");
const searchInput = document.getElementById("search-input");
const yearSpan = document.getElementById("year");
const btnEmpty = document.getElementById("btn-empty-cart");
const btnCheckout = document.getElementById("btn-checkout");

// Init
document.addEventListener("DOMContentLoaded", async () => {
  yearSpan.textContent = new Date().getFullYear();

  // Cargar productos desde API y renderizar
  await loadProducts();
  renderCatalog(productos);

  updateCartBadge();
  renderCart();

  // Filtros
  filterCategory.addEventListener("change", applyFilters);
  searchInput.addEventListener("input", applyFilters);

  // Delegación para "Agregar al carrito"
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    const id = btn.getAttribute("data-add");
    const product = productos.find((p) => p.id == id);
    if (product) {
      addToCart(product);
    }
  });

  // Carrito: vaciar y checkout
  btnEmpty.addEventListener("click", () => {
    if (cart.items.length === 0) return;
    if (confirm("¿Vaciar carrito?")) {
      cart.items = [];
      persistCart();
      renderCart();
      updateCartBadge();
    }
  });

  btnCheckout.addEventListener("click", () => {
    if (cart.items.length === 0) {
      alert("Tu carrito está vacío.");
      return;
    }
    
    // Crear mensaje para WhatsApp
    let mensaje = "¡Hola! Me interesa consultar por estos productos:\n\n";
    
    cart.items.forEach((item, index) => {
      mensaje += `${index + 1}. ${item.nombre}\n`;
      mensaje += `   Cantidad: ${item.cantidad}\n`;
      mensaje += `   Precio unitario: ${formatMoney(item.precio)}\n`;
      mensaje += `   Subtotal: ${formatMoney(item.precio * item.cantidad)}\n\n`;
    });
    
    const total = cart.items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    mensaje += `💰 TOTAL: ${formatMoney(total)}\n\n`;
    mensaje += "¿Podrían darme más información sobre disponibilidad y envío?";
    
    // Codificar mensaje para URL
    const mensajeCodificado = encodeURIComponent(mensaje);
    
    // Número de WhatsApp (Argentina: +54 + número sin 0 inicial)
    const numeroWhatsApp = "5493795040807";
    
    // Crear URL de WhatsApp
    const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${mensajeCodificado}`;
    
    // Abrir WhatsApp
    window.open(urlWhatsApp, '_blank');
  });

  // Delegación en items del carrito
  cartItems.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove]");
    const minusBtn = e.target.closest("[data-minus]");
    const plusBtn = e.target.closest("[data-plus]");

    if (removeBtn) {
      const id = removeBtn.getAttribute("data-remove");
      removeFromCart(id);
    }
    if (minusBtn) {
      const id = minusBtn.getAttribute("data-minus");
      changeQty(id, -1);
    }
    if (plusBtn) {
      const id = plusBtn.getAttribute("data-plus");
      changeQty(id, +1);
    }
  });
});

// Render del catálogo
function renderCatalog(list) {
  if (!grid) return;
  if (!list || list.length === 0) {
    grid.innerHTML = `<div class="col-12"><div class="alert alert-warning">No se encontraron productos.</div></div>`;
    return;
  }

  grid.innerHTML = list
    .map(
      (p) => `
      <div class="col-12 col-sm-6 col-lg-4">
        <div class="card h-100 shadow-sm">
          <img src="${p.imagen || 'https://via.placeholder.com/400x300?text=Sin+Imagen'}" class="card-img-top" alt="${escapeHtml(p.nombre)}" />
          <div class="card-body d-flex flex-column">
            <h5 class="card-title">${escapeHtml(p.nombre)}</h5>
            <p class="text-muted text-capitalize mb-2">Categoría: ${p.categoria}</p>
            ${p.stock !== undefined ? `<small class="text-success mb-2">Stock: ${p.stock}</small>` : ''}
            <div class="mt-auto d-flex align-items-center justify-content-between">
              <span class="fw-bold">${formatMoney(p.precio)}</span>
              <button class="btn btn-primary" data-add="${p.id}">
                <i class="bi bi-cart-plus"></i> Agregar
              </button>
            </div>
          </div>
        </div>
      </div>
    `
    )
    .join("");
}

// Filtros (categoría + búsqueda)
function applyFilters() {
  const cat = filterCategory.value;
  const q = searchInput.value.trim().toLowerCase();
  const filtered = productos.filter((p) => {
    const okCat = cat === "all" ? true : p.categoria === cat;
    const okSearch = q
      ? p.nombre.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q)
      : true;
    return okCat && okSearch;
  });
  renderCatalog(filtered);
}

// Carrito
function addToCart(product) {
  const existing = cart.items.find((i) => i.id == product.id);
  if (existing) {
    existing.cantidad += 1;
  } else {
    cart.items.push({
      id: product.id,
      nombre: product.nombre,
      precio: product.precio,
      imagen: product.imagen,
      cantidad: 1
    });
  }
  persistCart();
  updateCartBadge();
  renderCart();
}

function removeFromCart(id) {
  cart.items = cart.items.filter((i) => i.id != id);
  persistCart();
  updateCartBadge();
  renderCart();
}

function changeQty(id, delta) {
  const item = cart.items.find((i) => i.id == id);
  if (!item) return;
  item.cantidad += delta;
  if (item.cantidad <= 0) {
    cart.items = cart.items.filter((i) => i.id != id);
  }
  persistCart();
  updateCartBadge();
  renderCart();
}

function renderCart() {
  if (!cartItems) return;
  if (cart.items.length === 0) {
    cartItems.innerHTML = `<div class="list-group-item text-center text-muted">Tu carrito está vacío</div>`;
    cartTotal.textContent = formatMoney(0);
    return;
  }

  cartItems.innerHTML = cart.items
    .map(
      (i) => `
      <div class="list-group-item">
        <div class="d-flex align-items-center gap-3">
          <img src="${i.imagen || 'https://via.placeholder.com/64x64?text=Sin+Imagen'}" alt="${escapeHtml(i.nombre)}" width="64" height="64" class="rounded object-fit-cover" />
          <div class="flex-grow-1">
            <div class="d-flex align-items-center justify-content-between">
              <h6 class="mb-1">${escapeHtml(i.nombre)}</h6>
              <button class="btn btn-sm btn-outline-danger" title="Eliminar" data-remove="${i.id}">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
            <div class="d-flex align-items-center justify-content-between">
              <small class="text-muted">${formatMoney(i.precio)}</small>
              <div class="quantity-control d-flex align-items-center gap-2">
                <button class="btn btn-sm btn-outline-secondary" data-minus="${i.id}">-</button>
                <span class="fw-semibold">${i.cantidad}</span>
                <button class="btn btn-sm btn-outline-secondary" data-plus="${i.id}">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
    )
    .join("");

  const total = cart.items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  cartTotal.textContent = formatMoney(total);
}

function updateCartBadge() {
  const qty = cart.items.reduce((acc, i) => acc + i.cantidad, 0);
  cartCount.textContent = qty;
}

// Persistencia
function persistCart() {
  localStorage.setItem(LS_CART_KEY, JSON.stringify(cart));
}
function loadCart() {
  try {
    const raw = localStorage.getItem(LS_CART_KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return parsed;
  } catch {
    return { items: [] };
  }
}

// Seguridad mínima al mostrar strings
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}