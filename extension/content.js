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

// --- CATEGORY DETECTION ---
function detectCategory(title) {
  const lowerTitle = title.toLowerCase();
  if (/\b(tablet|ipad|tab\s|pad\b|surface)\b/i.test(lowerTitle)) {
    return 'tablet';
  }
  return 'smartphone';
}

function parseProductTitle(title) {
  const category = detectCategory(title);
  if (category === 'tablet') {
    return extractTabletAttributes(title);
  }
  const details = extractAttributes(title);
  details.category = 'smartphone';
  return details;
}

function extractTabletAttributes(title) {
  const brands = ['apple', 'samsung', 'microsoft', 'lenovo', 'xiaomi', 'redmi', 'oneplus', 'realme', 'motorola', 'honor', 'nokia', 'google', 'nothing', 'oppo', 'vivo', 'poco'];
  const baseColors = ['black', 'white', 'blue', 'green', 'red', 'grey', 'gray', 'silver', 'gold', 'purple', 'pink', 'space grey', 'space gray', 'starlight', 'midnight', 'graphite'];

  const rawQuery = title.toLowerCase();
  const details = { category: 'tablet', brand: '', model: '', ram: '', storage: '', color: '', connectivity: '', processor: '', year: '', generation: '' };

  const hasCellular = /(5g|cellular|lte|4g)/i.test(rawQuery);
  const hasWiFi = /(wi-fi|wifi)/i.test(rawQuery);

  // Exclude expandable storage descriptions (e.g. expandable up to 2TB) from parsing
  const cleanQueryForGb = rawQuery.replace(/\b(expandable|exp\.|exp)\b.*?\b\d+\s*(gb|tb)\b/gi, '');
  const gbMatches = [...cleanQueryForGb.matchAll(/\b(\d+)\s*(GB|TB)\b/gi)];
  const gbValues = gbMatches.map(m => {
    const val = parseInt(m[1]);
    const unit = m[2].toUpperCase();
    return { str: `${val}${unit}`, sortVal: unit === 'TB' ? val * 1024 : val };
  }).sort((a, b) => a.sortVal - b.sortVal);

  if (gbValues.length >= 2) {
    details.ram = gbValues[0].str;
    details.storage = gbValues[gbValues.length - 1].str;
  } else if (gbValues.length === 1) {
    if (rawQuery.includes('ram')) {
      details.ram = gbValues[0].str;
    } else {
      details.storage = gbValues[0].str;
    }
  }

  for (const b of brands) {
    if (rawQuery.includes(b)) {
      details.brand = b.charAt(0).toUpperCase() + b.slice(1);
      break;
    }
  }

  let conn = 'Wi-Fi';
  if (hasCellular && hasWiFi) {
    conn = (details.brand && details.brand.toLowerCase() === 'apple') ? 'Wi-Fi Cellular' : 'Wi-Fi+Cellular';
  } else if (hasCellular) {
    conn = 'Cellular';
  }
  details.connectivity = conn;

  for (const c of baseColors) {
    if (rawQuery.includes(c)) {
      details.color = c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      break;
    }
  }

  const mSeries = rawQuery.match(/\b(m[1-5])\b/i);
  if (mSeries) {
    details.processor = mSeries[1].toUpperCase();
  } else {
    const aSeries = rawQuery.match(/\b(a\d{2}[x|z]?)\b/i);
    if (aSeries) details.processor = aSeries[1].toUpperCase();
  }

  const yearMatch = rawQuery.match(/\b(201\d|202\d)\b/);
  if (yearMatch) {
    details.year = yearMatch[1];
  }

  let modelPart = title;
  if (details.brand) {
    modelPart = modelPart.replace(new RegExp('\\b' + details.brand + '\\b', 'gi'), '');
  }

  const genMatch = modelPart.match(/\b(\d+(?:st|nd|rd|th)\s*Gen(?:eration)?)\b/i);
  let genStr = "";
  if (genMatch) {
    const num = genMatch[1].match(/\d+/)[0];
    const suffix = genMatch[1].match(/(?:st|nd|rd|th)/i)[0];
    genStr = `${num}${suffix} Gen`;
  }
  details.generation = genStr;

  let splitRegex = /\|| - |:|\bwith\b|\b(in box|in-box|bundle|combo|pack|gift)\b|,/i;
  modelPart = modelPart.split(splitRegex)[0].trim();

  modelPart = modelPart.replace(/\b\d+\s*(GB|TB|RAM|ROM)\b/gi, '');
  modelPart = modelPart.replace(/\b(ram|rom)\b/gi, '');
  if (details.ram) modelPart = modelPart.replace(new RegExp('\\b' + details.ram.replace(/gb/i, '') + '\\b', 'gi'), '');
  if (details.storage) modelPart = modelPart.replace(new RegExp('\\b' + details.storage.replace(/gb/i, '') + '\\b', 'gi'), '');

  modelPart = modelPart.replace(/\b(wifi|wi-fi|cellular|lte|5g|4g)\b/gi, '');

  if (details.color) {
    modelPart = modelPart.replace(new RegExp('\\b' + details.color.replace(' ', '\\s*') + '\\b', 'gi'), '');
  }

  modelPart = modelPart.replace(/\b\d+(?:\.\d+)?\s*(cm|inch|inches|"|'')\b/gi, '');

  const fluff = ['tablet', 'display', 'chip', 'amazon.in', 'amazon', 'flipkart', 'croma', 'reliance', 'digital', 'calling', 'only', 'buy', 'android'];
  fluff.forEach(word => {
    modelPart = modelPart.replace(new RegExp('\\b' + word.replace('.', '\\.') + '\\b', 'gi'), '');
  });

  // Clean empty parentheses left over after spec/color removal
  modelPart = modelPart.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();

  details.model = modelPart.replace(/[,\(\)\|:;\-]/g, ' ').replace(/\s+/g, ' ').trim();
  // Strip orphan '+' or other leftover chars
  details.model = details.model.replace(/\b\+\b/g, ' ').replace(/\s+/g, ' ').trim();

  if (genStr && !details.model.toLowerCase().includes('gen')) {
    details.model = details.model + ' ' + genStr;
  }

  return details;
}

function extractAttributes(title) {
  title = title.replace(/\u00A0/g, ' ').replace(/[\uFFFD\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, ' ');
  title = title.replace(/(\d+)(pro|mini|plus|max|lite|ultra|neo|fe|se)\b/gi, '$1 $2').replace(/\s+/g, ' ');
  const brands = ['cmf by nothing', 'apple', 'samsung', 'vivo', 'oppo', 'oneplus', 'xiaomi', 'redmi', 'realme', 'poco', 'motorola', 'google', 'nothing', 'iqoo', 'asus', 'nokia', 'infinix', 'tecno', 'itel', 'honor', 'lava', 'micromax', 'cmf', 'mi', 'ai+'];
  const baseColors = ['black', 'white', 'blue', 'green', 'red', 'grey', 'gray', 'orange', 'silver', 'gold', 'purple', 'yellow', 'pink', 'lavender', 'titanium', 'graphite', 'cream', 'phantom', 'mint', 'cyan', 'magenta', 'violet', 'sunshower', 'rainy night', 'rainforest', 'chrome', 'marble', 'pearl', 'shadow', 'dusk', 'twilight', 'nordic', 'aurora', 'ruby', 'amber', 'coral', 'opal', 'topaz', 'pastel', 'lemon', 'plum', 'bifrost', 'brown', 'cappuccino', 'noir'];

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
    const hyphenMatch = rawQuery.match(/\b(\d{1,2})\s*-\s*(\d{2,4})\b/);
    if (hyphenMatch) {
      const ramVal = parseInt(hyphenMatch[1]);
      const storageVal = parseInt(hyphenMatch[2]);
      if (ramVal <= 32 && storageVal >= 16) {
        if (!details.ram) details.ram = hyphenMatch[1] + 'GB';
        if (!details.storage) details.storage = hyphenMatch[2] + 'GB';
      }
    }
  }

  // Normalize query: replace hyphens and commas with spaces for brand, color, and model extraction
  const cleanTitle = title.replace(/-/g, ' ').replace(/,/g, ' ');
  const rawQueryClean = cleanTitle.toLowerCase();

  // 2. Match brand
  for (const b of brands) {
    if (rawQueryClean.includes(b)) {
      // Proper Case the brand
      details.brand = b.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      break;
    }
  }

  // 3. Extract Color
  const poeticColors = [
    'starry', 'lunar', 'lunar dust', 'dream', 'azure',
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
  const parenMatches = [...cleanTitle.matchAll(/\((.*?)\)/g)];
  for (const m of parenMatches) {
    const content = m[1].toLowerCase();
    // If it contains a color word, it's a color segment
    if (extendedColors.some(c => new RegExp('\\b' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(content))) {
      colorSegments.push(m[1]);
    }
  }

  // B. Check chunks separated by common delimiters (including parentheses to separate color from specs inside the same group)
  const titleParts = title.split(/[,\(\)\|:;\-]/);
  if (titleParts.length > 1) {
    colorSegments.push(...titleParts.slice(1));
  }

  for (const part of colorSegments) {
    const p = part.trim();
    if (!/\d{3,}/.test(p) && p.length > 2) {
      const pLower = p.toLowerCase();
      const isNothingRelated = details.brand && (details.brand.toLowerCase().includes('nothing') || details.brand.toLowerCase() === 'cmf');
      const hasSpecOrFluff = /\b(gb|tb|mb|ram|rom)\b/i.test(pLower);
      if (pLower === 'mobile phone' || pLower === 'smartphone' || pLower === 'dual sim' || pLower.includes('storage') || hasSpecOrFluff) continue;

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
    const lowerTitle = rawQueryClean;
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
    const words = cleanTitle.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i].toLowerCase().replace(/[^a-z]/g, '');
      if (extendedColors.includes(w)) {
        if (i > 0) {
          const prev = words[i - 1].toLowerCase().replace(/[^a-z]/g, '');
          const ignorePrev = ['gb', 'tb', 'mb', 'ram', 'rom', 'storage', 'smartphone', 'mobile', 'phone', '5g', '4g', 'with', 'and', 'for', 'model', 'edition'];
          // If the previous word isn't a spec/fluff, it's likely a color modifier (e.g. "Awesome Iceblue")
          if (!ignorePrev.includes(prev) && !/\d+/.test(words[i - 1])) {
            details.color = words[i - 1].charAt(0).toUpperCase() + words[i - 1].slice(1) + ' ' + words[i].charAt(0).toUpperCase() + words[i].slice(1);
            break;
          }
        }
        details.color = words[i].charAt(0).toUpperCase() + words[i].slice(1);
        break;
      }
    }
  }

  // 4. Extract Model (The "Clean Sweep")
  let modelPart = title.split(',')[0];

  // A. Remove Brand BEFORE splitting, so we don't accidentally split on words inside the brand (like "by" in "CMF by Nothing")
  if (details.brand) {
    const safeBrand = details.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = details.brand.match(/^\w+$/) ? new RegExp('\\b' + safeBrand + '\\b', 'gi') : new RegExp(safeBrand, 'gi');
    modelPart = modelPart.replace(pattern, '');
  }

  // Special handling for Nothing/CMF brand which uses parentheses in model names like "Phone (2a)"
  let splitRegex = /\|| - | \(|:|\bwith\b|\bby\b|\bcharger\b|,/i;
  const isNothingRelated = details.brand && (details.brand.toLowerCase().includes('nothing') || details.brand.toLowerCase() === 'cmf');
  if (isNothingRelated && /phone\s*\(.*?\)/i.test(cleanTitle)) {
    // If there's a word right after the parentheses like "Pro", we want to keep it too.
    splitRegex = /\|| - |:|\bwith\b|\bby\b|\bcharger\b|,/i;
  }
  modelPart = modelPart.split(splitRegex)[0].trim();
  modelPart = modelPart.replace(/-/g, ' ');

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

  // E. Remove common fluff words and store names
  const fluff = [
    'amazon.in', 'amazon', 'flipkart', 'croma', 'reliance', 'digital', 'buy', 'online', 'price', 'india', 'at', 'best', 'in',
    'smartphone', 'mobile', 'phone', 'unlocked', 'dual', 'sim', 'display', 'promotion', 'front', 'back', 'camera', 'ai', 'with', 'built-in', 'privacy',
    'prime edition', 'prime', 'limited edition', 'special edition',
    'snapdragon', 'mediatek', 'dimensity', 'helio', 'unisoc', 'exynos', 'bionic', 'processor'
  ];
  fluff.forEach(word => {
    // Only remove 'phone' if it's NOT a Nothing/CMF product (where Phone is the model)
    if (word === 'phone' && isNothingRelated) return;
    modelPart = modelPart.replace(new RegExp('\\b' + word.replace('.', '\\.') + '\\b', 'gi'), '');
  });

  // Clean punctuation and trim (preserve trailing '+' for models like S24+)
  details.model = modelPart.replace(/[,\(\)\|:;\-]/g, ' ').replace(/(?<!\w)\+(?!\w)/g, ' ').replace(/\s+/g, ' ').trim();

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

function isTabletMatch(candidateTitle, target, debug = false) {
  const title = candidateTitle.toLowerCase();

  if (debug) console.log(`[SmartPrice] isTabletMatch checking: "${candidateTitle}" against`, target);

  // 1. Model word check
  const targetModel = target.model.toLowerCase();
  const modelWords = targetModel.split(/\s+/).filter(w => w.length > 1);
  let matchCount = 0;
  for (const word of modelWords) {
    if (title.includes(word)) matchCount++;
  }
  if (modelWords.length > 0 && matchCount < Math.max(1, modelWords.length - 1)) {
    if (debug) console.log(`[SmartPrice] Reject: Model words mismatch`);
    return false;
  }

  // 2. Modifier check (including FE)
  const modifiers = ['pro', 'air', 'plus', 'ultra', 'mini', 'lite', 'fe'];
  for (const mod of modifiers) {
    const targetHasMod = new RegExp('\\b' + mod + '\\b', 'i').test(targetModel);
    const candidateHasMod = new RegExp('\\b' + mod + '\\b', 'i').test(title);
    if (targetHasMod !== candidateHasMod) {
      if (debug) console.log(`[SmartPrice] Reject: Modifier mismatch for "${mod}"`);
      return false;
    }
  }

  // 3. Cellular / Connectivity check
  const isCandidateCellular = /(5g|lte|cellular|4g)/i.test(title);
  const isTargetCellular = target.connectivity && /cellular|5g|lte|4g/i.test(target.connectivity);
  if (isTargetCellular !== isCandidateCellular) {
    if (debug) console.log(`[SmartPrice] Reject: Connectivity mismatch (Target Cellular: ${isTargetCellular}, Candidate Cellular: ${isCandidateCellular})`);
    return false;
  }

  // 4. Processor / Chip Check (Critical for Tablets, e.g. M3 vs M4)
  let candProcessor = "";
  const mSeries = title.match(/\b(m[1-5])\b/i);
  if (mSeries) {
    candProcessor = mSeries[1].toUpperCase();
  } else {
    const aSeries = title.match(/\b(a\d{2}[x|z]?)\b/i);
    if (aSeries) candProcessor = aSeries[1].toUpperCase();
  }

  if (target.processor && candProcessor && target.processor !== candProcessor) {
    if (debug) console.log(`[SmartPrice] Reject: Processor mismatch (Target: ${target.processor}, Candidate: ${candProcessor})`);
    return false;
  }

  // 5. Release Year Check
  const candYearMatch = title.match(/\b(201\d|202\d)\b/);
  const candYear = candYearMatch ? candYearMatch[1] : "";
  if (target.year && candYear && target.year !== candYear) {
    if (debug) console.log(`[SmartPrice] Reject: Year mismatch (Target: ${target.year}, Candidate: ${candYear})`);
    return false;
  }

  // 6. Generation Check
  const candGenMatch = title.match(/\b(\d+(?:st|nd|rd|th)\s*gen(?:eration)?)\b/i);
  const candGen = candGenMatch ? `${candGenMatch[1].match(/\d+/)[0]} Gen` : "";
  if (target.generation && candGen && target.generation !== candGen) {
    const targetGenNum = target.generation.match(/\d+/)[0];
    const candGenNum = candGen.match(/\d+/)[0];
    if (targetGenNum !== candGenNum) {
      if (debug) console.log(`[SmartPrice] Reject: Generation mismatch (Target: ${target.generation}, Candidate: ${candGen})`);
      return false;
    }
  }

  // 7. Specs Normalization (RAM & Storage)
  const normalize = (s) => s ? s.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const titleNorm = normalize(candidateTitle);

  if (target.ram) {
    const targetRamNorm = normalize(target.ram);
    if (!titleNorm.includes(targetRamNorm)) {
      const ramMatches = candidateTitle.match(/\b\d+\s*GB\b/gi) || [];
      const targetStorageNorm = target.storage ? normalize(target.storage) : "";
      let foundConflict = false;
      for (const m of ramMatches) {
        const mNorm = normalize(m);
        if (mNorm !== targetRamNorm && mNorm !== targetStorageNorm) {
          foundConflict = true;
          break;
        }
      }
      if (foundConflict) {
        if (debug) console.log(`[SmartPrice] Reject: RAM mismatch`);
        return false;
      }
    }
  }

  if (target.storage && !titleNorm.includes(normalize(target.storage))) {
    if (debug) console.log(`[SmartPrice] Reject: Storage mismatch`);
    return false;
  }

  return true;
}

function cleanTitleForMatching(title) {
  return title.toLowerCase()
    .replace(/\b\d+%\s*(off|discount|save|cashback)?/g, '') // remove "15% off"
    .replace(/\b(save|off|discount|cashback)\s*\d+/g, '') // remove "save 15"
    .replace(/\brs\.\s*\d+/g, '') // remove "Rs. 15000"
    .replace(/\b\d+\s*(percent|percentage)\b/g, ''); // remove "15 percent"
}

function isModelMatch(candidateTitle, target) {
  if (target.category === 'tablet') {
    return isTabletMatch(candidateTitle, target);
  }
  let title = cleanTitleForMatching(candidateTitle);
  // Convert '+' to ' plus ' for strict modifier checking
  title = title.replace(/\+/g, ' plus ');

  // Strict Brand Check
  if (target.brand) {
    const brandLower = target.brand.toLowerCase();
    // Normalize spaces and verify if the candidate contains the brand name
    const brandReg = new RegExp('\\b' + brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (!brandReg.test(title)) {
      return false;
    }
  }

  // Clean target model from common fluff and normalize '+' to ' plus '
  let targetModel = target.model.toLowerCase().replace(/5g|4g|\bsmartphone\b|\bmobile\b|\bphone\b/g, '').trim();
  targetModel = targetModel.replace(/\+/g, ' plus ');

  // Filter keeping words > 1 char OR single digits (like '7' in iQOO 7)
  const modelWords = targetModel.split(/\s+/).filter(w => w.length > 1 || /\d/.test(w));

  if (modelWords.length === 0) {
    return false;
  }

  // Require exact word matches for model parts (to avoid '12' matching '128GB')
  let matchCount = 0;
  for (const word of modelWords) {
    const reg = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (reg.test(title)) matchCount++;
  }

  if (modelWords.length > 2) {
    if ((matchCount / modelWords.length) < 0.60) return false;
  } else {
    // For short model names, allow 1 word match if there's only 1 significant word
    if (modelWords.length === 1) {
      if (matchCount < 1) return false;
    } else {
      if (matchCount < modelWords.length) return false;
    }
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

function isAccessory(title, targetModel = "") {
  const accessoryKeywords = [
    'case', 'cover', 'tempered', 'glass', 'charger', 'adapter', 'cable',
    'earphone', 'headphone', 'pouch', 'skin', 'guard', 'protector', 'lens',
    'strap', 'band', 'film', 'buds', 'drive', 'stick', 'thumb', 'flash', 'usb',
    'memory', 'pen', 'card', 'reader', 'hub', 'dock'
  ];
  const titleLower = title.toLowerCase();
  const targetLower = targetModel.toLowerCase();

  return accessoryKeywords.some(kw => {
    const reg = new RegExp('\\b' + kw + '\\b', 'i');
    // If candidate has accessory keyword but target model doesn't, it's an accessory
    return reg.test(titleLower) && !reg.test(targetLower);
  });
}

function isStrictMatch(candidateTitle, target, debug = false) {
  if (target.category === 'tablet') {
    return isTabletMatch(candidateTitle, target, debug);
  }
  if (debug) console.log(`[SmartPrice] Checking Match: "${candidateTitle}" against`, target);

  // If it's an accessory (and target isn't), it's not an exact match
  if (isAccessory(candidateTitle, target.model)) {
    if (debug) console.log("[SmartPrice] Reject: Identified as Accessory");
    return false;
  }

  if (!isModelMatch(candidateTitle, target)) {
    if (debug) console.log("[SmartPrice] Reject: Model mismatch");
    return false;
  }

  // Normalize both by removing ALL spaces and punctuation for spec matching
  const normalize = (s) => s ? s.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const titleNorm = normalize(candidateTitle);

  if (target.ram) {
    const targetRamNorm = normalize(target.ram);
    const hasStandaloneTargetRam = new RegExp('\\b' + targetRamNorm.replace('gb', '') + '\\s*(?:gb|ram|mb|tb)?\\b', 'i').test(candidateTitle);
    if (!hasStandaloneTargetRam) {
      // Check if the title mentions ANY other RAM. 
      // We look for patterns like "8GB", "12GB" that AREN'T the target RAM and AREN'T the storage.
      const ramMatches = candidateTitle.match(/\b\d+\s*GB\b/gi) || [];
      const targetStorageNorm = target.storage ? normalize(target.storage) : "";

      let foundConflict = false;
      for (const m of ramMatches) {
        const mNorm = normalize(m);
        if (mNorm !== targetRamNorm && mNorm !== targetStorageNorm) {
          foundConflict = true;
          break;
        }
      }

      if (foundConflict) {
        if (debug) console.log(`[SmartPrice] Reject: RAM conflict found in title`);
        return false;
      }
      // If no conflicting RAM is found in the title, we allow it (as some stores omit RAM)
      if (debug) console.log(`[SmartPrice] Soft Match: RAM "${target.ram}" not in title, but no conflict found.`);
    }
  }

  if (target.storage && !titleNorm.includes(normalize(target.storage))) {
    if (debug) console.log(`[SmartPrice] Reject: Storage mismatch (Target: ${target.storage})`);
    return false;
  }

  // PHASE 3: Color Matching (More Flexible)
  if (target.color) {
    const targetColorLower = target.color.toLowerCase();
    const candidateLower = candidateTitle.toLowerCase();

    // Split into words and filter out tiny words
    const targetColorWords = targetColorLower.split(/\s+/).filter(w => w.length > 2);

    let matchCount = 0;
    for (const cw of targetColorWords) {
      if (candidateLower.includes(cw)) {
        matchCount++;
      }
    }

    // If we have multiple color words (e.g., "Natural Titanium"), require at least one significant match.
    // If we have none matching, we still allow it as a "Variant" in the caller logic, 
    // but for "Exact" match here, let's be slightly more lenient if the title is short.
    if (targetColorWords.length > 0 && matchCount === 0) {
      // If color is not in title, check if ANY other color is in the title
      // This is a bit complex, but for now let's just allow it if no other color word is found
      const extendedColors = ['black', 'white', 'blue', 'green', 'red', 'grey', 'gray', 'orange', 'silver', 'gold', 'purple', 'yellow', 'pink', 'lavender', 'titanium', 'graphite', 'cream', 'phantom', 'mint', 'cyan', 'magenta', 'violet'];
      const otherColorFound = extendedColors.some(c => candidateLower.includes(c) && !targetColorLower.includes(c));

      if (otherColorFound) {
        if (debug) console.log(`[SmartPrice] Reject: Color mismatch (Target: ${target.color}, but title has another color)`);
        return false;
      }
      if (debug) console.log(`[SmartPrice] Soft Match: Color "${target.color}" not in title, but no conflict found.`);
    }
  }

  return true;
}

// --- GLOBAL STATE ---
let globalTargetDetails = null;
let globalCurrentResults = null;
let globalCurrentProduct = null; // Store for the product on the active page

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

function getProductTitleFromDOM() {
  const host = window.location.hostname;
  let rawTitle = "";

  // 1. Prioritize specific DOM elements (so we get complete title containing RAM and '+' character)
  const specificElem = document.getElementById("productTitle") || 
    document.querySelector(".B_NuCI, .VU-ZEz") || 
    document.querySelector(".pd-title, .pdp__title");

  if (specificElem) {
    rawTitle = specificElem.innerText;
  } else {
    const h1 = document.querySelector("h1");
    if (h1) rawTitle = h1.innerText;
  }

  // 2. Fallback to URL slug if DOM elements are not found
  if (!rawTitle && host.includes("flipkart.com")) {
    const pathParts = window.location.pathname.split('/');
    const slug = pathParts.find(p => p && p !== 'p');
    if (slug && slug.includes('-')) {
      rawTitle = decodeURIComponent(slug).replace(/-/g, ' ');
    }
  }

  if (!rawTitle) {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content && ogTitle.content.trim().length > 10) {
      const content = ogTitle.content.trim();
      const isPlaceholder = /item\s+store|buy\s+products\s+online/i.test(content);
      if (!isPlaceholder) {
        rawTitle = content;
      }
    }
  }

  if (!rawTitle) {
    if (host.includes("flipkart.com")) {
      const fkMatch = document.title.match(/Buy\s+(.*?)\s+Online/i);
      if (fkMatch && fkMatch[1].trim().length > 10) {
        rawTitle = fkMatch[1].trim();
      }
    }
  }
  if (!rawTitle) {
    rawTitle = document.title;
  }

  if (rawTitle) {
    const cleanRegex = /\s+(?:Price\s+in\s+India|- Buy|Online\s+at\s+Flipkart|Online\s+at\s+Reliance|Buy\s+Online|Online\s+-|Online\s*:)\b/i;
    rawTitle = rawTitle.split(cleanRegex)[0].trim();
  }

  return rawTitle;
}

function updateWidgetDetails() {
  const rawTitle = getProductTitleFromDOM();
  if (!rawTitle) return;

  const host = window.location.hostname;
  globalTargetDetails = parseProductTitle(rawTitle);

  console.log("[SmartPrice] Updated Target Details:", globalTargetDetails);

  let currentStoreId = "";
  if (host.includes("amazon.in")) currentStoreId = "amazon";
  else if (host.includes("flipkart.com")) currentStoreId = "flipkart";
  else if (host.includes("croma.com")) currentStoreId = "croma";
  else if (host.includes("reliancedigital.in")) currentStoreId = "reliance_digital";

  globalCurrentProduct = {
    storeId: currentStoreId,
    title: rawTitle,
    link: window.location.href,
    icon: STORE_ICONS[currentStoreId] || ""
  };

  const brandEl = document.getElementById("sp-ui-brand");
  const modelEl = document.getElementById("sp-ui-model");
  const specsEl = document.getElementById("sp-ui-specs");
  const scanBtn = document.getElementById("sp-start-scan");

  if (brandEl) brandEl.innerText = (globalTargetDetails.brand || 'N/A').toLowerCase();
  if (modelEl) modelEl.innerText = globalTargetDetails.model || 'Unknown';

  if (specsEl) {
    let specsText = `${globalTargetDetails.ram || ''} ${globalTargetDetails.storage || ''} ${globalTargetDetails.color || ''}`;
    if (globalTargetDetails.category === 'tablet' && globalTargetDetails.connectivity) {
      specsText += ` ${globalTargetDetails.connectivity}`;
    }
    specsEl.innerText = specsText.replace(/\s+/g, ' ').trim();
  }

  if (scanBtn) {
    scanBtn.disabled = !globalTargetDetails.brand && !globalTargetDetails.model;
  }
}

let updateTimeout = null;
function debouncedUpdateWidgetDetails() {
  if (updateTimeout) clearTimeout(updateTimeout);
  updateTimeout = setTimeout(updateWidgetDetails, 150);
}

// --- UI AND INJECTION LOGIC ---
function injectFAB() {
  const oldBtn = document.getElementById("sp-floating-btn");
  if (oldBtn) oldBtn.remove();
  const oldWidget = document.getElementById("sp-widget-container");
  if (oldWidget) oldWidget.remove();

  const btn = document.createElement("div");
  btn.id = "sp-floating-btn";
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;
  document.body.appendChild(btn);

  const widget = document.createElement("div");
  widget.id = "sp-widget-container";
  widget.innerHTML = `
    <div class="sp-header">
      <div class="sp-title-wrapper">
        <div class="sp-title">Universal Price Comarision</div>
        <span class="sp-version-pill">v2.1</span>
      </div>
      <button class="sp-close" id="sp-close-btn">&times;</button>
    </div>
    <div class="sp-body">
      <div class="sp-detected-title" id="sp-detected-title">
        <div class="sp-spec-row">
          <span class="sp-spec-label">brand:</span>
          <span class="sp-spec-value" id="sp-ui-brand">Detecting...</span>
        </div>
        <div class="sp-spec-row">
          <span class="sp-spec-label">model:</span>
          <span class="sp-spec-value" id="sp-ui-model">Detecting...</span>
        </div>
        <div class="sp-spec-row">
          <span class="sp-spec-label">specs:</span>
          <span class="sp-spec-value" id="sp-ui-specs">Detecting...</span>
        </div>
      </div>
      <div class="sp-btn-container">
        <button class="sp-action-btn" id="sp-start-scan">Scan Other Stores</button>
        <button class="sp-action-btn" id="sp-push-db" style="display: none; background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">Push to DB</button>
      </div>
      
      <div class="sp-loading" id="sp-loading">
        <div class="sp-loader-wave">
          <div class="sp-loader-bar"></div>
          <div class="sp-loader-bar"></div>
          <div class="sp-loader-bar"></div>
          <div class="sp-loader-bar"></div>
        </div>
        <div class="sp-loader-text">Comparing specifications...<br>Scanning tabs in background.</div>
      </div>
      
      <div class="sp-error" id="sp-error"></div>
      <div class="sp-results" id="sp-results"></div>
    </div>
  `;
  document.body.appendChild(widget);

  btn.addEventListener("click", () => {
    widget.classList.add("sp-open");
    updateWidgetDetails();
  });

  // Clear existing intervals/observers from previous injections to prevent memory leaks
  if (window.spUrlCheckInterval) clearInterval(window.spUrlCheckInterval);
  if (window.spTitleObserver) window.spTitleObserver.disconnect();
  if (window.spClickListener) document.removeEventListener("click", window.spClickListener);

  // Set up auto-refresh listeners for variant/URL changes
  let lastUrl = window.location.href;
  const urlCheckInterval = setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log("[SmartPrice] URL variant change detected. Waiting 450ms for DOM update...");
      setTimeout(debouncedUpdateWidgetDetails, 450);
    }
  }, 1000);

  const titleEl = document.querySelector('title');
  let titleObserver = null;
  if (titleEl) {
    titleObserver = new MutationObserver(() => {
      debouncedUpdateWidgetDetails();
    });
    titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  const clickListener = () => {
    setTimeout(debouncedUpdateWidgetDetails, 450);
  };
  document.addEventListener("click", clickListener);

  window.spUrlCheckInterval = urlCheckInterval;
  window.spTitleObserver = titleObserver;
  window.spClickListener = clickListener;

  document.getElementById("sp-push-db").addEventListener("click", async () => {
    if (!globalTargetDetails || !globalCurrentResults) return;

    const btnDb = document.getElementById("sp-push-db");
    btnDb.innerText = "Pushing...";
    btnDb.disabled = true;

    const data = [];

    const host = window.location.hostname;
    let currentSid = 0;
    if (host.includes("flipkart.com")) currentSid = 1;
    else if (host.includes("amazon.in")) currentSid = 2;
    else if (host.includes("croma.com")) currentSid = 13;
    else if (host.includes("reliancedigital.in")) currentSid = 14;

    if (currentSid > 0) {
      const pid = extractPidFromUrl(window.location.href, currentSid);
      if (pid) data.push({ pid, sid: currentSid });
    }

    for (const [storeId, links] of Object.entries(globalCurrentResults)) {
      let sid = 0;
      if (storeId === 'flipkart') sid = 1;
      else if (storeId === 'amazon') sid = 2;
      else if (storeId === 'croma') sid = 13;
      else if (storeId === 'reliance_digital') sid = 14;

      let pid = null;
      if (links.exact) pid = extractPidFromUrl(links.exact, sid);

      if (pid && !data.find(x => x.pid === pid)) data.push({ pid, sid });
    }

    const ramVal = globalTargetDetails.ram ? globalTargetDetails.ram.replace(/\D/g, '') : '';
    const storageVal = globalTargetDetails.storage ? globalTargetDetails.storage.replace(/\D/g, '') : '';

    let fullModel = `${globalTargetDetails.model} ${ramVal} ${storageVal}`;
    if (globalTargetDetails.category === 'tablet' && globalTargetDetails.connectivity) {
      fullModel += ` ${globalTargetDetails.connectivity}`;
    }
    fullModel = fullModel.replace(/[\(\)]/g, '').replace(/\+/g, ' ');
    fullModel = fullModel.replace(/\s+/g, ' ').trim();

    const payload = {
      model: fullModel,
      brand: globalTargetDetails.brand,
      priceComparisonData: data
    };

    console.log("[SmartPrice] Pushing to DB:", payload);

    try {
      chrome.runtime.sendMessage({ action: "pushToDB", payload: payload }, (response) => {
        if (response && response.success) {
          const parentId = response.parentId;
          const msg = response.rawData?.message || "";
          console.log("[SmartPrice] Saved successfully! parentId:", parentId, "Message:", msg);
          if (parentId) {
            btnDb.innerText = "Pushed! ID: " + parentId;
          } else if (msg.includes("No valid data")) {
            btnDb.innerText = "Already Saved!";
          } else {
            btnDb.innerText = "Pushed! (Success)";
          }
          btnDb.style.background = "#059669";
        } else {
          btnDb.innerText = "API Error";
          btnDb.style.background = "#ef4444";
          console.error("[SmartPrice] API Error:", response?.error);
        }
      });
    } catch (e) {
      btnDb.innerText = "Network Error";
      btnDb.style.background = "#ef4444";
    }
  });

  document.getElementById("sp-close-btn").addEventListener("click", () => {
    widget.classList.remove("sp-open");
  });

  document.getElementById("sp-start-scan").addEventListener("click", () => {
    if (!globalTargetDetails) return;

    document.getElementById("sp-start-scan").style.display = "none";
    document.getElementById("sp-push-db").style.display = "none";
    document.getElementById("sp-loading").style.display = "block";
    document.getElementById("sp-error").style.display = "none";
    // Keep the Current Product section visible but clear others
    if (globalCurrentProduct) {
      renderResults({});
      document.getElementById("sp-loading").style.display = "block"; // Restore loading after render
    } else {
      document.getElementById("sp-results").style.display = "none";
    }

    let query = `${globalTargetDetails.brand} ${globalTargetDetails.model} ${globalTargetDetails.storage} ${globalTargetDetails.color || ''}`;
    if (globalTargetDetails.category === 'tablet' && globalTargetDetails.connectivity) {
      query += ` ${globalTargetDetails.connectivity}`;
    }
    query = query.replace(/\s+/g, ' ').trim();

    chrome.runtime.sendMessage({
      action: "searchProduct",
      query: query,
      target: globalTargetDetails,
      currentStoreId: globalCurrentProduct ? globalCurrentProduct.storeId : null
    });
  });
}

function renderResults(results) {
  const resultsDiv = document.getElementById("sp-results");
  let currentHtml = "";
  let exactHtml = "";
  let variantHtml = "";

  const storeIdToSid = { 'flipkart': 1, 'amazon': 2, 'croma': 13, 'reliance_digital': 14 };

  // 1. Render Current Product
  if (globalCurrentProduct) {
    const sid = storeIdToSid[globalCurrentProduct.storeId] || 0;
    const pid = extractPidFromUrl(globalCurrentProduct.link, sid);
    const pidHtml = pid ? `<span style="font-size: 9px; color: #3b82f6; display: block; margin-top: 2px;">SID: ${sid} | PID: ${pid}</span>` : '';
    currentHtml = `
        <div class="sp-store-card-wrapper">
          <a href="${globalCurrentProduct.link}" target="_blank" class="sp-store-card" style="border-left: 3px solid #3b82f6;">
            <div class="sp-store-info" style="display:flex; align-items:center;">
              <img src="${globalCurrentProduct.icon}" class="sp-store-icon" style="margin-right:8px;">
              <div class="sp-store-details" style="display:flex; flex-direction:column; justify-content:center;">
                <span class="sp-store-name" style="font-weight:bold; color: #3b82f6;">CURRENT: ${STORE_NAMES[globalCurrentProduct.storeId]}</span>
                <span class="sp-store-title" style="font-size: 10px; color: #a1a1aa; display: block; margin-top: 2px; line-height: 1.2; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${globalCurrentProduct.title}">${globalCurrentProduct.title}</span>
                ${pidHtml}
              </div>
            </div>
            <span class="sp-view-btn" style="background: #3b82f6;">Selected</span>
          </a>
        </div>
      `;
  }

  // 2. Render Other Results
  for (const [storeId, links] of Object.entries(results)) {
    // Skip the store we are already on to avoid duplicates if background search finds it
    if (globalCurrentProduct && storeId === globalCurrentProduct.storeId) continue;

    const iconUrl = STORE_ICONS[storeId];
    const storeName = STORE_NAMES[storeId];
    const sid = storeIdToSid[storeId] || 0;

    if (links.exact) {
      const pid = extractPidFromUrl(links.exact, sid);
      const pidHtml = pid ? `<span style="font-size: 9px; color: #10b981; display: block; margin-top: 2px;">SID: ${sid} | PID: ${pid}</span>` : '';
      exactHtml += `
        <div style="position: relative; display: flex; align-items: center;" class="sp-store-card-wrapper">
          <a href="${links.exact}" target="_blank" class="sp-store-card" style="flex: 1; padding-right: 32px;">
            <div class="sp-store-info" style="display:flex; align-items:center;">
              <img src="${iconUrl}" class="sp-store-icon" style="margin-right:8px;">
              <div class="sp-store-details" style="display:flex; flex-direction:column; justify-content:center;">
                <span class="sp-store-name" style="font-weight:bold;">${storeName}</span>
                <span class="sp-store-title" style="font-size: 10px; color: #a1a1aa; display: block; margin-top: 2px; line-height: 1.2; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${links.exactTitle}">${links.exactTitle}</span>
                ${pidHtml}
              </div>
            </div>
            <span class="sp-view-btn">View Match</span>
          </a>
          <button title="Remove wrong match" class="sp-cancel-btn" data-store="${storeId}" data-name="${storeName}" data-icon="${iconUrl}" style="position: absolute; right: 8px; background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:18px; line-height:1; padding:4px; display:flex; align-items:center; z-index: 10;">&times;</button>
        </div>
      `;
    } else if (links.variant) {
      const pid = extractPidFromUrl(links.variant, sid);
      const pidHtml = pid ? `<span style="font-size: 9px; color: #a1a1aa; display: block; margin-top: 2px;">SID: ${sid} | PID: ${pid}</span>` : '';
      variantHtml += `
        <div style="position: relative; display: flex; align-items: center;" class="sp-store-card-wrapper">
          <a href="${links.variant}" target="_blank" class="sp-store-card sp-variant" style="flex: 1; padding-right: 32px;">
            <div class="sp-store-info" style="display:flex; align-items:center;">
              <img src="${iconUrl}" class="sp-store-icon" style="margin-right:8px;">
              <div class="sp-store-details" style="display:flex; flex-direction:column; justify-content:center;">
                <span class="sp-store-name" style="font-weight:bold;">${storeName}</span>
                <span class="sp-store-title" style="font-size: 10px; color: #a1a1aa; display: block; margin-top: 2px; line-height: 1.2; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${links.variantTitle}">${links.variantTitle}</span>
                ${pidHtml}
              </div>
            </div>
            <span class="sp-view-btn">View Variant</span>
          </a>
          <button title="Remove wrong match" class="sp-cancel-btn" data-store="${storeId}" data-name="${storeName}" data-icon="${iconUrl}" style="position: absolute; right: 8px; background:none; border:none; color:#a1a1aa; cursor:pointer; font-size:18px; line-height:1; padding:4px; display:flex; align-items:center; z-index: 10;">&times;</button>
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

  let html = `<div class="sp-section-label">Current Product</div>` + currentHtml;
  if (exactHtml) html += `<div class="sp-section-label">Exact Matches</div>` + exactHtml;
  if (variantHtml) html += `<div class="sp-section-label">Other Variants</div>` + variantHtml;

  resultsDiv.innerHTML = html;

  globalCurrentResults = results;

  // Attach event listeners in the extension context
  const cancelBtns = resultsDiv.querySelectorAll('.sp-cancel-btn');
  cancelBtns.forEach(btn => {
    btn.addEventListener('mouseover', function () { this.style.color = '#ef4444'; });
    btn.addEventListener('mouseout', function () { this.style.color = '#a1a1aa'; });
    btn.addEventListener('click', function () {
      const sId = this.getAttribute('data-store');
      const sName = this.getAttribute('data-name');
      const sIcon = this.getAttribute('data-icon');
      if (globalCurrentResults && globalCurrentResults[sId]) {
        delete globalCurrentResults[sId];
      }
      this.closest('.sp-store-card-wrapper').outerHTML = `
            <div class='sp-store-card sp-not-found' style='opacity: 0.4; filter: grayscale(0.8); background: rgba(0,0,0,0.2);'>
              <div class='sp-store-info' style='display:flex; align-items:center;'>
                <img src='${sIcon}' class='sp-store-icon' style='margin-right:8px; opacity: 0.5;'>
                <span class='sp-store-name' style='font-weight:bold; color: #71717a;'>${sName}</span>
              </div>
              <span class='sp-view-btn' style='background: #27272a; color: #52525b;'>Removed</span>
            </div>`;
    });
  });

  document.getElementById("sp-loading").style.display = "none";
  resultsDiv.style.display = "flex";

  const startBtn = document.getElementById("sp-start-scan");
  startBtn.style.display = "block";
  startBtn.innerText = "Search Again";

  const pushBtn = document.getElementById("sp-push-db");
  pushBtn.style.display = "block";
  pushBtn.innerText = "Push to DB";
  pushBtn.disabled = false;
  pushBtn.style.background = "#10b981";
}

// --- AUTOMATED SCRAPER LOGIC ---
async function runAutoScraper() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("sp_matcher")) return;

  const host = window.location.hostname;

  // --- BACKGROUND TAB OPTIMIZATION ---
  // Some stores (like Reliance Digital) throttle execution or lazy loading if the tab is hidden.
  // We spoof the visibility state to trick the page into thinking it's visible.
  try {
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  } catch (e) { }

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
  // We check for results DURING scrolling to speed up and handle lazy-loaded items better
  for (let i = 0; i < 12; i++) {
    window.scrollTo(0, 300 + (i * 600));
    window.dispatchEvent(new Event('scroll'));

    // Brief wait for content to render
    await new Promise(r => setTimeout(r, 800));

    // Quick scan for results while scrolling
    try {
      const found = scanPage(target, host);
      if (found.exact) {
        result = found;
        break; // Stop scrolling early if exact match found
      }
      if (found.variant && !result.variant) {
        result.variant = found.variant;
        result.variantTitle = found.variantTitle;
      }
    } catch (e) { }
  }

  // Final Banner update
  banner.innerText = result.exact ? "Match Found! Closing..." : "Finished Scan. Closing...";
  chrome.runtime.sendMessage({ action: "submitScrapedData", data: result }, () => {
    if (chrome.runtime.lastError) {
      // Consume warning
    }
  });
}

// Helper function to scan the page for candidates
function scanPage(target, host) {
  const allLinks = Array.from(document.links);
  const candidates = [];
  const result = { exact: null, exactTitle: null, variant: null, variantTitle: null };

  // --- STRATEGY 1: Container-Aware Scraping ---
  let containers = [];
  if (host.includes("amazon.in")) {
    containers = document.querySelectorAll('div[data-component-type="s-search-result"], .s-result-item[data-asin], div.sg-col-inner');
  } else if (host.includes("flipkart.com")) {
    containers = document.querySelectorAll('div[data-id], div.cPHDOP, div._1AtVbE, div._13oc-S, div.sl-sobe-carousel-sub-container');
  } else if (host.includes("croma.com")) {
    containers = document.querySelectorAll('.product-item, .cp-product, .product-card, li.product-item');
  } else if (host.includes("reliancedigital.in")) {
    containers = document.querySelectorAll('.sp__product, .product-item, .plp__container-card, div.sp, .grid-item, li.product_grid--item');
  }

  containers.forEach(container => {
    const link = container.querySelector('a[href*="/dp/"], a[href*="/p/"], a[href*="/product/"], a[href*="/buy/"], a.CGtC98, a.s-no-outline, a.k7wcnx, a._1fQZEK, a.IRpwTa, a.a-link-normal, a.details-container');
    if (!link) return;

    const titleSelectors = [
      'h2 a span', 'div.KzD161', 'h2', '.product-title', '.plp-product-name', 'h3', '.a-size-medium', '._W_S_G',
      'a.IRpwTa', 'div._4rR01T', 'p.sp__name', 'div.pdp-link', 'a.s1Q9rs', 'div._2WkVRV', 'p.pl__container__name'
    ];
    let titleElem = null;
    for (const sel of titleSelectors) {
      titleElem = container.querySelector(sel);
      if (titleElem && titleElem.innerText.trim().length > 10) break;
    }

    let rawText = titleElem ? titleElem.innerText.trim() : "";
    if (rawText.length < 10) {
      const img = container.querySelector('img[alt]');
      const altText = img ? img.getAttribute('alt') : "";
      const linkTitle = link.getAttribute('title') || link.getAttribute('aria-label');
      if (altText && altText.length > rawText.length) rawText = altText;
      if (linkTitle && linkTitle.length > rawText.length) rawText = linkTitle;
    }

    if (rawText.length < 15) {
      const allTextParts = Array.from(container.querySelectorAll('span, div, li, p'))
        .map(el => el.innerText.trim())
        .filter(t => t.length > 2 && t.length < 100);
      rawText = (rawText + " " + allTextParts.join(" ")).trim();
      if (rawText.length < 15) {
        rawText = rawText || container.innerText.replace(/\n/g, ' ').trim();
      }
    }

    if (rawText && rawText.length >= 10) {
      candidates.push({ title: rawText, link: link.href });
    }
  });

  // --- STRATEGY 2: Link-Based Fallback ---
  if (candidates.length < 10) {
    allLinks.forEach(link => {
      const href = link.href;
      if (!href || candidates.find(c => c.link === href)) return;

      let isValidProductLink = false;
      if (host.includes("amazon.in") && (href.includes("/dp/") || href.includes("/gp/product/")) && !href.includes("slredirect")) isValidProductLink = true;
      if (host.includes("flipkart.com") && (href.includes("/p/") || href.includes("/itm"))) isValidProductLink = true;
      if (host.includes("croma.com") && href.includes("/p/")) isValidProductLink = true;
      if (host.includes("reliancedigital.in") && (href.includes("/product/") || href.includes("/p/") || href.includes("/buy/"))) isValidProductLink = true;

      if (isValidProductLink) {
        let rawText = link.innerText.trim();
        if (rawText.length < 15) {
          rawText = link.getAttribute('title') || link.getAttribute('aria-label') || link.parentElement.innerText.trim();
        }
        if (rawText && rawText.length >= 10) {
          candidates.push({ title: rawText, link: href });
        }
      }
    });
  }

  const seenUrls = new Set();
  for (const item of candidates) {
    if (seenUrls.has(item.link)) continue;
    seenUrls.add(item.link);

    const title = item.title.trim();
    if (isStrictMatch(title, target, false)) {
      result.exact = item.link;
      result.exactTitle = title;
      return result;
    } else if (isModelMatch(title, target) && !result.variant) {
      result.variant = item.link;
      result.variantTitle = title;
    }
  }
  return result;
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

window.addEventListener("message", (event) => {
  if (event.data && (event.data.action === "startAutomation" || event.data.action === "stopAutomation")) {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage(event.data, () => {
          if (chrome.runtime.lastError) {
            // Silently consume the error
          }
        });
      }
    } catch (e) {
      console.warn("[SmartPrice] Extension context is invalidated. Please reload the webpage to restart automation.");
    }
  }
});

