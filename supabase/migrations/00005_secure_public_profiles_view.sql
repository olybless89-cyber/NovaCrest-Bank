
-- The public_profiles view is owned by the migration role (postgres), so by
-- default Postgres evaluates it with the OWNER's privileges, which bypass
-- row-level security entirely. Any authenticated (or anon, if ever granted)
-- client hitting /rest/v1/public_profiles could read every user's full_name
-- and role, ignoring the "Users view own profile" policy on public.profiles.
--
-- security_invoker makes the view run with the *querying* role's privileges
-- instead, so it now respects the same RLS policies as public.profiles
-- (a regular user only sees their own row; admins see all rows).
ALTER VIEW public.public_profiles SET (security_invoker = true);
