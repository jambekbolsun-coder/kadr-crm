import { Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { Button } from './ui'

export function StorageLink({bucket,path,label}:{bucket:'avatars'|'project-files'|'task-files'|'work-files';path:string;label?:string}){
  const {toast}=useToast()
  async function open(){
    const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path,120)
    if(error||!data?.signedUrl)return toast(error?.message||'Не удалось открыть файл','error')
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }
  return <Button kind="ghost" small onClick={()=>void open()} title="Открыть файл"><Download/>{label||'Открыть'}</Button>
}
