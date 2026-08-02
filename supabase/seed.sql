-- SMM KADR CRM initial data
-- Safe to run repeatedly after schema.sql.

insert into public.permissions(code,label,description) values
('manage_employees','Manage Employees','Создание, редактирование, блокировка сотрудников'),
('manage_projects','Manage Projects','Создание и изменение проектов и состава команды'),
('manage_tasks','Manage Tasks','Создание, назначение и проверка задач'),
('manage_packages','Manage Packages','Управление шаблонами пакетов'),
('view_salaries','View Salaries','Просмотр и изменение окладов'),
('manage_finance','Manage Finance','Оплаты клиентов, доходы и расходы'),
('view_reports','View Reports','Общие и персональные отчёты'),
('manage_settings','Manage Settings','Отделы и настройки компании'),
('view_activity_log','View Activity Log','Журнал действий')
on conflict(code) do update set label=excluded.label,description=excluded.description;

insert into public.departments(name,description) values
('Управление','Владелец, администраторы и управляющие'),
('Маркетинг','Маркетологи, стратеги и сценаристы'),
('SMM','SMM-специалисты'),
('Продакшн','Мобилографы, видеографы, монтажёры и амбассадоры'),
('Дизайн','Графические и motion-дизайнеры'),
('Реклама','Таргетологи и специалисты по рекламе'),
('Продажи','Менеджеры и РОП'),
('IT и автоматизация','Разработчики, CRM и AI automation специалисты')
on conflict(name) do update set description=excluded.description,active=true;

insert into public.services(name,description,sort_order) values
('SMM','Ведение социальных сетей, контент и упаковка',10),
('Target','Настройка, запуск и оптимизация рекламы',20),
('Mobilography','Мобильная видеосъёмка',30),
('Videography','Профессиональная видеосъёмка',40),
('Editing','Монтаж видео',50),
('Design','Графический дизайн и визуальная система',60),
('Marketing','Стратегия, анализ продукта, аудитории и сценарии',70),
('Ambassador','Работа амбассадоров в рекламных роликах',80),
('Web Development','Сайты и веб-системы',90),
('CRM','Внедрение CRM и управленческих систем',100),
('AI Manager','ИИ-менеджеры и чат-боты',110),
('Automation','Автоматизация бизнес-процессов',120)
on conflict(name) do update set description=excluded.description,sort_order=excluded.sort_order,active=true;

-- Existing packages migrated from SMM_R. The free website line is represented as a bonus.
insert into public.packages(name,slug,package_type,price,duration_days,description,active)
values
('Стандарт','standard','monthly',37990,30,'Базовый комплексный пакет для системного ведения и продвижения.',true),
('Рекламный','advertising','monthly',50000,30,'Пакет с усиленным акцентом на рекламные ролики и продвижение.',true),
('Премиум','premium','monthly',75000,30,'Максимальный месячный пакет с расширенным объёмом контента.',true),
('Полумесячный проект','half-custom','half',0,15,'Гибкий 15-дневный формат. Цена и объём фиксируются по договору.',true),
('Запуск','launch','oneoff',15000,7,'Разовый запуск для теста подачи, рекламы или нового направления.',true),
('Запуск продакшн','production','oneoff',18000,7,'Разовый ролик с профессиональной камерой и усиленным продакшном.',true)
on conflict(slug) do update set name=excluded.name,package_type=excluded.package_type,price=excluded.price,duration_days=excluded.duration_days,description=excluded.description,active=true,archived_at=null;

-- Replace package composition deterministically on repeat runs.
delete from public.package_items where package_id in (select id from public.packages where slug in ('standard','advertising','premium','half-custom','launch','production'));
delete from public.package_bonuses where package_id in (select id from public.packages where slug in ('standard','advertising','premium','half-custom','launch','production'));

with p as (select id,slug from public.packages)
insert into public.package_items(package_id,label,sort_order)
select p.id,x.label,x.ord from p join (values
('standard','4 видео',10),('standard','4 поста',20),('standard','Упаковка аккаунта',30),('standard','Маркетинговая стратегия',40),('standard','Анализ продукта',50),('standard','Съёмка и монтаж',60),('standard','SMM',70),('standard','Таргетолог',80),('standard','Дизайнер',90),
('advertising','6 видео',10),('advertising','Упаковка аккаунта',20),('advertising','Маркетинговая стратегия',30),('advertising','Анализ продукта',40),('advertising','Съёмка и монтаж',50),('advertising','SMM',60),('advertising','Таргетолог',70),('advertising','Дизайнер',80),
('premium','8 видео',10),('premium','8 постов',20),('premium','Упаковка аккаунта',30),('premium','Маркетинговая стратегия',40),('premium','Анализ продукта',50),('premium','Съёмка и монтаж',60),('premium','SMM',70),('premium','Таргетолог',80),('premium','Дизайнер',90),
('half-custom','Маркетинговая подготовка',10),('half-custom','Контент на 15 дней',20),('half-custom','Съёмка и монтаж',30),('half-custom','SMM',40),('half-custom','Дизайн',50),('half-custom','Таргет',60),
('launch','1 видео',10),('launch','Амбассадор',20),('launch','Мобилограф в высоком качестве',30),('launch','Упаковка профиля',40),('launch','Продающий сценарий',50),('launch','Профессиональный монтаж',60),
('production','1 видео',10),('production','Съёмка на профессиональную камеру',20),('production','Упаковка профиля',30),('production','Продающий сценарий',40),('production','Профессиональный монтаж',50)
) as x(slug,label,ord) on p.slug=x.slug;

with p as (select id,slug from public.packages)
insert into public.package_bonuses(package_id,label,sort_order)
select p.id,x.label,x.ord from p join (values
('standard','Бесплатный сайт от SMM_KADR',10),
('advertising','Бесплатный сайт от SMM_KADR',10),
('premium','Бесплатный сайт от SMM_KADR',10),
('half-custom','Бесплатный сайт — если предусмотрено договором',10)
) as x(slug,label,ord) on p.slug=x.slug;

insert into public.company_settings(key,value,description) values
('company','{"name":"SMM_KADR","subtitle":"MEDIA HOLDING · BISHKEK","description":"Маркетинг, SMM, продакшн, реклама и IT в одной системе.","goal":"Держать сотрудников, проекты, задачи, деньги и отчётность в одном месте.","phone":"+996 503 030 018","instagram":"@smm_kadr","workHours":"10:00–18:30"}'::jsonb,'Основная информация о компании'),
('currency','{"code":"KGS","label":"сом"}'::jsonb,'Валюта интерфейса'),
('workload_thresholds','{"normalMax":3,"mediumMax":6,"highFrom":7}'::jsonb,'Пороговые значения нагрузки')
on conflict(key) do update set value=excluded.value,description=excluded.description;
