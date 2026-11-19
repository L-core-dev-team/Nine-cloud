-- Isolated local demo login only: synthetic email, Session and card rate limiting.
GRANT SELECT(id,email,is_guest,closed_at,last_seen_at), INSERT(id,email,is_guest,last_seen_at), UPDATE(last_seen_at,email,is_guest)
  ON public.auth_accounts TO cards_demo_app;
GRANT SELECT(token_hash,owner_id,expires_at), INSERT(token_hash,owner_id,expires_at), DELETE
  ON public.auth_sessions TO cards_demo_app;
GRANT SELECT,INSERT,UPDATE(digest,expires_at,attempts,issued_at,window_started_at,window_count)
  ON public.auth_challenges TO cards_demo_app;
GRANT SELECT,INSERT,UPDATE(sent),DELETE ON public.auth_mail_limits TO cards_demo_app;
GRANT SELECT,INSERT,UPDATE(window_started_at,count),DELETE ON public.auth_ip_mail_limits TO cards_demo_app;
GRANT SELECT,INSERT,UPDATE(expires_at,hits) ON public.account_rate_limits TO cards_demo_app;
