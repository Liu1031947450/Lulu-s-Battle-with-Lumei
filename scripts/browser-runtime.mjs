import { access } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

export async function launchBrowser(engine = 'chromium') {
  if (engine === 'firefox') return firefox.launch({ headless: true });
  if (engine === 'webkit') return webkit.launch({ headless: true });
  let channel = process.env.BROWSER_CHANNEL;
  if (!channel && process.platform === 'darwin') {
    try { await access('/Applications/Google Chrome.app'); channel = 'chrome'; } catch { /* 没有系统 Chrome 时使用 Playwright 自带 Chromium。 */ }
  }
  return chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
}
