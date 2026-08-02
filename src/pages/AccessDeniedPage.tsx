import { ShieldX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Empty } from '../components/ui'
export default function AccessDeniedPage(){return <div className="page"><Empty title="Access denied" text="У вашей роли нет прав на этот раздел. Даже прямой запрос к API будет отклонён политиками RLS." action={<Link to="/dashboard"><Button><ShieldX/> Вернуться в Dashboard</Button></Link>}/></div>}
