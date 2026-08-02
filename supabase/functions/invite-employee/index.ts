import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})

function safeSiteUrl(value: unknown) {
  const fallback='http://localhost:5173'
  try {
    const url=new URL(String(value||fallback))
    if(!['http:','https:'].includes(url.protocol))return fallback
    if(url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname))return fallback
    return url.origin
  } catch { return fallback }
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return json({error:'Method not allowed'},405)

  let createdUserId:string|null=null
  try{
    const url=Deno.env.get('SUPABASE_URL')!
    const anon=Deno.env.get('SUPABASE_ANON_KEY')!
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader=req.headers.get('Authorization')||''
    const caller=createClient(url,anon,{global:{headers:{Authorization:authHeader}}})
    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})

    const {data:{user},error:userErr}=await caller.auth.getUser()
    if(userErr||!user)return json({error:'Unauthorized'},401)

    const {data:callerProfile,error:callerProfileError}=await admin.from('profiles').select('system_role,status').eq('id',user.id).single()
    if(callerProfileError||!callerProfile||['blocked','fired'].includes(callerProfile.status))return json({error:'Access denied'},403)
    const isSuper=callerProfile.system_role==='super_admin'
    const {data:permRows}=await admin.from('user_permissions').select('allowed,permission:permissions(code)').eq('profile_id',user.id).eq('allowed',true)
    const callerPerms=(permRows||[]).map((x:any)=>x.permission?.code).filter(Boolean)
    if(!isSuper&&!callerPerms.includes('manage_employees'))return json({error:'Access denied'},403)

    const body=await req.json()
    const configuredSite=Deno.env.get('SITE_URL')
    const siteUrl=safeSiteUrl(body.site_url||req.headers.get('origin')||configuredSite)
    const email=String(body.email||'').trim().toLowerCase()
    const fullName=String(body.full_name||'').trim()
    if(!email||!fullName)return json({error:'ФИО и email обязательны'},400)
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:'Некорректный email'},400)
    const requestedSalary=Number(body.salary||0)
    if(!Number.isFinite(requestedSalary)||requestedSalary<0)return json({error:'Оклад не может быть отрицательным'},400)

    const {data:existingProfile}=await admin.from('profiles').select('id,email,full_name,status').ilike('email',email).maybeSingle()
    if(existingProfile){
      return json({ok:false,code:'email_exists',existing_user_id:existingProfile.id,error:'Сотрудник с таким email уже зарегистрирован. Если он не может войти, используйте восстановление пароля.'})
    }

    const metadata={full_name:fullName,phone:body.phone||'',job_title:body.job_title||'',department_id:body.department_id||'',started_at:body.started_at||'',comment:body.comment||''}
    const {data:invited,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${siteUrl}/reset-password`,data:metadata})
    if(inviteError){
      if(String((inviteError as any).code||'')==='email_exists'||/already been registered|already registered/i.test(inviteError.message||'')){
        return json({ok:false,code:'email_exists',error:'Этот email уже зарегистрирован. Используйте восстановление пароля вместо повторного приглашения.'})
      }
      throw inviteError
    }

    createdUserId=invited.user?.id||null
    if(!createdUserId)throw new Error('Supabase did not return invited user id')

    const {error:profileError}=await admin.from('profiles').upsert({id:createdUserId,email,full_name:fullName,phone:body.phone||null,job_title:body.job_title||null,department_id:body.department_id||null,started_at:body.started_at||null,comment:body.comment||null,system_role:'employee',status:'active'},{onConflict:'id'})
    if(profileError)throw profileError

    const canSalary=isSuper||callerPerms.includes('view_salaries')
    if(canSalary){
      const {error}=await admin.from('employee_compensation').upsert({profile_id:createdUserId,salary:requestedSalary,currency:'сом',updated_by:user.id})
      if(error)throw error
    }

    if(isSuper&&Array.isArray(body.permissions)&&body.permissions.length){
      const {data:permissions}=await admin.from('permissions').select('id,code').in('code',body.permissions)
      const rows=(permissions||[]).map((p:any)=>({profile_id:createdUserId,permission_id:p.id,allowed:true,granted_by:user.id}))
      if(rows.length){
        const {error}=await admin.from('user_permissions').upsert(rows,{onConflict:'profile_id,permission_id'})
        if(error)throw error
      }
    }

    return json({ok:true,user_id:createdUserId,redirect_to:`${siteUrl}/reset-password`})
  }catch(error){
    console.error(error)
    // An invite is not retryable if Auth user creation succeeded but CRM setup failed.
    // Delete that half-created user so the admin can safely retry the invite.
    if(createdUserId){
      try{
        const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
        await admin.auth.admin.deleteUser(createdUserId)
      }catch(cleanupError){console.error('Invite rollback failed',cleanupError)}
    }
    return json({error:error instanceof Error?error.message:'Unexpected error'},400)
  }
})
