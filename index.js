const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Enable stealth plugin to bypass basic bot protections
puppeteer.use(StealthPlugin());

async function searchAmazon(page, query) {
  try {
    const url = `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    await page.waitForSelector('div[data-component-type="s-search-result"] h2 a', { timeout: 5000 }).catch(() => {});
    const firstResult = await page.$('div[data-component-type="s-search-result"] h2 a');
    
    if (firstResult) {
      let href = await page.evaluate(el => el.href, firstResult);
      return href.split('?')[0]; // Clean the URL
    }
  } catch (error) {
    // console.log("Amazon error:", error.message);
  }
  return "Not Found";
}

async function searchFlipkart(page, query) {
  try {
    const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    await page.waitForSelector('a[target="_blank"]', { timeout: 5000 }).catch(() => {});
    const firstResult = await page.$('a[target="_blank"]');
    
    if (firstResult) {
      let href = await page.evaluate(el => el.href, firstResult);
      return href.split('?')[0];
    }
  } catch (error) {
    // console.log("Flipkart error:", error.message);
  }
  return "Not Found";
}

async function searchCroma(page, query) {
  try {
    const url = `https://www.croma.com/searchB?q=${encodeURIComponent(query)}%3Arelevance`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    await page.waitForSelector('.product-title a, h3.product-title a', { timeout: 5000 }).catch(() => {});
    const firstResult = await page.$('.product-title a, h3.product-title a');
    
    if (firstResult) {
      let href = await page.evaluate(el => el.href, firstResult);
      return href.split('?')[0];
    }
  } catch (error) {
    // console.log("Croma error:", error.message);
  }
  return "Not Found";
}

async function searchRelianceDigital(page, query) {
  try {
    const url = `https://www.reliancedigital.in/search?q=${encodeURIComponent(query)}:relevance`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    await page.waitForSelector('a[href^="/product/"]', { timeout: 5000 }).catch(() => {});
    const firstResult = await page.$('a[href^="/product/"]');
    
    if (firstResult) {
      let href = await page.evaluate(el => el.href, firstResult);
      return href.split('?')[0];
    }
  } catch (error) {
    // console.log("Reliance Digital error:", error.message);
  }
  return "Not Found";
}

async function main() {
  const query = process.argv.slice(2).join(' ');
  if (!query) {
    console.log("Please provide a product query to search.\nExample: node index.js Apple iPhone 17 256GB Lavender");
    return;
  }

  console.log(`\nLaunching stealth browser to search for: "${query}"...\n`);

  // Launch Puppeteer with stealth settings
  const browser = await puppeteer.launch({ 
    headless: false, // Set to false so you can see it bypass captchas if needed
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'] 
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const results = {
    amazon: await searchAmazon(page, query),
    flipkart: await searchFlipkart(page, query),
    croma: await searchCroma(page, query),
    reliance_digital: await searchRelianceDigital(page, query)
  };

  await browser.close();

  const output = {
    input_product: {
      query: query
    },
    results: results
  };

  console.log("\n--- SCRAPING COMPLETE ---\n");
  console.log(JSON.stringify(output, null, 2));
}

main();
