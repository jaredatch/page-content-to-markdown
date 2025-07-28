const puppeteer = require('puppeteer');

let browser;
let page;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  page = await browser.newPage();
  
  // Enable console logging in tests
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
});

afterAll(async () => {
  if (browser) {
    await browser.close();
  }
});

global.browser = browser;
global.page = page; 