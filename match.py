import sys
import json
import urllib.parse
import re
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def extract_tablet_details(raw_query):
    # Normalize query
    raw_query = raw_query.replace('\u00A0', ' ')
    raw_query = re.sub(r'[\uFFFD\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]', ' ', raw_query)
    raw_query = re.sub(r'(\d+)(pro|mini|plus|max|lite|ultra|neo|fe|se)\b', r'\1 \2', raw_query, flags=re.IGNORECASE)
    raw_query = re.sub(r'\s+', ' ', raw_query)
    
    brands = ['apple', 'samsung', 'microsoft', 'google', 'lenovo', 'oneplus', 'xiaomi', 'redmi', 'realme', 'motorola', 'honor', 'nokia', 'oppo', 'vivo', 'poco']
    base_colors = ['black', 'white', 'blue', 'green', 'red', 'grey', 'gray', 'silver', 'gold', 'purple', 'pink', 'space grey', 'space gray', 'starlight', 'midnight', 'graphite', 'starry', 'lunar', 'lunar dust', 'dream', 'azure']
    
    details = {'brand': '', 'model': '', 'ram': '', 'storage': '', 'color': '', 'category': 'tablet', 'connectivity': '', 'processor': '', 'year': '', 'generation': ''}
    
    # 1. Apple M-series / A-series processor
    proc_match = re.search(r'\b(m[1-5])\b', raw_query, re.IGNORECASE)
    if proc_match:
        details['processor'] = proc_match.group(1).upper()
    else:
        aproc_match = re.search(r'\b(a\d{2}[x|z]?)\b', raw_query, re.IGNORECASE)
        if aproc_match:
            details['processor'] = aproc_match.group(1).upper()
            
    # 2. Extract year
    year_match = re.search(r'\b(201\d|202\d)\b', raw_query)
    if year_match:
        details['year'] = year_match.group(1)
        
    # 3. Extract generation
    gen_match = re.search(r'\b(\d+(?:st|nd|rd|th)\s*gen(?:eration)?)\b', raw_query, re.IGNORECASE)
    if gen_match:
        num_match = re.search(r'\d+', gen_match.group(1))
        if num_match:
            details['generation'] = f"{num_match.group(0)} Gen"
            
    # 4. Extract Connectivity
    has_cellular = bool(re.search(r'5g|cellular|lte|4g', raw_query, re.IGNORECASE))
    has_wifi = bool(re.search(r'wi-fi|wifi', raw_query, re.IGNORECASE))
    conn = 'Wi-Fi'
    is_apple = 'apple' in raw_query.lower() or 'ipad' in raw_query.lower()
    if has_cellular and has_wifi:
        conn = 'Wi-Fi Cellular' if is_apple else 'Wi-Fi+Cellular'
    elif has_cellular:
        conn = 'Cellular'
    details['connectivity'] = conn

    # 5. Extract RAM and Storage
    clean_query_for_gb = re.sub(r'\b(expandable|exp\.|exp)\b.*?\b\d+\s*(gb|tb)\b', '', raw_query, flags=re.IGNORECASE)
    gb_matches = list(re.finditer(r'\b(\d+)\s*(GB|TB|MB)\b', clean_query_for_gb, re.IGNORECASE))
    gb_values = []
    for m in gb_matches:
        val = int(m.group(1))
        unit = m.group(2).upper()
        sort_val = val * 1024 if unit == 'TB' else (val / 1024 if unit == 'MB' else val)
        gb_values.append({'str': f"{val}{unit}", 'sort_val': sort_val})
    gb_values.sort(key=lambda x: x['sort_val'])
    
    if len(gb_values) >= 2:
        details['ram'] = gb_values[0]['str']
        details['storage'] = gb_values[-1]['str']
    elif len(gb_values) == 1:
        if 'ram' in raw_query.lower():
            details['ram'] = gb_values[0]['str']
        else:
            details['storage'] = gb_values[0]['str']

    # 6. Extract Brand
    raw_query_lower = raw_query.lower()
    for b in brands:
        pattern = r'\b' + re.escape(b) + r'\b' if b.isalnum() else re.escape(b)
        if re.search(pattern, raw_query_lower):
            details['brand'] = b.capitalize()
            break
            
    # 7. Extract Color
    temp_query = raw_query
    paren_match = re.search(r'\((.*?)\)', temp_query)
    found_color = ''
    if paren_match:
        c_text = paren_match.group(1)
        c_parts = [p.strip() for p in c_text.split(',')]
        for part in c_parts:
            part_lower = part.lower()
            if any(bc in part_lower for bc in base_colors) and not re.search(r'\b(gb|tb|mb|ram|rom|m[1-5]|a\d{2}[x|z]?)\b', part_lower):
                found_color = part
                break
        temp_query = temp_query[:paren_match.start()] + " " + temp_query[paren_match.end():]
    else:
        parts = [p.strip() for p in temp_query.split(',')]
        if len(parts) > 1:
            for part in parts[1:]:
                part_lower = part.lower()
                if any(bc in part_lower for bc in base_colors) and not bool(re.search(r'\b(gb|tb|mb|ram|rom)\b', part_lower)):
                    found_color = part
                    temp_query = temp_query.replace(part, ' ').replace(',', ' ')
                    break
                    
    if not found_color:
        words2 = temp_query.replace(',', ' ').split()
        for i, w in enumerate(words2):
            if w.lower() in base_colors:
                if i > 0 and len(words2[i-1]) > 2:
                    found_color = words2[i-1] + ' ' + w
                else:
                    found_color = w
                temp_query = temp_query.replace(found_color, ' ')
                break
                
    details['color'] = found_color.strip(' ,').title()

    # 8. Extract Model
    model_part = raw_query.split(',')[0]
    if details['brand']:
        model_part = re.sub(r'\b' + re.escape(details['brand']) + r'\b', '', model_part, flags=re.IGNORECASE)
    
    split_match = re.search(r'\b(with|in box|in-box|bundle|combo|pack|gift)\b|,| - | \(|\(', model_part, re.IGNORECASE)
    if split_match:
        model_part = model_part[:split_match.start()]
        
    model_part = model_part.replace('-', ' ')
    model_part = re.sub(r'\b\d+\s*(?:gb|tb|mb|ram|rom)\b', '', model_part, flags=re.IGNORECASE)
    model_part = re.sub(r'\b(?:5g\+?|4g\+?|lte|3g|2g|cellular|wi-fi|wi\s+fi|wifi)\b', '', model_part, flags=re.IGNORECASE)
    if details['color']:
        model_part = re.sub(r'\b' + re.escape(details['color']) + r'\b', '', model_part, flags=re.IGNORECASE)
    if details['processor']:
        model_part = re.sub(r'\b' + re.escape(details['processor']) + r'\b', '', model_part, flags=re.IGNORECASE)
    if details['generation']:
        num = re.search(r'\d+', details['generation']).group(0)
        model_part = re.sub(r'\b' + num + r'(?:st|nd|rd|th)?\b', '', model_part, flags=re.IGNORECASE)
        model_part = re.sub(r'\bgen(?:eration)?\b', '', model_part, flags=re.IGNORECASE)
        
    fluff_words = ['tablet', 'display', 'chip', 'amazon', 'flipkart', 'croma', 'reliance', 'digital', 'calling', 'only', 'buy', 'android']
    model_words = model_part.split()
    model_words = [w for w in model_words if w.lower() not in fluff_words]
    model_clean = ' '.join(model_words)
    model_clean = re.sub(r'[,\(\)]', ' ', model_clean)
    
    details['model'] = ' '.join(model_clean.split()).title()
    
    if details['generation'] and 'gen' not in details['model'].lower():
        details['model'] = f"{details['model']} {details['generation']}"
        
    return details

def extract_details(raw_query):
    # Route tablet/tab queries immediately to extract_tablet_details
    if re.search(r'\b(tablet|ipad|tab\s|pad\b|surface)\b', raw_query, re.IGNORECASE):
        return extract_tablet_details(raw_query)

    raw_query = raw_query.replace('\u00A0', ' ')
    raw_query = re.sub(r'[\uFFFD\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]', ' ', raw_query)
    raw_query = re.sub(r'(\d+)(pro|mini|plus|max|lite|ultra|neo|fe|se)\b', r'\1 \2', raw_query, flags=re.IGNORECASE)
    raw_query = re.sub(r'\s+', ' ', raw_query)
    brands = ['apple', 'samsung', 'vivo', 'oppo', 'oneplus', 'xiaomi', 'redmi', 'realme', 'poco', 'motorola', 'google', 'nothing', 'iqoo', 'asus', 'nokia', 'lenovo', 'honor', 'mi', 'ai+']
    base_colors = ['black', 'white', 'blue', 'green', 'red', 'grey', 'gray', 'orange', 'silver', 'gold', 'purple', 'yellow', 'pink', 'lavender', 'titanium', 'graphite', 'cream', 'phantom', 'mint', 'cyan', 'magenta', 'violet', 'noir', 'starry', 'lunar', 'lunar dust', 'dream', 'azure', 'jewel', 'golden', 'glow']
    
    details = {'brand': '', 'model': '', 'ram': '', 'storage': '', 'color': '', 'category': 'smartphone', 'processor': '', 'year': '', 'generation': ''}
    
    # Category detection
    if re.search(r'\b(tablet|ipad|tab\s|pad\b)\b', raw_query, re.IGNORECASE):
        details['category'] = 'tablet'
        
        # Extract Apple M-series or A-series processor
        proc_match = re.search(r'\b(m[1-5])\b', raw_query, re.IGNORECASE)
        if proc_match:
            details['processor'] = proc_match.group(1).upper()
        else:
            aproc_match = re.search(r'\b(a\d{2}[x|z]?)\b', raw_query, re.IGNORECASE)
            if aproc_match:
                details['processor'] = aproc_match.group(1).upper()
                
        # Extract year
        year_match = re.search(r'\b(201\d|202\d)\b', raw_query)
        if year_match:
            details['year'] = year_match.group(1)
            
        # Extract generation
        gen_match = re.search(r'\b(\d+(?:st|nd|rd|th)\s*gen(?:eration)?)\b', raw_query, re.IGNORECASE)
        if gen_match:
            num_match = re.search(r'\d+', gen_match.group(1))
            if num_match:
                details['generation'] = f"{num_match.group(0)} Gen"
    
    # Exclude expandable storage descriptions (e.g. expandable up to 2TB) from parsing
    clean_query_for_gb = re.sub(r'\b(expandable|exp\.|exp)\b.*?\b\d+\s*(gb|tb)\b', '', raw_query, flags=re.IGNORECASE)
    gb_matches = list(re.finditer(r'\b(\d+)\s*(GB|TB|MB)\b', clean_query_for_gb, re.IGNORECASE))
    gb_values = []
    
    temp_query = raw_query
    for m in reversed(gb_matches):
        val = int(m.group(1))
        unit = m.group(2).upper()
        sort_val = val * 1024 if unit == 'TB' else (val / 1024 if unit == 'MB' else val)
        gb_values.append({'str': f"{val}{unit}", 'sort_val': sort_val})
        temp_query = temp_query[:m.start()] + " " + temp_query[m.end():]
        
    gb_values.sort(key=lambda x: x['sort_val'])
    
    if len(gb_values) >= 2:
        details['ram'] = gb_values[0]['str']
        details['storage'] = gb_values[-1]['str']
    elif len(gb_values) == 1:
        if 'ram' in raw_query.lower():
            details['ram'] = gb_values[0]['str']
        else:
            details['storage'] = gb_values[0]['str']

    # Fallback: Handle X/Y GB, X+Y GB, or X-Y GB pattern (e.g., 8/128, 12/256, 8GB+128GB, 8-256)
    if not details['ram'] or not details['storage']:
        slash_match = re.search(r'\b(\d{1,2})\s*/\s*(\d{2,4})\b', raw_query)
        if slash_match:
            if not details['ram']: details['ram'] = slash_match.group(1) + 'GB'
            if not details['storage']: details['storage'] = slash_match.group(2) + 'GB'
        
        plus_match = re.search(r'\b(\d{1,2})gb\s*\+\s*(\d{2,4})gb\b', raw_query, re.IGNORECASE)
        if plus_match:
            if not details['ram']: details['ram'] = plus_match.group(1) + 'GB'
            if not details['storage']: details['storage'] = plus_match.group(2) + 'GB'
            
        hyphen_match = re.search(r'\b(\d{1,2})\s*-\s*(\d{2,4})\b', raw_query)
        if hyphen_match:
            ram_val = int(hyphen_match.group(1))
            storage_val = int(hyphen_match.group(2))
            if ram_val <= 32 and storage_val >= 16:
                if not details['ram']: details['ram'] = hyphen_match.group(1) + 'GB'
                if not details['storage']: details['storage'] = hyphen_match.group(2) + 'GB'
            
    temp_query = re.sub(r'\b(RAM|ROM|Storage|Memory)\b', ' ', temp_query, flags=re.IGNORECASE)
    
    # Match brand using substring/pattern matching first
    raw_query_lower = raw_query.lower()
    for b in brands:
        pattern = r'\b' + re.escape(b) + r'\b' if b.isalnum() else re.escape(b)
        if re.search(pattern, raw_query_lower):
            details['brand'] = 'Ai+' if b == 'ai+' else b.capitalize()
            # Remove the brand from temp_query
            temp_query = re.sub(pattern, ' ', temp_query, flags=re.IGNORECASE)
            break

    if not details['brand']:
        words = temp_query.split()
        for word in words:
            clean_word = re.sub(r'[^a-zA-Z0-9]', '', word).lower()
            if clean_word in brands:
                details['brand'] = clean_word.capitalize()
                temp_query = re.sub(r'\b' + re.escape(word) + r'\b', ' ', temp_query, flags=re.IGNORECASE)
                break

    if not details['brand'] and temp_query.split():
        first_word = temp_query.split()[0]
        details['brand'] = re.sub(r'[^a-zA-Z0-9]', '', first_word)
        temp_query = temp_query.replace(first_word, ' ', 1)

    color_segments = []
    
    # A. Check inside parentheses
    paren_matches = list(re.finditer(r'\((.*?)\)', temp_query))
    for m in paren_matches:
        content = m.group(1).lower()
        if any(re.search(r'\b' + re.escape(c) + r'\b', content) for c in base_colors):
            color_segments.append(m.group(1))
            
    # B. Check chunks separated by common delimiters
    color_segments.extend(re.split(r'[,\(\)\|:;\-]', temp_query))
    
    found_color = ''
    for part in color_segments:
        p = part.strip()
        if p and not re.search(r'\d{3,}', p) and len(p) > 2:
            p_lower = p.lower()
            if p_lower in ['mobile phone', 'smartphone', 'dual sim', 'dual', 'sim', 'display'] or 'storage' in p_lower:
                continue
                
            found_c = None
            for c in base_colors:
                if re.search(r'\b' + re.escape(c) + r'\b', p_lower):
                    found_c = c
                    break
                    
            if found_c:
                clean_color = p
                if details['brand']:
                    clean_color = re.sub(r'\b' + re.escape(details['brand']) + r'\b', '', clean_color, flags=re.IGNORECASE)
                
                series_fluff = ['phone', 'pixel', 'galaxy', 'iphone', 'pro', 'max', 'plus', 'ultra', 'moto', 'edge', 'series', 'edition', 'speed', 'prime', 'neo', 'nord', 'lite', 'flip', 'fold', 'active', 'super', 'play', 'power', 'stylus', 'zoom', 'null', 'na']
                for sf in series_fluff:
                    clean_color = re.sub(r'\b' + re.escape(sf) + r'\b', '', clean_color, flags=re.IGNORECASE)
                    
                clean_color = re.sub(r'\b\d+[a-z]?\b', ' ', clean_color, flags=re.IGNORECASE)
                
                found_color = re.sub(r'[,\(\)\|:;\-\+]', ' ', clean_color)
                found_color = ' '.join(found_color.split())
                if found_color:
                    temp_query = re.sub(r'\b' + re.escape(found_color) + r'\b', ' ', temp_query, flags=re.IGNORECASE)
                    break
                    
    details['color'] = found_color.strip(' ,')

    # Split query at bundle keywords, "with", comma ",", or " - " to keep model name clean
    split_match = re.search(r'\b(with|in box|in-box|bundle|combo|pack|gift)\b|,| - ', temp_query, re.IGNORECASE)
    if split_match:
        temp_query = temp_query[:split_match.start()]
    
    temp_query = temp_query.replace('-', ' ')
    temp_query = re.sub(r'\b\d+nm\b', ' ', temp_query, flags=re.IGNORECASE)

    temp_query = re.sub(r'\b(?:5g\+?|4g\+?|lte|3g|2g)\b', ' ', temp_query, flags=re.IGNORECASE)
    temp_query = re.sub(r'(?<!\w)\+(?!\w)', ' ', temp_query)
    temp_query = re.sub(r'[,\(\)]', ' ', temp_query)
    model_words = temp_query.split()
    fluff_words = ['tablet', 'display', 'chip', 'amazon', 'flipkart', 'croma', 'reliance', 'digital', 'calling', 'only', 'buy', 'android', 'smartphone', 'mobile', 'phone', 'unlocked', 'dual', 'sim', 'spec', 'specs', 'support', 'fingerprint', 'gps', 'wifi', 'wi-fi', 'bluetooth', 'nfc', 'charger', 'battery', 'camera', 'screen', 'hd', 'hd+', 'fhd', 'fhd+', 'qhd', 'qhd+', 'amoled', 'lcd', 'ips']
    model_words = [w for w in model_words if w.lower() not in fluff_words]
    model_clean = ' '.join(model_words)
    model_clean = re.sub(r'\b\+\b', ' ', model_clean)
    details['model'] = ' '.join(model_clean.split())
    
    return details

def is_model_match(title_text, details):
    title = title_text.lower()
    if details['brand'] and details['brand'].lower() not in title:
        return False
        
    if details['model']:
        model_lower = details['model'].lower()
        fluff_words = ['smartphone', 'mobile', 'phone', 'ai', 'dual', 'sim', 'unlocked', 'android', 'apple', 'ios', 'camera', 'tablet']
        model_words = [w for w in model_lower.split() if w not in fluff_words]
        for mw in model_words:
            if mw not in title:
                return False
                
        # Modifier Check (Strict)
        modifiers = ['pro', 'air', 'plus', 'max', 'ultra', 'lite', 'fe', 'se', 'fold', 'flip', 'edge', 'neo', 'mini']
        for mod in modifiers:
            target_has = bool(re.search(r'\b' + mod + r'\b', model_lower))
            cand_has = bool(re.search(r'\b' + mod + r'\b', title))
            if target_has != cand_has:
                return False
                
        # Tablet specific validations
        if details.get('category') == 'tablet':
            # Cellular / Connectivity Check
            is_cand_cellular = bool(re.search(r'5g|cellular|lte|4g', title, re.IGNORECASE))
            is_target_cellular = False
            if details.get('connectivity'):
                is_target_cellular = bool(re.search(r'cellular|5g|lte|4g', details['connectivity'], re.IGNORECASE))
            if is_target_cellular != is_cand_cellular:
                return False

            # Processor Check
            cand_proc = ''
            m_match = re.search(r'\b(m[1-5])\b', title, re.IGNORECASE)
            if m_match:
                cand_proc = m_match.group(1).upper()
            else:
                a_match = re.search(r'\b(a\d{2}[x|z]?)\b', title, re.IGNORECASE)
                if a_match:
                    cand_proc = a_match.group(1).upper()
            if details.get('processor') and cand_proc and details['processor'] != cand_proc:
                return False
                
            # Year Check
            y_match = re.search(r'\b(201\d|202\d)\b', title)
            cand_year = y_match.group(1) if y_match else ''
            if details.get('year') and cand_year and details['year'] != cand_year:
                return False
                
            # Generation Check
            g_match = re.search(r'\b(\d+(?:st|nd|rd|th)\s*gen(?:eration)?)\b', title, re.IGNORECASE)
            if g_match:
                num_match = re.search(r'\d+', g_match.group(1))
                cand_gen = f"{num_match.group(0)} Gen" if num_match else ''
            else:
                cand_gen = ''
            if details.get('generation') and cand_gen and details['generation'] != cand_gen:
                return False
                
    return True

def is_strict_match(title_text, details):
    if not is_model_match(title_text, details):
        return False
        
    title = title_text.lower()
    if details['ram'] and details['ram'].lower() not in title.replace(' ', ''):
        ram_spaced = details['ram'].lower().replace('gb', ' gb').replace('tb', ' tb')
        if ram_spaced not in title:
            return False
            
    if details['storage'] and details['storage'].lower() not in title.replace(' ', ''):
        storage_spaced = details['storage'].lower().replace('gb', ' gb').replace('tb', ' tb')
        if storage_spaced not in title:
            return False
            
    return True

def is_variant_match(title_text, details):
    return is_model_match(title_text, details)

def search_amazon(driver, query, details):
    res = {"exact": None, "variant": None}
    try:
        url = f"https://www.amazon.in/s?k={urllib.parse.quote(query)}"
        driver.get(url)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'div[data-component-type="s-search-result"]'))
        )
        for result in driver.find_elements(By.CSS_SELECTOR, 'div[data-component-type="s-search-result"]')[:10]:
            try:
                elem = result.find_element(By.CSS_SELECTOR, 'a.a-link-normal[href*="/dp/"]')
                link = elem.get_attribute('href').split('?')[0]
                if is_strict_match(result.text, details):
                    res["exact"] = link
                    return res
                elif is_variant_match(result.text, details) and not res["variant"]:
                    res["variant"] = link
            except: continue
    except: pass
    return res

def search_flipkart(driver, query, details):
    res = {"exact": None, "variant": None}
    try:
        url = f"https://www.flipkart.com/search?q={urllib.parse.quote(query)}"
        driver.get(url)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'a[target="_blank"]'))
        )
        for result in driver.find_elements(By.CSS_SELECTOR, 'a[target="_blank"]')[:10]:
            try:
                link = result.get_attribute('href').split('?')[0]
                if is_strict_match(result.text, details):
                    res["exact"] = link
                    return res
                elif is_variant_match(result.text, details) and not res["variant"]:
                    res["variant"] = link
            except: continue
    except: pass
    return res

def search_croma(driver, query, details):
    res = {"exact": None, "variant": None}
    try:
        # Build query without color
        croma_query = f"{details.get('brand') or ''} {details.get('model') or ''} {details.get('ram') or ''} {details.get('storage') or ''}".strip()
        croma_query = " ".join(croma_query.split())
        if not croma_query:
            croma_query = query
        url = f"https://www.croma.com/searchB?q={urllib.parse.quote(croma_query)}%3Arelevance"
        driver.get(url)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '.product-title a, h3.product-title a'))
        )
        for result in driver.find_elements(By.CSS_SELECTOR, '.product-title a, h3.product-title a')[:10]:
            try:
                link = result.get_attribute('href').split('?')[0]
                if is_strict_match(result.text, details):
                    res["exact"] = link
                    return res
                elif is_variant_match(result.text, details) and not res["variant"]:
                    res["variant"] = link
            except: continue
    except: pass
    return res

def search_reliance(driver, query, details):
    res = {"exact": None, "variant": None}
    try:
        # Build strict query for Reliance Digital
        rd_query = f"{details['brand']} {details['model']} {details['storage']}"
        url = f"https://www.reliancedigital.in/products?q={urllib.parse.quote(rd_query)}"
        driver.get(url)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'a[href*="/product/"]'))
        )
        for result in driver.find_elements(By.CSS_SELECTOR, 'a[href*="/product/"]')[:10]:
            try:
                link = result.get_attribute('href').split('?')[0]
                if is_strict_match(result.text, details):
                    res["exact"] = link
                    return res
                elif is_variant_match(result.text, details) and not res["variant"]:
                    res["variant"] = link
            except: continue
    except: pass
    return res

def main():
    if len(sys.argv) < 2:
        print("Please provide a product query.")
        print("Example: python match.py \"vivo T5X 5G (Cyber Green, 8GB RAM, 128GB Storage)\"")
        sys.exit(1)
        
    raw_query = " ".join(sys.argv[1:])
    details = extract_details(raw_query)
    
    print(f"\n[1] Extracting Details from query: '{raw_query}'")
    print(f"    => Brand:   {details['brand'] or 'N/A'}")
    print(f"    => Model:   {details['model'] or 'N/A'}")
    print(f"    => RAM:     {details['ram'] or 'N/A'}")
    print(f"    => Storage: {details['storage'] or 'N/A'}")
    print(f"    => Color:   {details['color'] or 'N/A'}")
    
    query = f"{details['brand']} {details['model']} {details['ram']} {details['storage']} {details['color']}".strip()
    print(f"\n[2] Launching stealth browser to search for matches...")
    
    options = Options()
    options.add_argument("--window-size=1280,800")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    results = {
        "amazon": search_amazon(driver, query, details),
        "flipkart": search_flipkart(driver, query, details),
        "croma": search_croma(driver, query, details),
        "reliance_digital": search_reliance(driver, query, details)
    }

    driver.quit()

    output = {
        "input_product": details,
        "results": results
    }

    print("\n--- SCRAPING COMPLETE ---\n")
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    main()
