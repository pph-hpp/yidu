import {it,expect} from 'vitest'
import {rectToQuad,quadToRect,mergeRects} from '../../src/renderer/src/lib/pdfGeometry'
function viewport(scale:number){return {convertToPdfPoint:(x:number,y:number)=>[x/scale,800-y/scale],convertToViewportPoint:(x:number,y:number)=>[x*scale,(800-y)*scale]}}
it('缩放 1.0 与 2.0 的同一选区坐标误差小于 0.5pt',()=>{
 const a=rectToQuad({left:60,top:130,right:210,bottom:150},{left:10,top:30,right:622,bottom:830},viewport(1))
 const b=rectToQuad({left:110,top:230,right:410,bottom:270},{left:10,top:30,right:1234,bottom:1630},viewport(2))
 a.forEach((n,i)=>expect(Math.abs(n-b[i])).toBeLessThan(.5))
 expect(a).toEqual([50,700,200,700,50,680,200,680])
 expect(quadToRect(a,viewport(2))).toEqual({left:100,top:200,right:400,bottom:240})
})
it('同一行间距小于 2px 才合并，不跨行合并',()=>{
 const rects=mergeRects([{left:0,top:0,right:10,bottom:10},{left:11,top:1,right:20,bottom:11},{left:0,top:15,right:20,bottom:25},{left:24,top:0,right:30,bottom:10}])
 expect(rects).toHaveLength(3);expect(rects[0]).toEqual({left:0,top:0,right:20,bottom:11})
})

