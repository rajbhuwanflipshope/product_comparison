const STORE_ICONS = {
  amazon: "https://www.amazon.in/favicon.ico",
  flipkart: "https://www.flipkart.com/favicon.ico",
  croma: "https://www.croma.com/favicon.ico",
  reliance_digital: "https://www.reliancedigital.in/favicon.ico"
};

const STORE_NAMES = {
  amazon: "Amazon",
  flipkart: "Flipkart",
  croma: "Croma",
  reliance_digital: "Reliance Digital"
};

// --- ATTRIBUTE EXTRACTION LOGIC ---
function extractAttributes(title) {
  const brands = ['apple', 'samsung', 'vivo', 'oppo', 'oneplus', 'xiaomi', 'redmi', 'realme', 'poco', 'motorola', 'google', 'nothing', 'iqoo', 'asus', 'nokia'];
  const baseColors = ['black', 'white', 'blue', 'green', 'red', 'grey', 'gray', 'orange', 'silver', 'gold', 'purple', 'yellow', 'pink', 'lavender', 'titanium', 'graphite', 'cream', 'phantom', 'mint', 'cyan', 'magenta', 'violet'];
  
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
    if (rawQuery.includes('ram')) details.ram = gbValues[0].str;
    else details.storage = gbValues[0].str;
  }

  // 2. Extract Brand
  for (const b of brands) {
    if (rawQuery.includes(b)) {
      details.brand = b.charAt(0).toUpperCase() + b.slice(1);
      break;
    }
  }

  // 3. Extract Color
  // A. Check inside parentheses first (e.g. "(Cobalt Violet, 256 GB)")
  const parenMatch = title.match(/\((.*?)\)/);
  if (parenMatch) {
    const parts = parenMatch[1].split(',');
    for (const part of parts) {
      if (!/\d+/.test(part) && part.trim().length > 2) {
         details.color = part.trim();
         break;
      }
    }
  }
  
  const extendedColors = [...baseColors, 'cobalt', 'violet', 'voilet', 'lavender', 'titanium', 'graphite', 'phantom', 'cream', 'mint', 'emerald', 'obsidian', 'porcelain', 'hazel', 'bay', 'coral', 'sea', 'charcoal', 'limestone', 'winter', 'mist', 'frost', 'berry'];

  // B. Fallback to scanning words if no color found in parentheses
  if (!details.color) {
    const words = title.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
        const w = words[i].toLowerCase().replace(/[^a-z]/g, '');
        if (extendedColors.includes(w)) {
            if (i > 0) {
               const prev = words[i-1].toLowerCase().replace(/[^a-z]/g, '');
               if (['cobalt', 'phantom', 'titanium', 'winter'].includes(prev)) {
                  details.color = words[i-1] + ' ' + words[i];
                  break;
               }
            }
            details.color = words[i];
            break;
        }
    }
  }

  // 4. Extract Model (The "Clean Sweep")
  let modelPart = title;
  
  // A. Remove Brand
  if (details.brand) modelPart = modelPart.replace(new RegExp(details.brand, 'gi'), '');
  
  // B. Remove anything inside parentheses
  modelPart = modelPart.replace(/\(.*?\)/g, ' ');

  // C. Remove ALL specs
  modelPart = modelPart.replace(/\b\d+\s*(?:GB|TB|MB|RAM|ROM)\b/gi, '');
  
  // Extra strict clean for spec words left behind
  modelPart = modelPart.replace(/\b(?:ram|rom|storage|memory)\b/gi, '');
  
  // D. Remove ALL color words (Extended list)
  extendedColors.forEach(c => {
    modelPart = modelPart.replace(new RegExp('\\b' + c + '\\b', 'gi'), '');
  });

  // E. Remove common fluff words and store names
  const fluff = [
    'amazon.in', 'amazon', 'flipkart', 'croma', 'reliance', 'digital', 'buy', 'online', 'price', 'india', 'at', 'best', 'in',
    'smartphone', 'mobile', 'phone', '5g', '4g', 'unlocked', 'dual sim', 'display', 'promotion', 'front', 'back', 'camera', 'ai', 'with', 'built-in', 'privacy'
  ];
  fluff.forEach(word => {
    modelPart = modelPart.replace(new RegExp('\\b' + word.replace('.', '\\.') + '\\b', 'gi'), '');
  });

  // Clean punctuation and trim
  details.model = modelPart.replace(/[,\(\)\|:;\-]/g, ' ').replace(/\s+/g, ' ').trim();
  
  return details;
}

function isModelMatch(candidateTitle, target) {
  const title = candidateTitle.toLowerCase();
  
  // Clean target model from common fluff
  const targetModel = target.model.toLowerCase().replace(/5g|4g|smartphone|mobile|phone/g, '').trim();
  const modelWords = targetModel.split(/\s+/).filter(w => w.length > 1);
  
  // Typo-tolerant matching: Require 75% of model words to match
  let matchCount = 0;
  for (const word of modelWords) {
    if (title.includes(word)) matchCount++;
  }
  
  if (modelWords.length > 2) {
    if ((matchCount / modelWords.length) < 0.70) return false;
  } else {
    if (matchCount !== modelWords.length) return false;
  }

  // Strict modifier check (e.g., if we want Pro, don't match Pro Max)
  const modifiers = ['pro', 'plus', 'max', 'ultra', 'lite', 'fe', 'se', 'fold', 'flip', 'edge', 'neo', 'mini'];
  for (const mod of modifiers) {
    const targetHasMod = new RegExp('\\b' + mod + '\\b', 'i').test(targetModel);
    const candidateHasMod = new RegExp('\\b' + mod + '\\b', 'i').test(title);
    if (targetHasMod !== candidateHasMod) return false;
  }

  return true;
}

function isStrictMatch(candidateTitle, target) {
  if (!isModelMatch(candidateTitle, target)) return false;
  
  // Normalize both by removing ALL spaces and punctuation for spec matching
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const titleNorm = normalize(candidateTitle);
  
  if (target.ram && !titleNorm.includes(normalize(target.ram))) return false;
  if (target.storage && !titleNorm.includes(normalize(target.storage))) return false;
  
  // PHASE 3: Strict Color Matching
  if (target.color) {
    const colorWords = target.color.toLowerCase().split(/\s+/);
    const candidateLower = candidateTitle.toLowerCase();
    for (const cw of colorWords) {
      if (!candidateLower.includes(cw)) return false;
    }
  }
  
  return true;
}

// --- UI AND INJECTION LOGIC ---
function injectFAB() {
  if (document.getElementById("sp-floating-btn")) return;

  const btn = document.createElement("div");
  btn.id = "sp-floating-btn";
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;
  document.body.appendChild(btn);

  const widget = document.createElement("div");
  widget.id = "sp-widget-container";
  widget.innerHTML = `
    <div class="sp-header">
      <div class="sp-title">SmartPrice Matcher</div>
      <button class="sp-close" id="sp-close-btn">&times;</button>
    </div>
    <div class="sp-body">
      <div class="sp-detected-title" id="sp-detected-title">Detecting product...</div>
      <div class="sp-detected-specs" id="sp-detected-specs"></div>
      <button class="sp-action-btn" id="sp-start-scan">Scan Other Stores</button>
      
      <div class="sp-loading" id="sp-loading">
        <div class="sp-spinner"></div>
        <div style="font-size: 12px; color: #a1a1aa;">Comparing specifications...<br>Scanning tabs in background.</div>
      </div>
      
      <div class="sp-error" id="sp-error"></div>
      <div class="sp-results" id="sp-results"></div>
    </div>
  `;
  document.body.appendChild(widget);

  let targetDetails = null;

  btn.addEventListener("click", () => {
    widget.classList.add("sp-open");
    // Prioritize H1 or specific store title elements
    const h1 = document.querySelector('h1, .B_NuCI, .pd-title, .pdp__title, #productTitle');
    const rawTitle = h1 ? h1.innerText : document.title;
    targetDetails = extractAttributes(rawTitle);
    
    console.log("[SmartPrice] Detected Target:", targetDetails);
    
    document.getElementById("sp-detected-title").innerText = `${targetDetails.brand || ''} ${targetDetails.model || 'Unknown Product'}`;
    document.getElementById("sp-detected-specs").innerText = `${targetDetails.ram ? targetDetails.ram + ' RAM | ' : ''}${targetDetails.storage || ''} ${targetDetails.color || ''}`;
    document.getElementById("sp-start-scan").disabled = !targetDetails.brand && !targetDetails.model;
  });

  document.getElementById("sp-close-btn").addEventListener("click", () => {
    widget.classList.remove("sp-open");
  });

  document.getElementById("sp-start-scan").addEventListener("click", () => {
    if (!targetDetails) return;
    
    document.getElementById("sp-start-scan").style.display = "none";
    document.getElementById("sp-loading").style.display = "block";
    document.getElementById("sp-error").style.display = "none";
    document.getElementById("sp-results").style.display = "none";

    const query = `${targetDetails.brand} ${targetDetails.model} ${targetDetails.storage}`.trim();
    chrome.runtime.sendMessage({ action: "searchProduct", query: query, target: targetDetails });
  });
}

function renderResults(results) {
  const resultsDiv = document.getElementById("sp-results");
  let exactHtml = "";
  let variantHtml = "";

  for (const [storeId, links] of Object.entries(results)) {
    const iconUrl = STORE_ICONS[storeId];
    const storeName = STORE_NAMES[storeId];
    
    if (links.exact) {
      exactHtml += `
        <div style="position: relative; display: flex; align-items: center;" class="sp-store-card-wrapper">
          <a href="${links.exact}" target="_blank" class="sp-store-card" style="flex: 1; padding-right: 32px;">
            <div class="sp-store-info" style="display:flex; align-items:center;">
              <img src="${iconUrl}" class="sp-store-icon" style="margin-right:8px;">
              <div class="sp-store-details" style="display:flex; flex-direction:column; justify-content:center;">
                <span class="sp-store-name" style="font-weight:bold;">${storeName}</span>
                <span class="sp-store-title" style="font-size: 10px; color: #a1a1aa; display: block; margin-top: 2px; line-height: 1.2; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${links.exactTitle}">${links.exactTitle}</span>
              </div>
            </div>
            <span class="sp-view-btn">View Match</span>
          </a>
          <button title="Remove wrong match" onmouseover="this.style.color='#ef4444';" onmouseout="this.style.color='#a1a1aa';" onclick="this.closest('.sp-store-card-wrapper').outerHTML = \`<div class='sp-store-card sp-not-found'><div class='sp-store-info' style='display:flex; align-items:center;'><img src='${iconUrl}' class='sp-store-icon' style='margin-right:8px;'><span class='sp-store-name' style='font-weight:bold;'>${storeName}</span></div><span class='sp-view-btn'>Removed</span></div>\`;" style="position: absolute; right: 8px; background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:18px; line-height:1; padding:4px; display:flex; align-items:center; z-index: 10;">&times;</button>
        </div>
      `;
    } else if (links.variant) {
      variantHtml += `
        <div style="position: relative; display: flex; align-items: center;" class="sp-store-card-wrapper">
          <a href="${links.variant}" target="_blank" class="sp-store-card sp-variant" style="flex: 1; padding-right: 32px;">
            <div class="sp-store-info" style="display:flex; align-items:center;">
              <img src="${iconUrl}" class="sp-store-icon" style="margin-right:8px;">
              <div class="sp-store-details" style="display:flex; flex-direction:column; justify-content:center;">
                <span class="sp-store-name" style="font-weight:bold;">${storeName}</span>
                <span class="sp-store-title" style="font-size: 10px; color: #a1a1aa; display: block; margin-top: 2px; line-height: 1.2; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${links.variantTitle}">${links.variantTitle}</span>
              </div>
            </div>
            <span class="sp-view-btn">View Variant</span>
          </a>
          <button title="Remove wrong match" onmouseover="this.style.color='#ef4444';" onmouseout="this.style.color='#a1a1aa';" onclick="this.closest('.sp-store-card-wrapper').outerHTML = \`<div class='sp-store-card sp-not-found'><div class='sp-store-info' style='display:flex; align-items:center;'><img src='${iconUrl}' class='sp-store-icon' style='margin-right:8px;'><span class='sp-store-name' style='font-weight:bold;'>${storeName}</span></div><span class='sp-view-btn'>Removed</span></div>\`;" style="position: absolute; right: 8px; background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:18px; line-height:1; padding:4px; display:flex; align-items:center; z-index: 10;">&times;</button>
        </div>
      `;
    } else {
      exactHtml += `
        <div class="sp-store-card sp-not-found">
          <div class="sp-store-info" style="display:flex; align-items:center;">
            <img src="${iconUrl}" class="sp-store-icon" style="margin-right:8px;">
            <span class="sp-store-name" style="font-weight:bold;">${storeName}</span>
          </div>
          <span class="sp-view-btn">Unavailable</span>
        </div>
      `;
    }
  }

  let html = `<div class="sp-section-label">Exact Matches</div>` + exactHtml;
  if (variantHtml) html += `<div class="sp-section-label">Other Variants</div>` + variantHtml;

  resultsDiv.innerHTML = html;
  document.getElementById("sp-loading").style.display = "none";
  resultsDiv.style.display = "flex";
  
  const startBtn = document.getElementById("sp-start-scan");
  startBtn.style.display = "block";
  startBtn.innerText = "Search Again";
}

// --- AUTOMATED SCRAPER LOGIC ---
async function runAutoScraper() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("sp_matcher")) return;

  const host = window.location.hostname;

  // Visual Debug Banner
  const banner = document.createElement("div");
  banner.style = "position:fixed;top:0;left:0;width:100%;background:yellow;color:black;z-index:999999;padding:10px;text-align:center;font-weight:bold;font-family:sans-serif;";
  banner.innerText = "SmartPrice is scanning this page...";
  document.body.appendChild(banner);

  const targetStr = url.searchParams.get("sp_target");
  if (!targetStr) return;
  const target = JSON.parse(decodeURIComponent(targetStr));

  let result = { exact: null, exactTitle: null, variant: null, variantTitle: null };

  // Wait and scroll to trigger dynamic content and lazy-loaded images/links
  for (let i = 0; i < 8; i++) {
    window.scrollTo(0, 500 + (i * 300));
    await new Promise(r => setTimeout(r, 1000));
  }

  try {
    const allLinks = Array.from(document.links);
    const candidates = [];
    
    // Universal routing path checks (Impossible to break via CSS changes)
    allLinks.forEach(link => {
       const href = link.href;
       if (!href) return;
       
       let isValidProductLink = false;
       if (host.includes("amazon.in") && href.includes("/dp/") && !href.includes("slredirect")) isValidProductLink = true;
       if (host.includes("flipkart.com") && href.includes("/p/")) isValidProductLink = true;
       if (host.includes("croma.com") && href.includes("/p/")) isValidProductLink = true;
       if (host.includes("reliancedigital.in") && (href.includes("/product/") || href.includes("/p/") || href.includes("/buy/"))) isValidProductLink = true;

       if (isValidProductLink) {
          let text = link.innerText.trim();
          
          if (text.length < 15) {
             text = link.getAttribute('title') || link.getAttribute('aria-label') || link.parentElement.innerText.trim();
          }
          
          if (text && text.length >= 15) {
             candidates.push({ title: text.replace(/\n/g, ' '), link: href.split('?')[0] });
          }
       }
    });

    console.log(`[SmartPrice] Found ${candidates.length} potential product links on ${host}`);

    const seenUrls = new Set();
    for (const item of candidates) {
      if (seenUrls.has(item.link)) continue;
      seenUrls.add(item.link);
      
      const title = item.title.trim();
      if (isStrictMatch(title, target)) {
        console.log("[SmartPrice] Exact Match Found:", title);
        result.exact = item.link;
        result.exactTitle = title;
        break; 
      } else if (isModelMatch(title, target) && !result.variant) {
        console.log("[SmartPrice] Variant Match Found:", title);
        result.variant = item.link;
        result.variantTitle = title;
      }
    }
  } catch (err) {
    console.error("[SmartPrice] Scraping error:", err);
  }

  banner.innerText = result.exact ? "Match Found! Closing..." : "Finished Scan. Closing...";
  chrome.runtime.sendMessage({ action: "submitScrapedData", data: result });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "searchResults") {
    if (message.success) renderResults(message.data.results);
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    injectFAB();
    runAutoScraper();
  });
} else {
  injectFAB();
  runAutoScraper();
}
