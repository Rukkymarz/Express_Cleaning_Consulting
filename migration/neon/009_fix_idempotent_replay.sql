begin;

-- PostgreSQL does not implicitly coerce varchar columns to the text columns
-- declared by RETURNS TABLE inside a PL/pgSQL RETURN QUERY. The initial insert
-- path returned text literals, while the idempotent replay path returned the
-- underlying varchar columns and therefore failed only on a retry.
do $migration$
declare
  v_signature regprocedure := to_regprocedure(
    'app.create_callback_request(text,text,text,text,text,text,text,text,text,text,text,text,text)'
  );
  v_definition text;
  v_old_fragment text :=
    'select v_existing_receipt, false, v_request_id, st.status, qn.status';
  v_new_fragment text :=
    'select v_existing_receipt, false, v_request_id, st.status::text, qn.status::text';
begin
  if v_signature is null then
    raise exception 'app.create_callback_request is missing';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;

  if position(v_new_fragment in v_definition) > 0 then
    return;
  end if;
  if position(v_old_fragment in v_definition) = 0 then
    raise exception 'The callback replay implementation is not the expected version';
  end if;

  execute replace(v_definition, v_old_fragment, v_new_fragment);
end;
$migration$;

commit;
