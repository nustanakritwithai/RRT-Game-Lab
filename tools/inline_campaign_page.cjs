#!/usr/bin/env node
'use strict';
// Refresh the modules inlined into campaign.html (the page is deployed alone and must work offline).
// Usage: node tools/inline_campaign_page.cjs   (idempotent; rrt_arena_campaign_ui_v090.test.cjs checks the result)
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),page=path.join(root,'campaign.html');
const MODULES={campaignCore:'rrt_arena_campaign_v090.js',campaignAiCore:'rrt_arena_campaign_ai_v090.js',campaignUiCore:'rrt_arena_campaign_ui_v090.js'};
let html=fs.readFileSync(page,'utf8');
for(const [id,file] of Object.entries(MODULES)){
 const re=new RegExp(`<script id="${id}">\\n[\\s\\S]*?</script>`);
 if(!re.test(html))throw new Error('campaign.html is missing <script id="'+id+'">');
 const code=fs.readFileSync(path.join(root,file),'utf8').trim();
 html=html.replace(re,()=>`<script id="${id}">\n${code}\n</script>`);
}
fs.writeFileSync(page,html);
console.log('campaign.html: inlined',Object.values(MODULES).join(', '));
