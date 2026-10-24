import {it,expect} from 'vitest'
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
import {atomicWrite} from '../../src/main/services/atomic-write'
it('提交前失败不破坏原文件，成功后完整替换且清理临时文件',async()=>{
 const root=await mkdtemp(join(tmpdir(),'yidu-atomic-')),path=join(root,'source.pdf')
 try{
  await writeFile(path,'original')
  await expect(atomicWrite(path,new TextEncoder().encode('new'),async()=>{throw new Error('simulate crash before rename')})).rejects.toThrow('simulate')
  expect(await readFile(path,'utf8')).toBe('original');expect(await readdir(root)).toEqual(['source.pdf'])
  await atomicWrite(path,new TextEncoder().encode('new'));expect(await readFile(path,'utf8')).toBe('new')
 }finally{if(!resolve(root).startsWith(resolve(tmpdir())+sep)||!root.includes('yidu-atomic-'))throw new Error('临时目录范围无效');await rm(root,{recursive:true,force:true})}
})

