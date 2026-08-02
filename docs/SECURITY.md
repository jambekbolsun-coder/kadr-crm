# Security notes

## Главные гарантии

1. **Нет открытой регистрации.** В UI только login / recovery.
2. **Admin invitation server-side.** `inviteUserByEmail` вызывается только в Edge Function.
3. **Service role отсутствует во frontend.** Vite получает только public/publishable anon key.
4. **RLS — главный барьер.** Скрытие пунктов sidebar не считается защитой.
5. **Оклады изолированы.** `employee_compensation` читается владельцем записи либо администратором с `View Salaries`.
6. **Стоимость проектов изолирована.** `project_finance` доступна только `Manage Finance`.
7. **Employee tasks.** Employee может менять рабочие поля/статус только в разрешённой цепочке; trigger блокирует изменение назначения, дедлайна, приоритета и описания.
8. **Admin permissions.** Обычный ADMIN получает только права, явно назначенные SUPER ADMIN.
9. **Role escalation.** Изменять `system_role` может только SUPER ADMIN. Последнего SUPER ADMIN нельзя понизить.
10. **Blocking.** blocked/fired аккаунт банится через Auth Admin API; `account_enabled()` дополнительно закрывает RLS при ещё живом JWT.
11. **Private files.** Storage buckets private; UI получает временный signed URL.
12. **Soft archive.** Проекты/пакеты не уничтожают рабочую историю обычным действием.

## Что никогда нельзя делать

- Не добавлять `SUPABASE_SERVICE_ROLE_KEY` в `.env`, который начинается с `VITE_`.
- Не коммитить реальные `.env`, SMTP passwords и secret keys.
- Не делать public bucket для рабочих файлов без отдельного решения по рискам.
- Не отключать RLS ради «быстрого исправления» ошибки.
- Не выдавать `Manage Finance` автоматически всем Admin.

## Production hardening

- Подключить собственный SMTP.
- Включить MFA для SUPER ADMIN, когда это будет организационно удобно.
- Ограничить Redirect URLs только вашими доменами.
- Настроить резервное копирование БД.
- Периодически просматривать Activity Log и Supabase Auth logs.
- Для особо чувствительных файлов можно добавить дополнительный server-side approval вместо обычного signed URL.
