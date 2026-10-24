import {open,rename,unlink} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
export async function atomicWrite(path:string,bytes:Uint8Array,beforeRename?:()=>Promise<void>):Promise<void>{
 const temp=path+'.'+randomUUID()+'.yidu-tmp'
 try{
  const file=await open(temp,'wx')
  try{await file.writeFile(bytes);await file.sync()}finally{await file.close()}
  await beforeRename?.()
  await rename(temp,path)
 }finally{await unlink(temp).catch(()=>{})}
}

