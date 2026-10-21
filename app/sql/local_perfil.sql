insert into parques.perfiles (user_id, nombre, rol) values ('00000000-0000-0000-0000-000000000001', 'Admin', 'admin')
on conflict (user_id) do nothing;
