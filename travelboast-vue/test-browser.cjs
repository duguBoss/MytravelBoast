const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Find play button by text content
  const buttons = await page.$$('button');
  console.log('Total buttons:', buttons.length);
  
  for (const btn of buttons) {
    const text = await btn.evaluate(el => el.textContent.trim());
    console.log('Button:', text);
  }
  
  // Click the top bar play button
  const playBtn = await page.$x("//button[contains(text(), '播放')]");
  console.log('Play buttons found:', playBtn.length);
  
  if (playBtn.length > 0) {
    console.log('Clicking first play button...');
    await playBtn[0].click();
    await page.waitForTimeout(2000);
    
    // Check modal
    const modal = await page.$('.modal-backdrop.show');
    console.log('Modal visible:', !!modal);
    
    if (modal) {
      await page.waitForTimeout(1000);
      
      // Find all buttons in modal
      const modalButtons = await modal.$$('button');
      console.log('Modal buttons:', modalButtons.length);
      
      for (const btn of modalButtons) {
        const text = await btn.evaluate(el => el.textContent.trim());
        const disabled = await btn.evaluate(el => el.disabled);
        const display = await btn.evaluate(el => window.getComputedStyle(el).display);
        console.log('Modal button:', text, '| disabled:', disabled, '| display:', display);
      }
      
      // Click play in modal
      const modalPlayBtns = await page.$x("//div[contains(@class, 'preview-actions')]//button[contains(text(), '播放')]");
      console.log('Modal play buttons:', modalPlayBtns.length);
      
      if (modalPlayBtns.length > 0) {
        await modalPlayBtns[0].click();
        console.log('Clicked play in modal');
        await page.waitForTimeout(3000);
        
        // Check progress
        const progressBar = await page.$('.progress-bar');
        if (progressBar) {
          const width = await progressBar.evaluate(el => el.style.width);
          console.log('Progress width:', width);
        }
        
        // Check if isPlaying changed
        const isPlaying = await page.evaluate(() => {
          // Try to find Vue component state
          const app = document.querySelector('#app');
          return app ? 'app found' : 'no app';
        });
        console.log('App state:', isPlaying);
      }
    }
  }
  
  await browser.close();
  console.log('Test complete');
})();
