import { Link } from 'react-router-dom'
import { Button, Empty } from '../components/ui'
export default function NotFoundPage(){return <div className="page"><Empty title="Страница не найдена" text="Проверь адрес или вернись в Dashboard." action={<Link to="/dashboard"><Button>На главную</Button></Link>}/></div>}
