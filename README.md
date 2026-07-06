# SmartPrice Matcher

A highly advanced, strict-matching e-commerce product comparison tool. This tool consists of a Chrome Extension that injects a floating UI onto product pages, and a Python Selenium backend that bypasses bot protections to find the exact same product on Amazon, Flipkart, Croma, and Reliance Digital.

## 🚀 How to Install on a New System

### Part 1: The Python Backend Server
Because e-commerce sites block standard web requests, this tool uses a stealth Selenium browser running in the background to scrape results.
1. Install [Python](https://www.python.org/downloads/).
2. Open a terminal in this folder and install the dependencies:
   ```cmd
   pip install -r requirements.txt
   ```
3. Start the server (leave this terminal window open while using the extension):
   ```cmd
   python server.py
   ```

### Part 2: The Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`
2. Turn ON **Developer Mode** in the top right corner.
3. Click the **Load unpacked** button in the top left.
4. Select the `extension` folder located inside this project directory.
5. Go to any product page on Amazon, Flipkart, Croma, or Reliance Digital.
6. Look for the floating purple button on the right side of the screen!

## 📦 How to Export / Send to a Friend
If you want to send this to someone else:
1. Simply ZIP this entire `POLOSTEPS` folder.
2. Send them the zip file.
3. Tell them to follow the "How to Install" instructions above!

Alternatively, you can share the link to your GitHub repository!
