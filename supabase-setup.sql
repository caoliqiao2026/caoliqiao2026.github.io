-- ============================================================
-- 拼豆 · 曹丽翘个人主页 · 留言板云端后端一键初始化
-- ------------------------------------------------------------
-- 使用方法：
--   1. 登录 https://supabase.com → 打开你的项目
--   2. 左侧菜单选「SQL Editor」→ 「New query」
--   3. 把本文件全部内容粘贴进去
--   4. ⚠️ 先把下方「REPLACE_WITH_YOUR_PASSWORD」换成你的管理密码
--      （建议 8 位以上，别用 QQ / 微信密码）
--   5. 点「RUN」执行，提示 Success 即完成
-- 本脚本可重复执行（幂等），改密码后重跑一遍即可生效。
-- ============================================================

-- pgcrypto 提供 SHA-256 摘要（digest）
create extension if not exists pgcrypto;

-- ---------- 留言表 ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null default '匿名',
  text text not null,
  created_at timestamptz not null default now(),
  constraint text_len check (char_length(text) between 1 and 200),
  constraint name_len check (char_length(name) between 1 and 20)
);

-- ---------- 管理设置表（不对匿名开放读写） ----------
create table if not exists public.admin_settings (
  key text primary key,
  value text not null
);

-- ---------- 行级安全（RLS） ----------
-- messages：所有人可读（SELECT）、可留言（INSERT）；没有 UPDATE / DELETE
-- 策略 —— 匿名访客在数据库层面就无法修改或删除任何留言。
alter table public.messages enable row level security;

drop policy if exists "public read messages" on public.messages;
create policy "public read messages"
  on public.messages for select
  using (true);

drop policy if exists "public insert messages" on public.messages;
create policy "public insert messages"
  on public.messages for insert
  with check (true);

-- admin_settings：完全不给匿名策略（任何直接 SELECT / 修改都被 RLS 拒绝），
-- 只能通过下面两个 SECURITY DEFINER 函数按需访问。
alter table public.admin_settings enable row level security;

-- ---------- 管理函数（SECURITY DEFINER，绕过 RLS 但自身做密码校验） ----------
create or replace function public.verify_admin_pass(pass_hash text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_settings
    where key = 'admin_pass_sha256' and value = pass_hash
  );
$$;

create or replace function public.delete_message(msg_id uuid, pass_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_admin_pass(pass_hash) then
    return false;
  end if;
  delete from messages where id = msg_id;
  return found;
end;
$$;

-- ---------- 管理密码（⚠️ 先替换占位符再执行！） ----------
insert into public.admin_settings (key, value)
values ('admin_pass_sha256', encode(digest('REPLACE_WITH_YOUR_PASSWORD', 'sha256'), 'hex'))
on conflict (key) do update
  set value = excluded.value;

-- ---------- 完成 ----------
-- 提示：该 anon key 配合上述 RLS 是安全的（Supabase 官方设计如此）。
-- 管理密码仅以 SHA-256 哈希形式存于 admin_settings 表，
-- 删除留言必须通过 delete_message 函数在服务端二次校验。
