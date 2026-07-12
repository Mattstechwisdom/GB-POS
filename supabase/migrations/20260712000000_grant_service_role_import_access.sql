-- Allow trusted server-side import/admin scripts to use the cloud tables.
-- The service_role key must never be shipped in the desktop app or frontend.

grant usage on schema public to service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;

alter default privileges in schema public
  grant all privileges on sequences to service_role;
