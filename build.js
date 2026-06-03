// Daily FX + Coffee updater for GitHub Pages (runs in GitHub Actions, no token needed)
// Reads index.html, appends today's data point, rewrites arrays + update stamp.
const fs = require('fs');
const FILE = 'index.html';

const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (fx-twd actions bot)' } };
async function getJSON(url) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  return r.json();
}

function getLabels(html) {
  const m = html.match(/const LABELS = \[(.*?)\];/s);
  return JSON.parse('[' + m[1] + ']');
}
function getSeries(html, name) {
  const m = html.match(new RegExp(name + ':\\s*\\{[^}]*?data:\\[(.*?)\\]\\}', 's'));
  return m[1].split(',').map(s => parseFloat(s.trim()));
}

(async () => {
  let html = fs.readFileSync(FILE, 'utf8');

  // --- 1. latest FX (exchangerate-api, base TWD) ---
  const fx = await getJSON('https://open.er-api.com/v6/latest/TWD');
  const rates = fx.rates;
  const updUnix = fx.time_last_update_unix * 1000;
  const tpe = new Date(updUnix + 8 * 3600 * 1000); // Taipei = UTC+8
  const dateStr = tpe.toISOString().slice(0, 10);
  const timeStr = tpe.toISOString().slice(11, 16) + '（台北）'; // （台北）
  const fxv = {
    CHF: +(1 / rates.CHF).toFixed(2),
    USD: +(1 / rates.USD).toFixed(2),
    EUR: +(1 / rates.EUR).toFixed(2),
    CNY: +(1 / rates.CNY).toFixed(3),
    JPY: +(1 / rates.JPY).toFixed(4),
  };

  // --- 2. latest coffee (ICE Arabica KC=F via Yahoo) ---
  let coffee = null;
  try {
    const y = await getJSON('https://query1.finance.yahoo.com/v8/finance/chart/KC=F?range=5d&interval=1d');
    const r0 = y.chart.result[0];
    const closes = r0.indicators.quote[0].close.filter(x => x != null);
    if (closes.length) coffee = Math.round(closes[closes.length - 1] * 10) / 10;
  } catch (e) {
    console.log('coffee fetch failed, carrying forward:', e.message);
  }

  // --- 3. parse current arrays ---
  let labels = getLabels(html);
  const series = {};
  for (const k of ['CHF', 'USD', 'EUR', 'CNY', 'JPY', 'COFFEE']) series[k] = getSeries(html, k);
  const last = labels[labels.length - 1];

  // --- 4. append or update today ---
  if (dateStr > last) {
    labels.push(dateStr);
    for (const k of ['CHF', 'USD', 'EUR', 'CNY', 'JPY']) series[k].push(fxv[k]);
    series.COFFEE.push(coffee != null ? coffee : series.COFFEE[series.COFFEE.length - 1]);
  } else {
    const i = labels.length - 1;
    for (const k of ['CHF', 'USD', 'EUR', 'CNY', 'JPY']) series[k][i] = fxv[k];
    if (coffee != null) series.COFFEE[i] = coffee;
  }

  // --- 5. re-inject ---
  html = html.replace(/const LABELS = \[.*?\];/s, 'const LABELS = ' + JSON.stringify(labels) + ';');
  for (const k of ['CHF', 'USD', 'EUR', 'CNY', 'JPY', 'COFFEE']) {
    html = html.replace(
      new RegExp('(' + k + ':\\s*\\{[^}]*?data:)\\[.*?\\]', 's'),
      '$1[' + series[k].join(',') + ']'
    );
  }
  html = html.replace(/(id="stampDate">)[^<]*(<)/, '$1' + dateStr + '$2');
  html = html.replace(/(id="stampTime">)[^<]*(<)/, '$1' + timeStr + '$2');

  fs.writeFileSync(FILE, html);
  console.log('OK', dateStr, fxv, 'coffee=' + coffee, 'points=' + labels.length);
})();
