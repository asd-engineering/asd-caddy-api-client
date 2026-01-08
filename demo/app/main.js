/**
 * Demo Frontend - ES Search with MITMproxy Monitoring
 */

// API base URL (use relative paths when served by demo-api)
const API_BASE = window.location.port === "3000" ? "" : "http://localhost:3000";

// DOM elements
const statusIndicator = document.getElementById("statusIndicator");
const statusText = document.getElementById("statusText");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const resultsDiv = document.getElementById("results");
const statsDiv = document.getElementById("stats");

// State
let monitoringEnabled = false;

/**
 * Update the UI to reflect monitoring state
 */
function updateMonitoringUI(esEnabled) {
  monitoringEnabled = esEnabled;

  if (esEnabled) {
    statusIndicator.className = "status-indicator proxied";
    statusText.textContent = "ES: Capturing via MITMproxy";
  } else {
    statusIndicator.className = "status-indicator direct";
    statusText.textContent = "ES: Direct (not capturing)";
  }
}

/**
 * Fetch monitoring status from API
 */
async function fetchStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/monitoring/status`);
    const data = await response.json();
    const esEnabled = data.services?.elasticsearch?.enabled || false;
    updateMonitoringUI(esEnabled);
  } catch (error) {
    console.error("Failed to fetch status:", error);
    statusText.textContent = "Error: Cannot connect to API";
  }
}

/**
 * Create a product card element safely using DOM methods
 */
function createProductCard(product) {
  const card = document.createElement("div");
  card.className = "product-card";

  const category = document.createElement("div");
  category.className = "product-category";
  category.textContent = product.category || "Uncategorized";

  const name = document.createElement("div");
  name.className = "product-name";
  name.textContent = product.name;

  const description = document.createElement("div");
  description.className = "product-description";
  description.textContent = product.description || "";
  // Hide descriptions by default (feature flag can show them)
  description.style.display = appConfig.showDescriptions === true ? "block" : "none";

  const price = document.createElement("div");
  price.className = "product-price";

  const originalPrice = product.price || 0;
  const symbol = appConfig.currencySymbol || "$";

  // Apply discount if configured
  if (appConfig.discountPercent > 0 && appConfig.discountPercent < 100) {
    const discountedPrice = originalPrice * (1 - appConfig.discountPercent / 100);

    const originalSpan = document.createElement("span");
    originalSpan.className = "original-price";
    originalSpan.textContent = `${symbol}${originalPrice.toFixed(2)}`;

    const discountedSpan = document.createElement("span");
    discountedSpan.className = "discounted-price";
    discountedSpan.textContent = `${symbol}${discountedPrice.toFixed(2)}`;

    const badge = document.createElement("span");
    badge.className = "discount-badge";
    badge.textContent = `-${appConfig.discountPercent}%`;

    price.appendChild(originalSpan);
    price.appendChild(document.createTextNode(" "));
    price.appendChild(discountedSpan);
    price.appendChild(document.createTextNode(" "));
    price.appendChild(badge);
  } else {
    price.textContent = `${symbol}${originalPrice.toFixed(2)}`;
  }

  // Hide prices if configured
  if (appConfig.showPrices === false) {
    price.style.display = "none";
  }

  card.appendChild(category);
  card.appendChild(name);
  card.appendChild(description);
  card.appendChild(price);

  return card;
}

/**
 * Clear and set results content safely
 */
function setResultsContent(content) {
  while (resultsDiv.firstChild) {
    resultsDiv.removeChild(resultsDiv.firstChild);
  }
  if (typeof content === "string") {
    const p = document.createElement("p");
    p.className = "placeholder";
    p.textContent = content;
    resultsDiv.appendChild(p);
  } else if (content instanceof Node) {
    resultsDiv.appendChild(content);
  }
}

/**
 * Show loading spinner
 */
function showLoading() {
  while (resultsDiv.firstChild) {
    resultsDiv.removeChild(resultsDiv.firstChild);
  }
  const loading = document.createElement("div");
  loading.className = "loading";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  loading.appendChild(spinner);
  resultsDiv.appendChild(loading);
}

/**
 * Show error message
 */
function showError(message) {
  while (resultsDiv.firstChild) {
    resultsDiv.removeChild(resultsDiv.firstChild);
  }
  const errorDiv = document.createElement("div");
  errorDiv.className = "error";
  errorDiv.textContent = `Search failed: ${message}`;
  resultsDiv.appendChild(errorDiv);
  statsDiv.textContent = "";
}

/**
 * Search products in Elasticsearch
 * @param {string} query - Search query
 * @param {string} index - Index name (default: "products", use "nonexistent" to trigger 404)
 */
async function searchProducts(query, index = "products") {
  showLoading();

  const startTime = performance.now();

  try {
    // Build ES query - search through Caddy's /es/ route
    const esQuery = {
      query: {
        multi_match: {
          query: query,
          fields: ["name^2", "description", "category"],
          fuzziness: "AUTO",
        },
      },
      size: 20,
    };

    // Note: In production, this would go through Caddy's /es/ route
    // For demo, we'll call the ES endpoint directly through Caddy
    const response = await fetch(`http://localhost:9080/es/${index}/_search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(esQuery),
    });

    const data = await response.json();
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(0);

    if (data.error) {
      throw new Error(data.error.reason || "Elasticsearch error");
    }

    const hits = data.hits?.hits || [];

    // Clear results
    while (resultsDiv.firstChild) {
      resultsDiv.removeChild(resultsDiv.firstChild);
    }

    if (hits.length === 0) {
      const noResults = document.createElement("div");
      noResults.className = "no-results";
      noResults.textContent = "No products found matching your search";
      resultsDiv.appendChild(noResults);
      statsDiv.textContent = `Query took ${duration}ms`;
      return;
    }

    // Render results using safe DOM methods
    hits.forEach((hit) => {
      const card = createProductCard(hit._source);
      resultsDiv.appendChild(card);
    });

    statsDiv.textContent = `Found ${hits.length} products in ${duration}ms${monitoringEnabled ? " (captured by MITMproxy)" : ""}`;
  } catch (error) {
    console.error("Search error:", error);
    showError(error.message);
  }
}

/**
 * Handle search
 */
function handleSearch() {
  const query = searchInput.value.trim();
  if (query) {
    searchProducts(query);
    // Also call Node API to log the search (generates traffic for Node proxy)
    logSearchToNode(query);
  }
}

/**
 * Log search query to Node API (demonstrates Node API traffic capture)
 */
async function logSearchToNode(query) {
  try {
    await fetch("http://localhost:9080/node/echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search", query, timestamp: Date.now() }),
    });
  } catch (e) {
    // Silent fail - this is just for demo traffic
  }
}

// Event listeners
searchBtn.addEventListener("click", handleSearch);
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleSearch();
  }
});

// Suggestion buttons - click to search
document.querySelectorAll(".suggestion").forEach((btn) => {
  btn.addEventListener("click", () => {
    const query = btn.dataset.query;
    const index = btn.dataset.index || "products";
    searchInput.value = query === "__error__" ? "nonexistent" : query;
    searchProducts(query, index);
    logSearchToNode(query); // Also generates Node API traffic
  });
});

// Theme/config state
let appConfig = {
  theme: "dark",
  primaryColor: "#3b82f6",
  accentColor: "#f59e0b",
  backgroundColor: "#0f172a",
  cardColor: "#1e293b",
  textColor: "#e2e8f0",
  appName: "Product Search",
  showPrices: true,
  currencySymbol: "$",
};

/**
 * Fetch and apply config from server (interceptable!)
 */
async function fetchConfig() {
  try {
    const res = await fetch("http://localhost:9080/node/config");
    const config = await res.json();
    appConfig = { ...appConfig, ...config };
    applyTheme(config);
  } catch (e) {
    console.log("Config fetch failed, using defaults");
  }
}

/**
 * Apply theme from config
 */
function applyTheme(config) {
  const root = document.documentElement;

  // Apply colors as CSS variables
  if (config.backgroundColor) root.style.setProperty("--bg-color", config.backgroundColor);
  if (config.cardColor) root.style.setProperty("--card-color", config.cardColor);
  if (config.textColor) root.style.setProperty("--text-color", config.textColor);
  if (config.primaryColor) root.style.setProperty("--primary-color", config.primaryColor);
  if (config.accentColor) root.style.setProperty("--accent-color", config.accentColor);

  // Theme presets
  if (config.theme === "light") {
    root.style.setProperty("--bg-color", "#f8fafc");
    root.style.setProperty("--card-color", "#ffffff");
    root.style.setProperty("--text-color", "#1e293b");
  } else if (config.theme === "neon") {
    root.style.setProperty("--bg-color", "#0a0a0a");
    root.style.setProperty("--card-color", "#1a1a2e");
    root.style.setProperty("--text-color", "#00ff88");
    root.style.setProperty("--primary-color", "#ff00ff");
    root.style.setProperty("--accent-color", "#00ffff");
  } else if (config.theme === "hacker") {
    root.style.setProperty("--bg-color", "#000000");
    root.style.setProperty("--card-color", "#0d1117");
    root.style.setProperty("--text-color", "#00ff00");
    root.style.setProperty("--primary-color", "#00ff00");
    root.style.setProperty("--accent-color", "#00ff00");
  }

  // Update app name
  const h1 = document.querySelector("h1");
  if (h1 && config.appName) h1.textContent = config.appName;

  // Apply feature flags
  applyFeatures(config);
}

/**
 * Create debug panel content using safe DOM methods
 */
function createDebugPanelContent(config) {
  const fragment = document.createDocumentFragment();

  const title = document.createElement("div");
  title.className = "debug-title";
  title.textContent = "Admin Debug Panel";
  fragment.appendChild(title);

  const items = [
    ["Config loaded:", new Date().toLocaleTimeString()],
    ["Theme:", config.theme || "dark"],
    ["Prices visible:", String(config.showPrices !== false)],
    ["Discount:", `${config.discountPercent || 0}%`],
    ["Admin mode:", "ACTIVE"],
  ];

  items.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "debug-item";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    item.appendChild(labelSpan);
    item.appendChild(document.createTextNode(" " + value));
    fragment.appendChild(item);
  });

  return fragment;
}

/**
 * Apply feature flags from config (interceptable for manipulation!)
 */
function applyFeatures(config) {
  // Secret message banner
  let banner = document.getElementById("secret-banner");
  if (config.secretMessage) {
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "secret-banner";
      banner.className = "secret-banner";
      document.body.insertBefore(banner, document.body.firstChild);
    }
    banner.textContent = config.secretMessage;
    banner.style.display = "block";
  } else if (banner) {
    banner.style.display = "none";
  }

  // Admin mode debug panel
  let debugPanel = document.getElementById("debug-panel");
  if (config.adminMode === true) {
    if (!debugPanel) {
      debugPanel = document.createElement("div");
      debugPanel.id = "debug-panel";
      debugPanel.className = "debug-panel";
      document.body.appendChild(debugPanel);
    }
    // Clear existing content
    while (debugPanel.firstChild) {
      debugPanel.removeChild(debugPanel.firstChild);
    }
    debugPanel.appendChild(createDebugPanelContent(config));
    debugPanel.style.display = "block";
  } else if (debugPanel) {
    debugPanel.style.display = "none";
  }

  // Show/hide prices
  const priceElements = document.querySelectorAll(".product-price");
  priceElements.forEach((el) => {
    el.style.display = config.showPrices === false ? "none" : "block";
  });

  // Show/hide descriptions
  const descElements = document.querySelectorAll(".product-description");
  descElements.forEach((el) => {
    el.style.display = config.showDescriptions === true ? "block" : "none";
  });
}

// Initialize
fetchStatus();
fetchConfig();

// Auto-refresh status every 5 seconds
setInterval(fetchStatus, 5000);
