import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})
const validStatuses=['active','vacation','inactive','fired','blocked']
const validRoles=['employee','admin','super_admin']

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return json({error:'Method not allowed'},405)

  const url=Deno.env.get('SUPABASE_URL')!
  const anon=Deno.env.get('SUPABASE_ANON_KEY')!
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token=req.headers.get('Authorization')||''
  const caller=createClient(url,anon,{global:{headers:{Authorization:token}}})
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})

  let original:any=null
  let originalComp:any=null
  let originalPermissions:any[]=[]
  let authChanged=false
  let salaryTouched=false
  let permissionsTouched=false

  try{
    const {data:{user},error:userError}=await caller.auth.getUser()
    if(userError||!user)return json({error:'Unauthorized'},401)

    const {data:cp,error:cpError}=await caller.from('profiles').select('system_role,status').eq('id',user.id).single()
    if(cpError||!cp||['blocked','fired'].includes(cp.status))return json({error:'Access denied'},403)
    const {data:pr,error:prError}=await caller.from('user_permissions').select('allowed,permission:permissions(code)').eq('profile_id',user.id).eq('allowed',true)
    if(prError&&cp.system_role!=='super_admin')return json({error:'Не удалось проверить права доступа'},403)
    const callerPerms=(pr||[]).map((x:any)=>x.permission?.code).filter(Boolean)
    const isSuper=cp.system_role==='super_admin'
    if(!isSuper&&!callerPerms.includes('manage_employees'))return json({error:'Access denied'},403)

    const body=await req.json()
    const userId=String(body.userId||'')
    const status=String(body.status||'')
    const profile=(body.profile&&typeof body.profile==='object')?body.profile:null
    const requestedRole=String(profile?.system_role||'')
    if(!userId||!validStatuses.includes(status))return json({error:'Корректные userId и status обязательны'},400)
    if(profile&&requestedRole&&!validRoles.includes(requestedRole))return json({error:'Некорректная системная роль'},400)
    if(userId===user.id&&['blocked','fired'].includes(status))return json({error:'Нельзя заблокировать или уволить собственный аккаунт'},400)

    const {data:target,error:targetError}=await caller.from('profiles').select('*').eq('id',userId).single()
    if(targetError||!target)return json({error:'Сотрудник не найден'},404)
    original=target

    if(target.system_role==='super_admin'&&!isSuper)return json({error:'Только SUPER ADMIN может менять SUPER ADMIN'},403)
    if(profile&&requestedRole&&requestedRole!==target.system_role&&!isSuper)return json({error:'Только SUPER ADMIN может менять системную роль'},403)
    if(userId===user.id&&profile&&requestedRole&&requestedRole!==target.system_role){
      return json({error:'Нельзя изменять собственную системную роль. Это должен сделать другой SUPER ADMIN.'},400)
    }

    const nextRole=profile&&requestedRole?requestedRole:target.system_role
    const disablingSuper=target.system_role==='super_admin'&&(!['active','vacation','inactive'].includes(status)||nextRole!=='super_admin')
    if(disablingSuper){
      const {data:supers,error:supersError}=await caller.from('profiles').select('id,status,system_role').eq('system_role','super_admin')
      if(supersError)throw supersError
      const otherActive=(supers||[]).filter((x:any)=>x.id!==userId&&!['blocked','fired'].includes(x.status)).length
      if(otherActive<1)return json({error:'Нельзя отключить или понизить последнего активного SUPER ADMIN'},400)
    }

    if(body.salary!==undefined&&body.salary!==null){
      const salary=Number(body.salary)
      if(!Number.isFinite(salary)||salary<0)return json({error:'Оклад не может быть отрицательным'},400)
      if(!isSuper&&!callerPerms.includes('view_salaries'))return json({error:'Нет права изменять оклад'},403)
      const {data:comp,error:compError}=await caller.from('employee_compensation').select('*').eq('profile_id',userId).maybeSingle()
      if(compError)throw compError
      originalComp=comp||null
      salaryTouched=true
    }
    if(Array.isArray(body.permissions)){
      if(!isSuper)return json({error:'Только SUPER ADMIN может изменять права администратора'},403)
      const {data:permRows,error:permRowsError}=await caller.from('user_permissions').select('*').eq('profile_id',userId)
      if(permRowsError)throw permRowsError
      originalPermissions=permRows||[]
      permissionsTouched=true
    }

    const banned=['blocked','fired'].includes(status)
    const wasBanned=['blocked','fired'].includes(target.status)
    if(banned!==wasBanned){
      const {error:authError}=await admin.auth.admin.updateUserById(userId,{ban_duration:banned?'876000h':'none'})
      if(authError)throw authError
      authChanged=true
    }

    if(profile){
      const patch:any={
        full_name:String(profile.full_name||'').trim(),
        phone:String(profile.phone||'').trim()||null,
        job_title:String(profile.job_title||'').trim()||null,
        department_id:profile.department_id||null,
        started_at:profile.started_at||null,
        comment:String(profile.comment||'').trim()||null,
        avatar_path:profile.avatar_path||null,
        status,
      }
      if(!patch.full_name)throw new Error('ФИО обязательно')
      if(isSuper&&requestedRole)patch.system_role=requestedRole
      const {error:profileError}=await caller.from('profiles').update(patch).eq('id',userId)
      if(profileError)throw profileError
    }else{
      const {error:profileError}=await caller.from('profiles').update({status}).eq('id',userId)
      if(profileError)throw profileError
    }

    if(salaryTouched){
      const {error}=await caller.from('employee_compensation').upsert({profile_id:userId,salary:Number(body.salary),currency:'сом',updated_by:user.id})
      if(error)throw error
    }

    if(permissionsTouched){
      const {error:delError}=await caller.from('user_permissions').delete().eq('profile_id',userId)
      if(delError)throw delError
      if(nextRole==='admin'&&body.permissions.length){
        const uniqueCodes=[...new Set(body.permissions.map((x:any)=>String(x)))]
        const {data:permissions,error:permissionError}=await caller.from('permissions').select('id,code').in('code',uniqueCodes)
        if(permissionError)throw permissionError
        const rows=(permissions||[]).map((p:any)=>({profile_id:userId,permission_id:p.id,allowed:true,granted_by:user.id}))
        if(rows.length){
          const {error}=await caller.from('user_permissions').insert(rows)
          if(error)throw error
        }
      }
    }

    return json({ok:true,banned,status,role:nextRole})
  }catch(error){
    console.error(error)
    if(original?.id){
      try{
        if(authChanged){
          await admin.auth.admin.updateUserById(original.id,{ban_duration:['blocked','fired'].includes(original.status)?'876000h':'none'})
        }
        const restore={...original}
        delete restore.id
        delete restore.email
        delete restore.created_at
        delete restore.updated_at
        await caller.from('profiles').update(restore).eq('id',original.id)
        if(salaryTouched){
          if(originalComp){
            const c={...originalComp};delete c.created_at;delete c.updated_at
            await caller.from('employee_compensation').upsert(c)
          }else{
            await caller.from('employee_compensation').delete().eq('profile_id',original.id)
          }
        }
        if(permissionsTouched){
          await caller.from('user_permissions').delete().eq('profile_id',original.id)
          if(originalPermissions.length)await caller.from('user_permissions').insert(originalPermissions)
        }
      }catch(rollbackError){console.error('Employee rollback failed',rollbackError)}
    }
    return json({error:error instanceof Error?error.message:'Unexpected error'},400)
  }
})
