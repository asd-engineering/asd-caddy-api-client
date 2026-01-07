/**
 * Demo Frontend - ES Search with MITMproxy Monitoring
 */

// API base URL (use relative paths when served by demo-api)
const API_BASE = window.location.port === "3000" ? "" : "http://localhost:3000";

// DOM elements
const statusIndicator = document.getElementById("statusIndicator");
const statusText = document.getElementById("statusText");
const toggleBtn = document.getElementById("toggleBtn");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const resultsDiv = document.getElementById("results");
const statsDiv = document.getElementById("stats");

// State
let monitoringEnabled = false;

/**
 * Update the UI to reflect monitoring state
 */
function updateMonitoringUI(enabled) {
  monitoringEnabled = enabled;

  if (enabled) {
    statusIndicator.className = "status-indicator proxied";
    statusText.textContent = "Monitoring: ENABLED (via MITMproxy)";
    toggleBtn.textContent = "Disable Monitoring";
    toggleBtn.className = "btn btn-disable";
  } else {
    statusIndicator.className = "status-indicator direct";
    statusText.textContent = "Monitoring: DISABLED (direct)";
    toggleBtn.textContent = "Enable Monitoring";
    toggleBtn.className = "btn btn-enable";
  }

  toggleBtn.disabled = false;
}

/**
 * Fetch monitoring status from API
 */
async function fetchStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/monitoring/status`);
    const data = await response.json();
    updateMonitoringUI(data.enabled);
  } catch (error) {
    console.error("Failed to fetch status:", error);
    statusText.textContent = "Error: Cannot connect to API";
    toggleBtn.disabled = true;
  }
}

/**
 * Toggle monitoring state
 */
async function toggleMonitoring() {
  toggleBtn.disabled = true;
  toggleBtn.textContent = "Updating...";

  const endpoint = monitoringEnabled ? "/api/monitoring/disable" : "/api/monitoring/enable";

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, { method: "POST" });
    const data = await response.json();

    if (data.success) {
      updateMonitoringUI(data.enabled);
    } else {
      throw new Error(data.error || "Unknown error");
    }
  } catch (error) {
    console.error("Failed to toggle monitoring:", error);
    alert(`Failed to toggle monitoring: ${error.message}`);
    toggleBtn.disabled = false;
    toggleBtn.textContent = monitoringEnabled ? "Disable Monitoring" : "Enable Monitoring";
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

  const price = document.createElement("div");
  price.className = "product-price";
  price.textContent = `$${(product.price || 0).toFixed(2)}`;

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
 */
async function searchProducts(query) {
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
    const response = await fetch(`http://localhost:9080/es/products/_search`, {
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
  }
}

// Event listeners
toggleBtn.addEventListener("click", toggleMonitoring);
searchBtn.addEventListener("click", handleSearch);
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleSearch();
  }
});

// Initialize
fetchStatus();

// Auto-refresh status every 5 seconds
setInterval(fetchStatus, 5000);
