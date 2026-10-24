
const fs=require('fs'),path=require('path'),{PDFDocument,StandardFonts}=require('pdf-lib'),{chromium}=require('@playwright/test')
require('esbuild').buildSync({entryPoints:['src/main/services/pdf-writer.ts'],outfile:'.local/pdf-writer.cjs',bundle:true,platform:'node',packages:'external'})
;(async()=>{
 const pdf=await PDFDocument.create(),page=pdf.addPage([612,792]),font=await pdf.embedFont(StandardFonts.TimesRoman)
 page.drawText('Highlight appearance',{x:50,y:684,size:14,font});page.drawText('Background appearance',{x:50,y:644,size:14,font})
 const q=[50,700,240,700,50,680,240,680],base={page:1,createdAt:new Date().toISOString()}
 const annots=[{...base,id:'high',kind:'highlight',quads:[q],color:'#fde68a'},{...base,id:'bg',kind:'background',quads:[q.map((v,i)=>i%2?v-40:v)],color:'#bbf7d0',opacity:.35},{...base,id:'text',kind:'textColor',quads:[q.map((v,i)=>i%2?v-80:v)],color:'#b42318',text:'中文颜色测试',fontSize:14},{...base,id:'note',kind:'note',at:[300,700],content:'中文便签：时序裕量',author:'我的注释'}]
 const bytes=await require('../.local/pdf-writer.cjs').writePdfAnnotations(await pdf.save(),annots,path.resolve('resources/fonts/NotoSansSC-Regular.ttf'))
 fs.mkdirSync('tests/evidence/m4',{recursive:true});const file=path.resolve('tests/evidence/m4/standard-annotations.pdf');fs.writeFileSync(file,bytes)
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{const p=await browser.newPage({viewport:{width:1440,height:900}});await p.goto(require('url').pathToFileURL(file).href);await p.waitForTimeout(2000);await p.screenshot({path:'tests/evidence/m4/chrome-pdf.png'});fs.writeFileSync('tests/evidence/m4/chrome.json',JSON.stringify({version:browser.version(),title:await p.title(),urlScheme:new URL(p.url()).protocol},null,2))}
 finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1})

