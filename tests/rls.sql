-- =============================================================================
-- Pruebas de Row Level Security y de las restricciones del esquema.
-- Se ejecutan sobre una base de datos que ya tiene bootstrap-auth.sql y
-- database.sql aplicados. Cualquier fallo lanza una excepcion y detiene psql.
-- =============================================================================
\set ON_ERROR_STOP on

-- Dos usuarios de prueba.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@ejemplo.test', '{"display_name":"Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'bruno@ejemplo.test', '{"display_name":"Bruno"}');

-- 1. El disparador crea el perfil automaticamente con el nombre del registro.
do $$
begin
  if (select count(*) from public.profiles) <> 2 then
    raise exception 'FALLO: el disparador no ha creado los dos perfiles';
  end if;
  if (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'Ana' then
    raise exception 'FALLO: el perfil no ha recogido display_name';
  end if;
  raise notice 'OK 1: perfiles creados automaticamente';
end
$$;

-- 2. Ana inserta datos propios (user_id sale de auth.uid() por defecto).
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.subjects (name, color, position) values ('Matemáticas', 'indigo', 0);
insert into public.subjects (name, color, position) values ('Historia', 'coral', 1);

insert into public.schedule_items (kind, subject_id, weekday, start_time, end_time, room)
  select 'class', id, 0, '08:00', '09:00', 'B12' from public.subjects where name = 'Matemáticas';
insert into public.schedule_items (kind, title, event_date, status)
  values ('assignment', 'Trabajo de historia', current_date + 3, 'pending');

insert into public.grades (subject_id, title, score, weight)
  select id, 'Examen tema 1', 8.5, 40 from public.subjects where name = 'Matemáticas';
insert into public.grades (subject_id, title, score, weight)
  select id, 'Examen tema 2', 6, 60 from public.subjects where name = 'Matemáticas';

insert into public.habits (name, weekdays, color) values ('Leer', '{0,1,2,3,4}', 'lavanda');
insert into public.habit_completions (habit_id, completed_on)
  select id, current_date from public.habits where name = 'Leer';

insert into public.journal_entries (entry_date, title, content) values (current_date, 'Hoy', 'Contenido privado de Ana');
insert into public.books (title, author, status) values ('Un libro', 'Alguien', 'leyendo');
insert into public.focus_sessions (started_at, ended_at, focus_seconds) values (now() - interval '25 minutes', now(), 1500);
insert into public.countdowns (name, target_at, has_time) values ('Selectividad', now() + interval '42 days', false);

do $$
begin
  if (select count(*) from public.subjects) <> 2 then raise exception 'FALLO: Ana no ve sus asignaturas'; end if;
  if (select count(*) from public.grades) <> 2 then raise exception 'FALLO: Ana no ve sus notas'; end if;
  if (select user_id from public.subjects limit 1) <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'FALLO: user_id por defecto incorrecto';
  end if;
  raise notice 'OK 2: Ana crea y lee sus propios datos';
end
$$;

-- 3. La media ponderada sale como espera la aplicacion: (8,5*40 + 6*60)/100 = 7
do $$
declare
  media numeric;
begin
  select sum(score * weight) / sum(weight) into media from public.grades;
  if round(media, 2) <> 7.00 then
    raise exception 'FALLO: media ponderada inesperada (%)', media;
  end if;
  raise notice 'OK 3: media ponderada correcta (%)', round(media, 2);
end
$$;

-- 4. Bruno no ve absolutamente nada de Ana.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$
declare
  total integer;
begin
  select (select count(*) from public.subjects) + (select count(*) from public.grades)
       + (select count(*) from public.schedule_items) + (select count(*) from public.habits)
       + (select count(*) from public.habit_completions) + (select count(*) from public.journal_entries)
       + (select count(*) from public.books) + (select count(*) from public.focus_sessions)
       + (select count(*) from public.countdowns)
  into total;
  if total <> 0 then raise exception 'FALLO: Bruno ve % filas de Ana', total; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FALLO: Bruno ve perfiles ajenos'; end if;
  raise notice 'OK 4: Bruno no ve ningun dato de Ana';
end
$$;

-- 5. Bruno no puede modificar ni borrar lo de Ana.
do $$
declare
  afectadas integer;
begin
  update public.subjects set name = 'Secuestrada';
  get diagnostics afectadas = row_count;
  if afectadas <> 0 then raise exception 'FALLO: Bruno ha modificado % filas ajenas', afectadas; end if;

  delete from public.journal_entries;
  get diagnostics afectadas = row_count;
  if afectadas <> 0 then raise exception 'FALLO: Bruno ha borrado % entradas ajenas', afectadas; end if;
  raise notice 'OK 5: Bruno no puede modificar ni borrar datos de Ana';
end
$$;

-- 6. Bruno no puede insertar filas a nombre de Ana.
do $$
begin
  begin
    insert into public.subjects (user_id, name, color)
      values ('11111111-1111-1111-1111-111111111111', 'Suplantada', 'indigo');
    raise exception 'FALLO: se ha permitido insertar con user_id ajeno';
  exception
    when insufficient_privilege then
      raise notice 'OK 6: insertar con user_id ajeno queda bloqueado por RLS';
  end;
end
$$;

-- 7. Una sesion sin iniciar (rol anon) no ve nada.
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare
  total integer;
begin
  begin
    select count(*) into total from public.subjects;
  exception
    when insufficient_privilege then
      raise notice 'OK 7: el rol anon no tiene ni permiso de lectura';
      return;
  end;
  if total <> 0 then raise exception 'FALLO: anon ve % filas', total; end if;
  raise notice 'OK 7: el rol anon no ve ninguna fila';
end
$$;

-- 8. Restricciones de datos.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
begin
  begin
    insert into public.grades (subject_id, title, score, weight)
      select id, 'Nota imposible', 11, 50 from public.subjects limit 1;
    raise exception 'FALLO: se ha aceptado una nota mayor que 10';
  exception when check_violation then raise notice 'OK 8a: nota fuera de 0-10 rechazada';
  end;

  begin
    insert into public.schedule_items (kind, weekday, start_time, end_time)
      values ('class', 0, '10:00', '09:00');
    raise exception 'FALLO: se ha aceptado una clase que termina antes de empezar';
  exception when check_violation then raise notice 'OK 8b: clase con horas invertidas rechazada';
  end;

  begin
    insert into public.schedule_items (kind, title, event_date) values ('exam', '', current_date);
    raise exception 'FALLO: se ha aceptado un examen sin titulo';
  exception when check_violation then raise notice 'OK 8c: examen sin titulo rechazado';
  end;

  begin
    insert into public.habits (name, weekdays) values ('Sin días', '{}');
    raise exception 'FALLO: se ha aceptado un habito sin dias';
  exception when check_violation then raise notice 'OK 8d: habito sin dias rechazado';
  end;

  begin
    insert into public.habit_completions (habit_id, completed_on)
      select id, current_date from public.habits where name = 'Leer';
    raise exception 'FALLO: se ha aceptado un dia completado duplicado';
  exception when unique_violation then raise notice 'OK 8e: dia completado duplicado rechazado';
  end;
end
$$;

-- 9. Al borrar una asignatura, sus notas caen en cascada y las clases se quedan sin asignatura.
do $$
declare
  restantes integer;
  huerfanas integer;
begin
  delete from public.subjects where name = 'Matemáticas';
  select count(*) into restantes from public.grades;
  if restantes <> 0 then raise exception 'FALLO: quedan % notas tras borrar la asignatura', restantes; end if;
  select count(*) into huerfanas from public.schedule_items where kind = 'class' and subject_id is null;
  if huerfanas <> 1 then raise exception 'FALLO: la clase no ha quedado sin asignatura'; end if;
  raise notice 'OK 9: cascada de notas y clases sin asignatura';
end
$$;

-- 10. delete_account borra al usuario y todo lo suyo.
do $$
declare
  quedan integer;
begin
  perform public.delete_account();
  set local role postgres;
  select (select count(*) from auth.users where id = '11111111-1111-1111-1111-111111111111')
       + (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111')
       + (select count(*) from public.schedule_items)
       + (select count(*) from public.books)
       + (select count(*) from public.countdowns)
  into quedan;
  if quedan <> 0 then raise exception 'FALLO: quedan % filas de la cuenta eliminada', quedan; end if;
  raise notice 'OK 10: delete_account elimina la cuenta y sus datos en cascada';
end
$$;

reset role;
select 'TODAS LAS PRUEBAS DE RLS HAN PASADO' as resultado;
