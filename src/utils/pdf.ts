import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { Profile, Project, Task, WorkLog } from '../types/domain'
import { dateRu, money } from '../lib/format'

async function getPdfMake(){
  const pdfMakeModule=await import('pdfmake/build/pdfmake')
  const fontsModule=await import('pdfmake/build/vfs_fonts')
  const pdfMake=(pdfMakeModule as any).default || pdfMakeModule
  const fonts=(fontsModule as any).default || fontsModule
  if(fonts.pdfMake?.vfs) pdfMake.vfs=fonts.pdfMake.vfs
  else if(fonts.vfs) pdfMake.vfs=fonts.vfs
  return pdfMake
}

const baseStyles={
  header:{fontSize:20,bold:true,color:'#0b1020',margin:[0,0,0,4]},
  sub:{fontSize:10,color:'#64748b',margin:[0,0,0,14]},
  h2:{fontSize:13,bold:true,color:'#0f9f6e',margin:[0,14,0,7]},
  small:{fontSize:8,color:'#64748b'},
}

export async function downloadEmployeeReport(opts:{profile:Profile;periodLabel:string;salary?:number|null;projects:Project[];tasks:Task[];logs:WorkLog[]}){
  const done=opts.tasks.filter(t=>t.status==='completed').length; const late=opts.tasks.filter(t=>t.due_at&&new Date(t.due_at)<new Date()&&!['completed','cancelled'].includes(t.status)).length
  const doc:TDocumentDefinitions={pageSize:'A4',pageMargins:[42,46,42,46],defaultStyle:{font:'Roboto',fontSize:9,color:'#111827'},styles:baseStyles as any,content:[
    {text:'SMM KADR',style:'header'},{text:`Отчёт сотрудника · ${opts.periodLabel}`,style:'sub'},
    {table:{widths:['35%','65%'],body:[['Сотрудник',opts.profile.full_name],['Должность',opts.profile.job_title||'—'],['Отдел',opts.profile.department?.name||'—'],['Оклад',opts.salary==null?'Доступ ограничен':money(opts.salary)],['Проектов',String(opts.projects.length)],['Задач',String(opts.tasks.length)],['Выполнено',String(done)],['Просрочено',String(late)],['Процент выполнения',`${opts.tasks.length?Math.round(done/opts.tasks.length*100):0}%`]]},layout:'lightHorizontalLines'},
    {text:'Проекты',style:'h2'},...(opts.projects.length?opts.projects.map((p,i)=>({text:`${i+1}. ${p.name} — ${dateRu(p.start_date)}–${dateRu(p.end_date)}`})):[{text:'Нет проектов за период',style:'small'}]),
    {text:'Задачи',style:'h2'},{table:{headerRows:1,widths:['*','24%','20%'],body:[['Задача','Проект','Статус'],...opts.tasks.map(t=>[t.title,t.project?.name||'—',t.status==='completed'?'Выполнена':t.status==='review'?'На проверке':t.status==='in_progress'?'В работе':t.status==='new'?'Новая':'Отменена'])]},layout:'lightHorizontalLines'},
    {text:'Выполненные работы',style:'h2'},...(opts.logs.length?opts.logs.map(l=>({text:`${dateRu(l.work_date)} · ${l.work_type} · ${l.project?.name||'Без проекта'}\n${l.description}`,margin:[0,0,0,6]})):[{text:'Рабочих записей нет',style:'small'}]),
    {text:`Сформировано: ${new Date().toLocaleString('ru-RU')}`,style:'small',margin:[0,18,0,0]},
  ]}
  const pdfMake=await getPdfMake();pdfMake.createPdf(doc).download(`SMM_KADR_${opts.profile.full_name.replace(/\s+/g,'_')}_${opts.periodLabel.replace(/\s+/g,'_')}.pdf`)
}

export async function downloadCompanyReport(opts:{periodLabel:string;employees:Profile[];projects:Project[];tasks:Task[];logs:WorkLog[]}){
  const completedProjects=opts.projects.filter(p=>p.status==='completed').length;const done=opts.tasks.filter(t=>t.status==='completed').length;const late=opts.tasks.filter(t=>t.due_at&&new Date(t.due_at)<new Date()&&!['completed','cancelled'].includes(t.status)).length
  const rows=opts.employees.map(e=>{const et=opts.tasks.filter(t=>t.assignee_id===e.id),ed=et.filter(t=>t.status==='completed').length;return[e.full_name,e.job_title||'—',String(et.length),String(ed),`${et.length?Math.round(ed/et.length*100):0}%`]})
  const doc:TDocumentDefinitions={pageSize:'A4',pageOrientation:'landscape',pageMargins:[38,42,38,42],defaultStyle:{font:'Roboto',fontSize:9,color:'#111827'},styles:baseStyles as any,content:[
    {text:'SMM KADR',style:'header'},{text:`Общий отчёт компании · ${opts.periodLabel}`,style:'sub'},
    {columns:[{text:`Проектов: ${opts.projects.length}`},{text:`Завершено: ${completedProjects}`},{text:`Задач выполнено: ${done}`},{text:`Просрочено: ${late}`},{text:`Рабочих записей: ${opts.logs.length}`}],columnGap:12},
    {text:'Результат команды',style:'h2'},{table:{headerRows:1,widths:['*','*','14%','14%','14%'],body:[['Сотрудник','Должность','Задач','Выполнено','Процент'],...rows]},layout:'lightHorizontalLines'},
    {text:'Проекты',style:'h2'},{table:{headerRows:1,widths:['*','20%','16%','16%'],body:[['Проект','Клиент','Начало','Окончание'],...opts.projects.map(p=>[p.name,p.client_name||'—',dateRu(p.start_date),dateRu(p.end_date)])]},layout:'lightHorizontalLines'},
    {text:`Сформировано: ${new Date().toLocaleString('ru-RU')}`,style:'small',margin:[0,18,0,0]},
  ]};const pdfMake=await getPdfMake();pdfMake.createPdf(doc).download(`SMM_KADR_Company_Report_${opts.periodLabel.replace(/\s+/g,'_')}.pdf`)
}
