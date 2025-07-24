const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const cron = require('node-cron');
const CREDS = require('./credentials.json');

const SPREADSHEET_ID = '1g64dJOcIhqwf9tuvi16oDLoEaByuxBsNcb5U4adn5wI'; // شناسه Sheet خود را اینجا وارد کنید

async function fetchAds() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );

  await page.goto('https://divar.ir/s/sirik', { waitUntil: 'networkidle2' });

  const ads = await page.evaluate(() => {
    const cards = [
      ...document.querySelectorAll('article.kt-post-card'),
      ...document.querySelectorAll('div.post-card-item'),
    ];

    return cards.map((card) => {
      const title =
        card.querySelector('h2.kt-post-card__title')?.innerText.trim() ||
        card.querySelector('[data-testid="post-card-title"]')?.innerText.trim() ||
        '';

      const descEl =
        card.querySelector('.kt-post-card__description') ||
        card.querySelector('[data-testid="post-card-subtitle"]');

      const desc = descEl ? descEl.innerText.trim() : '';

      const price = /تومان/.test(desc) ? desc : '';
      const status = /تومان/.test(desc) ? '' : desc;

      const time =
        card.querySelector('.kt-post-card__bottom-description')?.innerText.trim() ||
        card.querySelector('[data-testid="post-card-time"]')?.innerText.trim() ||
        '';

      const link = card.querySelector('a')?.getAttribute('href') || '';
      const img = card.querySelector('img')?.getAttribute('src') || '';

      return {
        title,
        price,
        status,
        time,
        link: link ? 'https://divar.ir' + link : '',
        image: img.startsWith('http') ? img : `https:${img}`,
      };
    });
  });

  await browser.close();
  return ads;
}

async function saveToSheet(ads) {
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
  await doc.useServiceAccountAuth(CREDS);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  await sheet.setHeaderRow(['عنوان', 'قیمت', 'وضعیت', 'زمان', 'لینک', 'عکس']);

  const rows = await sheet.getRows();
  const existingLinks = rows.map((r) => r['لینک']);

  for (const ad of ads) {
    if (!existingLinks.includes(ad.link)) {
      await sheet.addRow({
        عنوان: ad.title,
        قیمت: ad.price,
        وضعیت: ad.status,
        زمان: ad.time,
        لینک: ad.link,
        عکس: ad.image,
      });
    }
  }
}

async function runJob() {
  console.log(`[${new Date().toLocaleTimeString()}] در حال اجرا...`);
  try {
    const ads = await fetchAds();
    await saveToSheet(ads);
    console.log('✅ با موفقیت ذخیره شد.');
  } catch (err) {
    console.error('❌ خطا:', err);
  }
}

// اجرای اولیه
runJob();

// اجرای خودکار هر 10 دقیقه
cron.schedule('*/10 * * * *', () => {
  runJob();
});
