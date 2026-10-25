'use strict';
/* Real Chromium smoke test. Called after Playwright is installed in GitHub Actions.
 * Executes UI clicks, mobile layouts, conflict scenario, comparison and download.
 */
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const files={
 '/network-lab.html':['network-lab.html','text/html;charset=utf-8'],
 '/network_lab_core.js':['network_lab_core.js','application/javascript;charset=utf-8'],
 '/network_lab_ui.js':['network_lab_ui.js','application/javascript;charset=utf-8'],
 '/favicon.ico':[null,'image/x-icon']
};
const server=http.createServer((req,res)=>{
 const key=(req.url||'').split('?')[0],file=files[key];
 if(!file){res.writeHead(404);res.end('not found');return;}
 if(!file[0]){res.writeHead(204);res.end();return;}
 try{
  const data=fs.readFileSync(path.join(ROOT,file[0]));
  res.writeHead(200,{'Content-Type':file[1], 'Cache-Control':'no-store'});
  res.end(data);
 }catch(e){res.writeHead(500);res.end(String(e));}
});
const listen=()=>new Promise((resolve,reject)=>{
 server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>resolve(server.address().port));
});
const close=()=>new Promise(resolve=>server.close(resolve));
async function main(){
 const port=await listen();
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  fs.mkdirSync(path.join(ROOT,'artifacts'),{recursive:true});
  for(const width of [320,393,1365]){
   const page=await browser.newPage({viewport:{width,height:width===1365?800:760},deviceScaleFactor:1});
   const errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('response',r=>{
    if(/network_lab_(?:core|ui)\.js/.test(r.url())&&r.status()!==200)errors.push('script HTTP '+r.status());
   });
   await page.goto('http://127.0.0.1:'+port+'/network-lab.html',{waitUntil:'load'});
   await page.waitForFunction(()=>!!window.__peerMeshDebug,{timeout:12000});
   const initial=await page.evaluate(()=>window.__peerMeshDebug.getState());
   assert.equal(initial.agents,300,'Initial agent count '+width);
   assert.equal(initial.metrics.primaryReached,1,'Primary source 1 '+width);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=2,'Horizontal viewport overflow at '+width+': '+overflow);
   await page.locator('#start').click();
   await page.waitForFunction(()=>window.__peerMeshDebug.getState().metrics.tick>=2,{timeout:15000});
   await page.locator('#pause').click();
   const paused=await page.evaluate(()=>window.__peerMeshDebug.getState().metrics.tick);
   await page.locator('#step').click();
   const stepped=await page.evaluate(()=>window.__peerMeshDebug.getState().metrics.tick);
   assert.equal(stepped,paused+1,'Step increments exactly 1 tick');
   assert.equal((await page.locator('#m-transmissions').innerText()).length>0,true);
   await page.locator('#mesh-canvas').click({position:{x:100,y:80}});
   assert.match(await page.locator('#inspector').innerText(),/Agent #\d+/);
   if(width===393){
    await page.locator('#node-count').selectOption('100');
    await page.locator('#scenario').selectOption('conflict');
    await page.locator('#range').evaluate(el=>{
     el.value='450';el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.locator('#loss').evaluate(el=>{
     el.value='0';el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.evaluate(()=>{
     for(let i=0;i<36;i++)document.getElementById('step').click();
    });
    const conflict=await page.evaluate(()=>window.__peerMeshDebug.getState());
    assert.ok(conflict.metrics.primaryReached>1,'Conflict trial propagates');
    assert.ok(conflict.metrics.conflicted>0,'Independent conflict visible');
    assert.ok(conflict.metrics.duplicates>0,'Duplicate evidence counted');

    await page.locator('#node-count').selectOption('50');
    await page.locator('#scenario').selectOption('single');
    await page.locator('#compare').click();
    await page.waitForFunction(()=>window.__peerMeshDebug.getState().comparison.length===4
     && document.querySelectorAll('#comparison tbody tr').length===4
     && !window.__peerMeshDebug.getState().comparing,{timeout:60000});
    const compared=await page.evaluate(()=>window.__peerMeshDebug.getState());
    assert.equal(compared.comparison.length,4,'All protocols compared');
    const rows=await page.locator('#comparison tbody tr').count();
    assert.equal(rows,4,'Comparison table rows');
    const [download]=await Promise.all([
     page.waitForEvent('download'),
     page.locator('#export').click()
    ]);
    assert.match(download.suggestedFilename(),/^peermesh-seed-/);
    await page.screenshot({path:path.join(ROOT,'artifacts','peermesh-mobile-393.png'),fullPage:true});
   }
   if(width===1365)await page.screenshot({path:path.join(ROOT,'artifacts','peermesh-desktop-1365.png'),fullPage:true});
   assert.deepEqual(errors,[],'Browser exceptions '+width);
   console.log('CHROMIUM PASS',width,'ticks',stepped,'overflow',overflow);
   await page.close();
  }
 }finally{await browser.close();await close();}
}
main().catch(err=>{console.error(err);process.exitCode=1;server.close();});
