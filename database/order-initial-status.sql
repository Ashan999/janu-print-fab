-- Janu Print | FAB: create the first "pending" status row automatically when an order is inserted.
-- Runs with owner rights, so customers never need INSERT permission on order_status_history.
-- Does NOT change any RLS policy, table or column.
create or replace function public.jp_order_initial_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.order_status_history h where h.order_id = new.id) then
    insert into public.order_status_history (order_id, status, note)
    values (new.id, coalesce(new.status, 'pending'), 'Order created from customer app.');
  end if;
  return new;
end;
$$;

drop trigger if exists jp_order_initial_status_trg on public.orders;
create trigger jp_order_initial_status_trg
after insert on public.orders
for each row execute function public.jp_order_initial_status();
