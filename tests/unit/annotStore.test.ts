import {it,expect,beforeEach} from 'vitest'
import {useAnnotStore,isDirty} from '../../src/renderer/src/stores/annotStore'
import type {Annot} from '../../src/shared/types'
const note:Annot={id:'a',page:1,createdAt:new Date().toISOString(),kind:'note',at:[10,20],content:'中文',author:'我'}
beforeEach(()=>useAnnotStore.setState({files:{}}))
it('四种编辑按文件撤销重做，undo 回到保存点仍按版本判脏',()=>{
 const s=useAnnotStore.getState();s.initialize('one',[]);s.initialize('two',[])
 s.add('one',[note]);expect(isDirty(useAnnotStore.getState().files.one)).toBe(true)
 s.markSaved('one');expect(isDirty(useAnnotStore.getState().files.one)).toBe(false)
 s.update('one',{...note,content:'更新'});s.undo('one')
 expect(useAnnotStore.getState().files.one.annots).toEqual([note]);expect(isDirty(useAnnotStore.getState().files.one)).toBe(true)
 s.redo('one');expect(useAnnotStore.getState().files.one.annots[0]).toMatchObject({content:'更新'})
 expect(useAnnotStore.getState().files.two.annots).toEqual([])
 s.remove('one','a');s.undo('one');expect(useAnnotStore.getState().files.one.annots).toHaveLength(1)
})
it('保存快照期间新编辑仍保持脏状态，受保护文件不可写',()=>{
 const s=useAnnotStore.getState();s.initialize('one',[]);s.add('one',[note]);const version=useAnnotStore.getState().files.one.version
 s.add('one',[{...note,id:'b'}]);s.markSaved('one',version);expect(isDirty(useAnnotStore.getState().files.one)).toBe(true)
 s.initialize('protected',[],true);s.add('protected',[note]);expect(useAnnotStore.getState().files.protected.annots).toEqual([])
})

