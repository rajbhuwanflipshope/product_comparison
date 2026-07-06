const PENDING_SEARCHES = {};
let AUTOMATION_ACTIVE = false;
let CURRENT_AUTO_PRODUCT = null;
let CURRENT_AUTO_DETAILS = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "pushToDB") {
    fetch("https://team.flipshope.com/api/priceComparison/addpricecomparisondataext", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload)
    })
      .then(async res => {
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error("API returned status " + res.status + " - " + errText);
        }
        return res.json();
      })
      .then(data => {
        console.log("[Background] Push Success. Response data:", data);
        const parentId = data?.parentId || data?.data?.parentId || (data && typeof data === 'object' ? data.parentId : null);
        console.log("[Background] Extracted parentId:", parentId);
        sendResponse({ success: true, parentId: parentId, rawData: data });
      })
      .catch(err => {
        console.error("[Background] Push Error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Return true to indicate we wish to send a response asynchronously
  }

  // Handle synchronous messages
  if (request.action === "searchProduct") {
    const targetQuery = request.query || "";
    const targetDetails = request.target || request.details || { brand: '', model: '', storage: '' };
    const mainTabId = sender.tab.id;

    console.log("[Background] Starting tab-based search for:", targetQuery);

    let cromaQuery = `${targetDetails.brand || ""} ${targetDetails.model || ""} ${targetDetails.storage || ""}`;
    if (targetDetails.category === 'tablet' && targetDetails.connectivity) {
      cromaQuery += ` ${targetDetails.connectivity}`;
    }
    cromaQuery = cromaQuery.replace(/\s+/g, ' ').trim();
    if (!cromaQuery) {
      cromaQuery = targetQuery;
    }

    // Filter out the current store
    const storesToSearch = [
      { id: 'amazon', url: `https://www.amazon.in/s?k=${encodeURIComponent(targetQuery)}` },
      { id: 'flipkart', url: `https://www.flipkart.com/search?q=${encodeURIComponent(targetQuery)}` },
      { id: 'croma', url: `https://www.croma.com/searchB?q=${encodeURIComponent(cromaQuery)}%3Arelevance` },
      { id: 'reliance_digital', url: `https://www.reliancedigital.in/products?q=${encodeURIComponent(targetDetails.brand + " " + targetDetails.model + " " + (targetDetails.storage || ''))}` }
    ].filter(s => s.id !== request.currentStoreId);

    // Store pending state
    PENDING_SEARCHES[mainTabId] = {
      results: {},
      tabsCount: storesToSearch.length,
      tabsResponded: 0,
      activeTabs: []
    };

    console.log(`[Background] Searching ${storesToSearch.length} stores (Skipping: ${request.currentStoreId})`);

    storesToSearch.forEach(store => {
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

  if (request.action === "startAutomation") {
    startAutomation();
    sendResponse({ success: true });
  }

  if (request.action === "stopAutomation") {
    stopAutomation();
    sendResponse({ success: true });
  }

  if (request.action === "getAutomationStatus") {
    sendResponse({ active: AUTOMATION_ACTIVE });
  }

  return false; // Guarantee synchronous port closure by default
});

function handleTabResult(mainTabId, storeId, data) {
  if (!PENDING_SEARCHES[mainTabId]) return;

  if (!PENDING_SEARCHES[mainTabId].results[storeId]) {
    PENDING_SEARCHES[mainTabId].results[storeId] = data;
    PENDING_SEARCHES[mainTabId].tabsResponded++;

    // If all responded, send back to UI or finish automation step
    if (PENDING_SEARCHES[mainTabId].tabsResponded === PENDING_SEARCHES[mainTabId].tabsCount) {
      console.log(`[Background] All stores responded for mainTabId: ${mainTabId}`);
      if (mainTabId === "automation") {
        handleAutomationCompletion(PENDING_SEARCHES[mainTabId].results);
      } else {
        chrome.tabs.sendMessage(parseInt(mainTabId), {
          action: "searchResults",
          success: true,
          data: { results: PENDING_SEARCHES[mainTabId].results }
        }).catch(err => console.log("Error sending to UI:", err));
      }
      delete PENDING_SEARCHES[mainTabId];
    }
  }
}

function startAutomation() {
  AUTOMATION_ACTIVE = true;
  console.log("[Background] Automation Started.");
  runNextAutomationStep();
}

function stopAutomation() {
  AUTOMATION_ACTIVE = false;
  console.log("[Background] Automation Stopped.");
}

async function runNextAutomationStep() {
  if (!AUTOMATION_ACTIVE) return;

  console.log("[Background] Fetching next product from MongoDB...");
  try {
    const resProduct = await fetch("http://localhost:5000/get-next-product");
    if (!resProduct.ok) {
      const errText = await resProduct.text();
      console.log("[Background] No product to process or server error:", errText);
      // Wait 10 seconds and retry
      setTimeout(runNextAutomationStep, 10000);
      return;
    }

    const product = await resProduct.json();
    if (product.status === "empty") {
      console.log("[Background] All products processed.");
      AUTOMATION_ACTIVE = false;
      return;
    }

    CURRENT_AUTO_PRODUCT = product; // { status, sid, pid, title }

    // Extract details locally using the same parser as content.js
    const details = extractAttributes(product.title);
    CURRENT_AUTO_DETAILS = details;

    // Validate that Brand, Model, and Storage are present, not null, and not "N/A"
    const isBrandValid = details.brand && details.brand.trim() !== "" && details.brand.toLowerCase() !== "n/a" && details.brand.toLowerCase() !== "null";
    const isModelValid = details.model && details.model.trim() !== "" && details.model.toLowerCase() !== "n/a" && details.model.toLowerCase() !== "null";
    const isStorageValid = details.storage && details.storage.trim() !== "" && details.storage.toLowerCase() !== "n/a" && details.storage.toLowerCase() !== "null";

    if (!isBrandValid || !isModelValid || !isStorageValid) {
      console.log("[Background] Skipping product: Brand, Model, or Storage is missing/invalid.", details);

      // Construct brandModel for skip log
      const brandClean = details.brand ? details.brand.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : '';
      const modelClean = details.model ? details.model.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : '';
      const storageVal = details.storage ? details.storage.toLowerCase().replace(/\D/g, '') : '';
      const brandModel = `${brandClean}-${modelClean}-${storageVal}`.replace(/-+/g, '-').replace(/^-|-$/g, '');

      // Save placeholder to destination DB so it doesn't get processed again
      try {
        await fetch("http://localhost:5000/mark-skipped", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pid: product.pid, sid: product.sid, brandModel: brandModel })
        });
        console.log("[Background] Marked as skipped in DB.");
      } catch (err) {
        console.error("[Background] Failed to mark as skipped in DB:", err);
      }

      setTimeout(runNextAutomationStep, 3000);
      return;
    }

    console.log(`[Background] Processing product: ${product.title} (sid=${product.sid}, pid=${product.pid})`);

    // Start search flow
    startAutoSearch(product.title, details, product.sid);
  } catch (error) {
    console.error("[Background] Automation Step Error:", error);
    // Wait 10 seconds and retry
    setTimeout(runNextAutomationStep, 10000);
  }
}

function startAutoSearch(targetQuery, targetDetails, sourceSid) {
  const storeMap = {
    1: 'flipkart',
    2: 'amazon',
    13: 'croma',
    14: 'reliance_digital'
  };

  const currentStoreId = storeMap[sourceSid];

  let cromaQuery = `${targetDetails.brand || ""} ${targetDetails.model || ""} ${targetDetails.storage || ""}`;
  if (targetDetails.category === 'tablet' && targetDetails.connectivity) {
    cromaQuery += ` ${targetDetails.connectivity}`;
  }
  cromaQuery = cromaQuery.replace(/\s+/g, ' ').trim();
  if (!cromaQuery) {
    cromaQuery = targetQuery;
  }

  const storesToSearch = [
    { id: 'amazon', url: `https://www.amazon.in/s?k=${encodeURIComponent(targetQuery)}` },
    { id: 'flipkart', url: `https://www.flipkart.com/search?q=${encodeURIComponent(targetQuery)}` },
    { id: 'croma', url: `https://www.croma.com/searchB?q=${encodeURIComponent(cromaQuery)}%3Arelevance` },
    { id: 'reliance_digital', url: `https://www.reliancedigital.in/products?q=${encodeURIComponent(targetDetails.brand + " " + targetDetails.model + " " + (targetDetails.storage || ''))}` }
  ].filter(s => s.id !== currentStoreId);

  // Store pending state using the special "automation" key
  PENDING_SEARCHES["automation"] = {
    results: {},
    tabsCount: storesToSearch.length,
    tabsResponded: 0,
    activeTabs: []
  };

  console.log(`[Background] Auto-Searching ${storesToSearch.length} stores (Skipping: ${currentStoreId})`);

  storesToSearch.forEach(store => {
    const fullUrl = store.url + (store.url.includes('?') ? '&' : '?') + `sp_matcher=true&sp_target=${encodeURIComponent(JSON.stringify(targetDetails))}&sp_store=${store.id}`;

    chrome.tabs.create({ url: fullUrl, active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        console.warn(`[Background] Failed to create tab for ${store.id}:`, chrome.runtime.lastError);
        handleTabResult("automation", store.id, { exact: null, variant: null });
        return;
      }
      PENDING_SEARCHES["automation"].activeTabs.push(tab.id);

      // Safety timeout (20 seconds max)
      setTimeout(() => {
        if (PENDING_SEARCHES["automation"] && PENDING_SEARCHES["automation"].activeTabs.includes(tab.id)) {
          console.log(`[Background] Auto timeout for ${store.id}, closing tab.`);
          chrome.tabs.remove(tab.id).catch(() => { });
          handleTabResult("automation", store.id, { exact: null, variant: null });
        }
      }, 20000);
    });
  });
}

async function handleAutomationCompletion(results) {
  console.log("[Background] Automation search completed. Processing results:", results);

  const sidMap = {
    'flipkart': 1,
    'amazon': 2,
    'croma': 13,
    'reliance_digital': 14
  };

  // Format data array: start with the source product if it's one of our target stores (1, 2, 13, 14)
  const allowedSids = [1, 2, 13, 14];
  const data = [];
  if (allowedSids.includes(CURRENT_AUTO_PRODUCT.sid)) {
    data.push({
      pid: CURRENT_AUTO_PRODUCT.pid,
      sid: CURRENT_AUTO_PRODUCT.sid
    });
  }

  // Add exact matches only
  for (const [storeId, links] of Object.entries(results)) {
    const sid = sidMap[storeId];
    if (sid && links.exact) {
      const pid = extractPidFromUrl(links.exact, sid);
      if (pid && !data.find(x => x.pid === pid)) {
        data.push({ pid, sid });
      }
    }
  }

  const details = CURRENT_AUTO_DETAILS || {};
  const ramVal = details.ram ? details.ram.replace(/\D/g, '') : '';
  const storageVal = details.storage ? details.storage.toLowerCase().replace(/\D/g, '') : '';
  
  // Format model and brand exactly like content.js manual push payload
  let fullModel = `${details.model || ''} ${ramVal} ${storageVal}`.replace(/\s+/g, ' ').trim();
  const brandName = details.brand || "";

  // Helper brandModel slug for local skip tracker notification
  const brandClean = brandName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const modelClean = (details.model || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const brandModel = `${brandClean}-${modelClean}-${storageVal}`.replace(/-+/g, '-').replace(/^-|-$/g, '');

  // Construct payload with brand, model, and priceComparisonData exactly as expected by the API
  const payload = {
    brand: brandName,
    model: fullModel,
    priceComparisonData: data
  };

  // Only save if we found at least one exact match from other platforms (total items > 1)
  if (data.length > 1) {
    console.log("[Background] Saving exact matches to Database:", payload);
    try {
      const res = await fetch("https://team.flipshope.com/api/priceComparison/addpricecomparisondataext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const responseData = await res.json().catch(() => ({}));
        const parentId = responseData?.parentId || responseData?.data?.parentId || "N/A";
        console.log(`[Background] Push to database successful. parentId: ${parentId}. Response:`, responseData);
        // Notify local server to mark as processed/skipped in memory and DB
        fetch("http://localhost:5000/mark-skipped", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pid: CURRENT_AUTO_PRODUCT.pid, sid: CURRENT_AUTO_PRODUCT.sid, brandModel: brandModel })
        }).catch(e => console.log("Failed to notify local mark-skipped:", e));
      } else {
        const errText = await res.text().catch(() => "");
        console.error("[Background] Push failed with status:", res.status, "Error details:", errText);
      }
    } catch (err) {
      console.error("[Background] Push Error:", err);
    }
  } else {
    console.log("[Background] No exact matches found. Skipping save, but marking as skipped in DB to prevent loops.");
    try {
      await fetch("http://localhost:5000/mark-skipped", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid: CURRENT_AUTO_PRODUCT.pid, sid: CURRENT_AUTO_PRODUCT.sid, brandModel: brandModel })
      });
    } catch (err) {
      console.error("[Background] Failed to mark as skipped in DB:", err);
    }
  }

  // Wait 3 seconds and run next product
  setTimeout(runNextAutomationStep, 3000);
}

function extractPidFromUrl(urlStr, sid) {
  try {
    const u = new URL(urlStr);
    if (sid === 1) return u.searchParams.get("pid");
    if (sid === 2) { const m = u.pathname.match(/\/dp\/([A-Z0-9]+)/); return m ? m[1] : null; }
    if (sid === 13) { const m = u.pathname.match(/\/p\/([a-zA-Z0-9]+)/); return m ? m[1] : null; }
    if (sid === 14) { const p = u.pathname.split('/'); return p[p.length - 1]; }
  } catch (e) { }
  return null;
}

function extractAttributes(title) {
  const brands = ['cmf by nothing', 'apple', 'samsung', 'vivo', 'oppo', 'oneplus', 'xiaomi', 'redmi', 'realme', 'poco', 'motorola', 'google', 'nothing', 'iqoo', 'asus', 'nokia', 'infinix', 'tecno', 'itel', 'honor', 'lava', 'micromax', 'cmf'];
  const baseColors = ['black', 'white', 'blue', 'green', 'red', 'grey', 'gray', 'orange', 'silver', 'gold', 'purple', 'yellow', 'pink', 'lavender', 'titanium', 'graphite', 'cream', 'phantom', 'mint', 'cyan', 'magenta', 'violet', 'sunshower', 'rainy night', 'rainforest', 'chrome', 'marble', 'pearl', 'shadow', 'dusk', 'twilight', 'nordic', 'aurora', 'ruby', 'amber', 'coral', 'opal', 'topaz', 'pastel', 'lemon', 'plum', 'bifrost', 'brown', 'cappuccino', 'titan', 'pantone', 'shamrock'];
  
  const details = { brand: '', model: '', ram: '', storage: '', color: '' };
  const rawQuery = title.toLowerCase();
  
  // 1. Extract RAM and Storage
  const gbMatches = [...rawQuery.matchAll(/\b(\d+)\s*(GB|TB|MB)\b/gi)];
  const gbValues = gbMatches.map(m => {
    const val = parseInt(m[1]);
    const unit = m[2].toUpperCase();
    let sortVal = val;
    if (unit === 'TB') sortVal = val * 1024;
    if (unit === 'MB') sortVal = val / 1024;
    return { str: `${val}${unit}`, sortVal };
  }).sort((a, b) => a.sortVal - b.sortVal);

  if (gbValues.length >= 2) {
    details.ram = gbValues[0].str;
    details.storage = gbValues[gbValues.length - 1].str;
  } else if (gbValues.length === 1) {
    // If only one is found, check keywords to decide if it's RAM or Storage
    if (rawQuery.includes('ram')) {
      details.ram = gbValues[0].str;
    } else {
      details.storage = gbValues[0].str;
    }
  }

  // Fallback: Handle X/Y GB pattern (e.g., 8/128, 12/256, 8GB+128GB)
  if (!details.ram || !details.storage) {
    const slashMatch = rawQuery.match(/\b(\d{1,2})\s*\/\s*(\d{2,4})\b/);
    if (slashMatch) {
      if (!details.ram) details.ram = slashMatch[1] + 'GB';
      if (!details.storage) details.storage = slashMatch[2] + 'GB';
    }
    const plusMatch = rawQuery.match(/\b(\d{1,2})gb\s*\+\s*(\d{2,4})gb\b/i);
    if (plusMatch) {
      if (!details.ram) details.ram = plusMatch[1] + 'GB';
      if (!details.storage) details.storage = plusMatch[2] + 'GB';
    }
  }

  // 2.  // Match brand
  for (const b of brands) {
    if (rawQuery.includes(b)) {
       // Proper Case the brand
       details.brand = b.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
       break;
    }
  }

  // 3. Extract Color
  const poeticColors = [
    'starry', 'lunar', 'lunar dust', 'dream', 'azure', 'jewel', 'golden', 'glow',
    // Pixel Colors
    'obsidian', 'indigo', 'frost', 'limoncello', 'porcelain', 'moonstone', 'jade', 'berry', 'mint', 'wintergreen', 'peony', 'hazel', 'rose quartz', 'iris', 'rose', 'bay', 'aloe', 'snow', 'lemongrass', 'charcoal', 'sea', 'coral', 'stormy black', 'sorta seafoam', 'kinda coral', 'cloudy white', 'sorta sunny', 'chalk', 'sage', 'just black', 'sorta sage', 'mostly black', 'clearly white', 'barely blue',
    // Samsung Colors
    'phantom black', 'phantom white', 'phantom gray', 'phantom silver', 'phantom navy', 'phantom titanium', 'graphite', 'titanium black', 'titanium gray', 'titanium violet', 'titanium yellow', 'phantom blue', 'sky blue', 'ice blue', 'cloud blue', 'sierra blue', 'icy blue', 'blue black', 'phantom green', 'lime', 'khaki', 'awesome green', 'phantom violet', 'bora purple', 'lavender', 'lilac purple', 'pink gold', 'rose gold', 'burgundy', 'mystic gold', 'champagne gold', 'cream', 'ivory', 'beige', 'sand', 'amber yellow', 'mystic black', 'mystic white', 'mystic bronze', 'mystic blue', 'mystic gray', 'mystic red', 'mystic green', 'awesome black', 'awesome white', 'awesome blue', 'awesome violet', 'awesome peach', 'awesome lime', 'awesome graphite', 'mirror purple', 'mirror black', 'mirror gold', 'gray green',
    // Others
    'cosmic orange', 'cosmic', 'sunshower', 'rainy night', 'rainy', 'night', 'rainforest', 'forest', 'velvet', 'ultramarine', 'desert', 'volcano', 'nebula', 'glacier', 'starlight', 'midnight', 'mist', 'titanium', 'phantom', 'emerald', 'copper', 'olive', 'sapphire', 'teal', 'indigo', 'bronze', 'peach', 'slate', 'aqua', 'pearl', 'maroon', 'rose', 'lilac', 'cobalt', 'violet', 'voilet', 'navy', 'carbon', 'coral', 'limestone', 'winter'
  ];
  const extendedColors = [...baseColors, ...poeticColors];
  const colorSegments = [];
  
  // A. Check inside parentheses
  const parenMatches = [...title.matchAll(/\((.*?)\)/g)];
  for (const m of parenMatches) {
    const content = m[1].toLowerCase();
    // If it contains a color word, it's a color segment
    if (extendedColors.some(c => new RegExp('\\b' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(content))) {
       colorSegments.push(m[1]);
    }
  }
  
  // B. Check chunks separated by common delimiters (including parentheses to separate color from specs inside the same group)
  colorSegments.push(...title.split(/[,\(\)\|:;\-]/));

  for (const part of colorSegments) {
    const p = part.trim();
    if (!/\d{3,}/.test(p) && p.length > 2) {
       const pLower = p.toLowerCase();
       if (pLower === 'mobile phone' || pLower === 'smartphone' || pLower === 'dual sim' || pLower.includes('storage')) continue;
       
       // Special check: If this segment contains 'Phone' and we are looking at 'Nothing' or 'CMF', it might be the model
       const isNothingRelated = details.brand.toLowerCase().includes('nothing') || details.brand.toLowerCase() === 'cmf';
       if (isNothingRelated && pLower.includes('phone')) continue;

       // If this segment contains any known color word, find the exact color word!
       const foundColor = extendedColors.find(c => new RegExp('\\b' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(pLower));
       if (foundColor) {
           // CLEANUP: If the segment is long, it might contain brand/model info.
           // Let's strip brand and common fluff from the color string.
           let cleanColor = p;
           if (details.brand) {
               cleanColor = cleanColor.replace(new RegExp('\\b' + details.brand + '\\b', 'gi'), '');
           }
           // Strip common series names
           const seriesFluff = ['phone', 'pixel', 'galaxy', 'iphone', 'pro', 'max', 'plus', 'ultra', 'moto', 'edge', 'series', 'edition', 'speed', 'prime', 'neo', 'nord', 'lite', 'flip', 'fold', 'active', 'super', 'play', 'power', 'stylus', 'zoom', 'null', 'na'];
           seriesFluff.forEach(sf => {
               cleanColor = cleanColor.replace(new RegExp('\\b' + sf + '\\b', 'gi'), '');
           });

           // Strip any standalone numbers (like model '10' or '25')
           cleanColor = cleanColor.replace(/\b\d+[a-z]?\b/gi, ' ');
           
           // Strip ANY words that were part of the detected model name (to avoid '9A Porcelain')
           if (details.model) {
               const modelWords = details.model.toLowerCase().split(/\s+/);
               modelWords.forEach(mw => {
                   if (mw.length > 1) {
                       cleanColor = cleanColor.replace(new RegExp('\\b' + mw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), ' ');
                   }
               });
           }
           
           details.color = cleanColor.replace(/[,\(\)\|:;\-\+]/g, ' ').replace(/\s+/g, ' ').trim();
           // Ensure it starts with a capital letter
           if (details.color) {
               details.color = details.color.charAt(0).toUpperCase() + details.color.slice(1);
           }
           break;
       }
    }
  }

  // C. Fallback: Multi-word scanning for specific requested colors
  if (!details.color) {
    const lowerTitle = title.toLowerCase();
    const specificMultiWords = [
      // Samsung & Pixel Complex Colors
      'phantom black', 'phantom white', 'phantom gray', 'phantom silver', 'phantom navy', 'phantom titanium', 'titanium black', 'titanium gray', 'titanium violet', 'titanium yellow', 'phantom blue', 'sky blue', 'ice blue', 'cloud blue', 'sierra blue', 'icy blue', 'blue black', 'phantom green', 'awesome green', 'phantom violet', 'bora purple', 'lilac purple', 'pink gold', 'rose gold', 'mystic gold', 'champagne gold', 'amber yellow', 'mystic black', 'mystic white', 'mystic bronze', 'mystic blue', 'mystic gray', 'mystic red', 'mystic green', 'awesome black', 'awesome white', 'awesome blue', 'awesome violet', 'awesome peach', 'awesome lime', 'awesome graphite', 'mirror purple', 'mirror black', 'mirror gold', 'gray green',
      'rose quartz', 'stormy black', 'sorta seafoam', 'kinda coral', 'cloudy white', 'sorta sunny', 'just black', 'sorta sage', 'mostly black', 'clearly white', 'barely blue',
      'cosmic orange', 'sunshower', 'rainy night', 'rainforest', 'black velvet', 'desert titanium'
    ];
    for (const smw of specificMultiWords) {
      if (lowerTitle.includes(smw)) {
        details.color = smw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        break;
      }
    }
  }

  // D. Fallback to scanning individual words
  if (!details.color) {
    const words = title.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
        const w = words[i].toLowerCase().replace(/[^a-z]/g, '');
        if (extendedColors.includes(w)) {
            if (i > 0) {
               const prev = words[i-1].toLowerCase().replace(/[^a-z]/g, '');
               const ignorePrev = ['gb', 'tb', 'mb', 'ram', 'rom', 'storage', 'smartphone', 'mobile', 'phone', '5g', '4g', 'with', 'and', 'for', 'model', 'edition'];
               // If the previous word isn't a spec/fluff, it's likely a color modifier (e.g. "Awesome Iceblue")
               if (!ignorePrev.includes(prev) && !/\d+/.test(words[i-1])) {
                  details.color = words[i-1].charAt(0).toUpperCase() + words[i-1].slice(1) + ' ' + words[i].charAt(0).toUpperCase() + words[i].slice(1);
                  break;
               }
            }
            details.color = words[i].charAt(0).toUpperCase() + words[i].slice(1);
            break;
        }
    }
  }

  // 4. Extract Model (The "Clean Sweep")
  let modelPart = title;
  
  // A. Remove Brand BEFORE splitting, so we don't accidentally split on words inside the brand (like "by" in "CMF by Nothing")
  if (details.brand) {
      const safeBrand = details.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      modelPart = modelPart.replace(new RegExp('\\b' + safeBrand + '\\b', 'gi'), '');
  }

  // Special handling for Nothing/CMF brand which uses parentheses in model names like "Phone (2a)"
  let splitRegex = /\|| - | \(|:|\bwith\b|\bby\b|\bcharger\b/i;
  const isNothingRelated = details.brand && (details.brand.toLowerCase().includes('nothing') || details.brand.toLowerCase() === 'cmf');
  if (isNothingRelated && /phone\s*\(.*?\)/i.test(title)) {
    // If there's a word right after the parentheses like "Pro", we want to keep it too.
    splitRegex = /\|| - |:|\bwith\b|\bby\b|\bcharger\b/i;
  }
  modelPart = modelPart.split(splitRegex)[0].trim();
  
  // B. Remove anything inside remaining parentheses (unless it's a Nothing/CMF model part)
  if (!(isNothingRelated && /phone\s*\(.*?\)/i.test(modelPart))) {
    modelPart = modelPart.replace(/\(.*?\)/g, ' ');
  }

  // C. Remove ALL specs
  modelPart = modelPart.replace(/\b\d+\s*(?:GB|TB|MB|RAM|ROM)\b/gi, '');
  
  // D. Remove standalone RAM/Storage numbers (e.g. "128" in "GT 30 128")
  // Only remove if the number is >= 32 to avoid stripping phone model numbers (like '3' in Vision 3, '8' in Realme 8, '12' in OnePlus 12)
  if (details.ram) {
    const rVal = details.ram.replace(/\D/g, '');
    const rNum = parseInt(rVal);
    if (!isNaN(rNum) && rNum >= 32) {
      modelPart = modelPart.replace(new RegExp('\\b' + rVal + '\\b', 'g'), '');
    }
  }
  if (details.storage) {
    const sVal = details.storage.replace(/\D/g, '');
    const sNum = parseInt(sVal);
    if (!isNaN(sNum) && sNum >= 32) {
      modelPart = modelPart.replace(new RegExp('\\b' + sVal + '\\b', 'g'), '');
    }
  }

  // Extra strict clean for spec words left behind
  modelPart = modelPart.replace(/\b(?:ram|rom|storage|memory|5g\+?|4g)\b/gi, '');

  // F. Remove measurements (e.g. 15.93 cm, 6.3")
  modelPart = modelPart.replace(/\b\d+(?:\.\d+)?\s*(?:cm|inch|inches|")\b/gi, '');
  
  // D. Remove the specific Extracted Color string
  if (details.color) {
     const safeColor = details.color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
     modelPart = modelPart.replace(new RegExp('\\b' + safeColor + '\\b', 'gi'), '');
  }

  // E. Remove ALL raw color words (Fallback)
  extendedColors.forEach(c => {
    modelPart = modelPart.replace(new RegExp('\\b' + c + '\\b', 'gi'), '');
  });

  // Strip nm chip specifications (e.g. 6nm, 4nm)
  modelPart = modelPart.replace(/\b\d+nm\b/gi, ' ');

  // E. Remove common fluff words and store names
  const fluff = [
    'amazon.in', 'amazon', 'flipkart', 'croma', 'reliance', 'digital', 'buy', 'online', 'price', 'india', 'at', 'best', 'in',
    'smartphone', 'mobile', 'phone', 'unlocked', 'dual', 'sim', 'display', 'promotion', 'front', 'back', 'camera', 'ai', 'with', 'built-in', 'privacy',
    'prime edition', 'prime', 'limited edition', 'special edition',
    'snapdragon', 'mediatek', 'dimensity', 'helio', 'unisoc', 'exynos', 'bionic', 'processor',
    'indian version', 'indian', 'global version', 'global', 'version', 'lte', 'cellular', 'cell', '5g', '4g', '3g',
    'support', 'fingerprint', 'gps', 'wifi', 'wi-fi', 'bluetooth', 'nfc', 'charger', 'battery', 'screen',
    'hd', 'hd+', 'fhd', 'fhd+', 'qhd', 'qhd+', 'amoled', 'lcd', 'ips', 'chip'
  ];
  fluff.forEach(word => {
    // Only remove 'phone' if it's NOT a Nothing/CMF product (where Phone is the model)
    if (word === 'phone' && isNothingRelated) return;
    modelPart = modelPart.replace(new RegExp('\\b' + word.replace(/[.+*?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), '');
  });

  // Clean punctuation and trim (preserve trailing '+' for models like S24+)
  details.model = modelPart.replace(/[,\(\)\|:;\-\.]/g, ' ').replace(/(?<!\w)\+(?!\w)/g, ' ').replace(/\s+/g, ' ').trim();
  
  // --- FINAL CROSS-CLEANING PASS ---
  // Ensure model words aren't in the color, and color words aren't in the model
  if (details.color && details.model) {
      const modelWords = details.model.toLowerCase().split(/\s+/);
      let cleanColor = details.color;
      modelWords.forEach(mw => {
          if (mw.length > 1) {
              cleanColor = cleanColor.replace(new RegExp('\\b' + mw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), ' ');
          }
      });
      // Final color cleanup: remove any remaining special characters or fluff
      details.color = cleanColor.replace(/[,\(\)\|:;\-\+]/g, ' ').replace(/\s+/g, ' ').trim();
      if (details.color) {
          details.color = details.color.charAt(0).toUpperCase() + details.color.slice(1);
      }

      // Re-clean model just in case the color string removal left artifacts
      const safeColor = details.color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      details.model = details.model.replace(new RegExp('\\b' + safeColor + '\\b', 'gi'), '').replace(/\s+/g, ' ').trim();
  }

  return details;
}

chrome.action.onClicked.addListener((tab) => {
  console.log("[Background] Extension icon clicked in tab:", tab.id, "URL:", tab.url);
  if (!tab.id) return;

  chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["styles.css"]
  })
  .then(() => {
    console.log("[Background] CSS injected successfully.");
    return chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  })
  .then(() => {
    console.log("[Background] JS injected successfully.");
  })
  .catch(err => {
    console.error("[Background] Script injection failed:", err);
  });
});
