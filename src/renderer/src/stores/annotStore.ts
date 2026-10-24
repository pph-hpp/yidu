import {create} from 'zustand'
import type {Annot} from '../../../shared/types'
import type {EditTool} from '../../../shared/annotations'
interface Command {before:Annot[];after:Annot[]}
interface FileAnnots {annots:Annot[];undo:Command[];redo:Command[];version:number;savedVersion:number;protected:boolean;loaded:boolean}
interface State {
 files:Record<string,FileAnnots>;tool:EditTool;colors:Record<EditTool,string>;opacity:number;selectedId:string|null
 initialize(id:string,annots:Annot[],protectedFile?:boolean):void
 apply(id:string,annots:Annot[]):void;add(id:string,annots:Annot[]):void;update(id:string,annot:Annot):void;remove(id:string,annotId:string):void
 undo(id:string):void;redo(id:string):void;markSaved(id:string,version?:number):void;discard(id:string):void
 setTool(tool:EditTool):void;setColor(color:string):void;setOpacity(opacity:number):void;select(id:string|null):void
}
export function isDirty(file:FileAnnots|undefined):boolean{return !!file&&file.version!==file.savedVersion}
export const useAnnotStore=create<State>((set,get)=>({
 files:{},tool:'select',colors:{select:'yellow',highlight:'yellow',background:'yellow',textColor:'red',note:'yellow'},opacity:.35,selectedId:null,
 initialize(id,annots,protectedFile=false){if(get().files[id]?.loaded)return;set(s=>({files:{...s.files,[id]:{annots,undo:[],redo:[],version:0,savedVersion:0,protected:protectedFile,loaded:true}}}))},
 apply(id,annots){const f=get().files[id];if(!f||f.protected)return;const command={before:f.annots,after:annots};set(s=>({files:{...s.files,[id]:{...f,annots,undo:[...f.undo,command],redo:[],version:f.version+1}}}))},
 add(id,annots){const f=get().files[id];if(f)get().apply(id,[...f.annots,...annots])},
 update(id,annot){const f=get().files[id];if(f)get().apply(id,f.annots.map(a=>a.id===annot.id?annot:a))},
 remove(id,annotId){const f=get().files[id];if(f)get().apply(id,f.annots.filter(a=>a.id!==annotId));set({selectedId:null})},
 undo(id){const f=get().files[id],cmd=f?.undo.at(-1);if(!f||!cmd||f.protected)return;set(s=>({files:{...s.files,[id]:{...f,annots:cmd.before,undo:f.undo.slice(0,-1),redo:[...f.redo,cmd],version:f.version+1}},selectedId:null}))},
 redo(id){const f=get().files[id],cmd=f?.redo.at(-1);if(!f||!cmd||f.protected)return;set(s=>({files:{...s.files,[id]:{...f,annots:cmd.after,redo:f.redo.slice(0,-1),undo:[...f.undo,cmd],version:f.version+1}},selectedId:null}))},
 markSaved(id,version){const f=get().files[id];if(f)set(s=>({files:{...s.files,[id]:{...f,savedVersion:version??f.version}}}))},
 discard(id){set(s=>{const files={...s.files};delete files[id];return {files,selectedId:null}})},
 setTool:tool=>set({tool,selectedId:null}),setColor:color=>set(s=>({colors:{...s.colors,[s.tool]:color}})),setOpacity:opacity=>set({opacity:Math.max(0,Math.min(1,opacity))}),select:selectedId=>set({selectedId})
}))

