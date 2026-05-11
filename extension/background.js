const PENDING_SEARCHES = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "searchProduct") {
    const targetQuery = request.query || "";
    const targetDetails = request.target || request.details || { brand: '', model: '', storage: '' };
    const mainTabId = sender.tab.id;

    console.log("[Background] Starting tab-based search for:", targetQuery);

    // Store pending state
    PENDING_SEARCHES[mainTabId] = {
      results: {},
      tabsCount: 4,
      tabsResponded: 0,
      activeTabs: []
    };

    const stores = [
      { id: 'amazon', url: `https://www.amazon.in/s?k=${encodeURIComponent(targetQuery)}` },
      { id: 'flipkart', url: `https://www.flipkart.com/search?q=${encodeURIComponent(targetQuery)}` },
      { id: 'croma', url: `https://www.croma.com/searchB?q=${encodeURIComponent(targetQuery)}%3Arelevance` },
      { id: 'reliance_digital', url: `https://www.reliancedigital.in/products?q=${encodeURIComponent(targetDetails.brand + " " + targetDetails.model + " " + targetDetails.storage)}` }
    ];

    stores.forEach(store => {
      const fullUrl = store.url + (store.url.includes('?') ? '&' : '?') + `sp_matcher=true&sp_target=${encodeURIComponent(JSON.stringify(targetDetails))}&sp_store=${store.id}`;

      chrome.tabs.create({ url: fullUrl, active: false }, (tab) => {
        PENDING_SEARCHES[mainTabId].activeTabs.push(tab.id);

        // Safety timeout (20 seconds max)
        setTimeout(() => {
          if (PENDING_SEARCHES[mainTabId] && PENDING_SEARCHES[mainTabId].activeTabs.includes(tab.id)) {
            console.log(`[Background] Timeout for ${store.id}, closing tab.`);
            chrome.tabs.remove(tab.id).catch(() => { });
            handleTabResult(mainTabId, store.id, { exact: null, variant: null });
          }
        }, 20000);
      });
    });

    sendResponse({ status: "started" });
  }

  if (request.action === "submitScrapedData") {
    const senderTabId = sender.tab.id;
    const url = new URL(sender.tab.url);
    const storeId = url.searchParams.get("sp_store");

    // Find which main tab initiated this
    let foundMainTabId = null;
    for (const [mainId, data] of Object.entries(PENDING_SEARCHES)) {
      if (data.activeTabs.includes(senderTabId)) {
        foundMainTabId = mainId;
        break;
      }
    }

    if (foundMainTabId && storeId) {
      console.log(`[Background] Received data from ${storeId}`);
      // Remove from active tabs and close it
      PENDING_SEARCHES[foundMainTabId].activeTabs = PENDING_SEARCHES[foundMainTabId].activeTabs.filter(id => id !== senderTabId);
      chrome.tabs.remove(senderTabId).catch(() => { });

      handleTabResult(foundMainTabId, storeId, request.data);
    }
  }

  if (request.action === "pushToDB") {
    fetch("https://teamdev.flipshope.com/api/priceComparison/addpricecomparisondataext", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload)
    })
      .then(res => {
        if (!res.ok) throw new Error("API returned status " + res.status);
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error("[Background] Push Error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Return true to indicate we wish to send a response asynchronously
  }
});

function handleTabResult(mainTabId, storeId, data) {
  if (!PENDING_SEARCHES[mainTabId]) return;

  if (!PENDING_SEARCHES[mainTabId].results[storeId]) {
    PENDING_SEARCHES[mainTabId].results[storeId] = data;
    PENDING_SEARCHES[mainTabId].tabsResponded++;

    // If all responded, send back to UI
    if (PENDING_SEARCHES[mainTabId].tabsResponded === PENDING_SEARCHES[mainTabId].tabsCount) {
      console.log("[Background] All stores responded! Sending to UI.");
      chrome.tabs.sendMessage(parseInt(mainTabId), {
        action: "searchResults",
        success: true,
        data: { results: PENDING_SEARCHES[mainTabId].results }
      }).catch(err => console.log("Error sending to UI:", err));
      delete PENDING_SEARCHES[mainTabId];
    }
  }
}
