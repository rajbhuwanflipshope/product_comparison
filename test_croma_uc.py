import urllib.parse
import undetected_chromedriver as uc
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By

options = uc.ChromeOptions()
options.add_argument("--window-size=1280,800")
# Note: uc.Chrome does not support true headless without being detected easily, so we use standard mode
driver = uc.Chrome(options=options)

query = "Google Pixel 10 5G 12GB 256GB Frost"
url = f"https://www.croma.com/searchB?q={urllib.parse.quote(query)}%3Arelevance"
print(f"URL: {url}")
driver.get(url)
print("Page title:", driver.title)
try:
    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, '.product-title a, h3.product-title a'))
    )
    print("Found elements!")
    for elem in driver.find_elements(By.CSS_SELECTOR, '.product-title a, h3.product-title a'):
        print(elem.text)
except Exception as e:
    print("Error:", str(e))
    # print page source snippet
    print(driver.page_source[:500])

driver.quit()
