// Small, dependency-free user-agent parser. Good enough for dashboard splits.

const BOT = /bot|crawl|spider|slurp|scrape|fetch|headless|lighthouse|pagespeed|pingdom|gtmetrix|uptime|monitor|preview|facebookexternalhit|embedly|quora link|whatsapp\/|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp|httpclient|postman|insomnia|phantom|selenium|playwright|puppeteer|cypress|vercel/i;

export function isBot(ua) {
  if (!ua || ua.length < 20) return true;
  return BOT.test(ua);
}

export function parseUA(ua = '') {
  let os = 'Overig';
  if (/iPhone|iPod/.test(ua)) os = 'iOS';
  else if (/iPad/.test(ua)) os = 'iPadOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let browser = 'Overig';
  if (/LinkedInApp/i.test(ua)) browser = 'LinkedIn-app';
  else if (/FBAN|FBAV|FB_IAB/.test(ua)) browser = 'Facebook-app';
  else if (/Instagram/.test(ua)) browser = 'Instagram-app';
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  let device = 'Desktop';
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) device = 'Tablet';
  else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) device = 'Mobiel';

  return { os, browser, device };
}
