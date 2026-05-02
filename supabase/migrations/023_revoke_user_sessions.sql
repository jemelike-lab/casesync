-- Migration: Create revoke_user_sessions function
-- This function deletes all auth sessions and revokes all refresh tokens
-- for a given user. Called from server actions when deactivating or removing users.
--
-- Must be run in Supabase SQL Editor (not via Prisma migrations).

CREATE OR REPLACE FUNCTION public.revoke_user_sessions(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Delete all active sessions for the user
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
  
  -- Revoke all refresh tokens for the user
  UPDATE auth.refresh_tokens 
  SET revoked = true, updated_at = now()
  WHERE user_id = target_user_id::text 
    AND revoked = false;
END;
$$;

-- Only allow service_role to call this function
REVOKE ALL ON FUNCTION public.revoke_user_sessions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(UUID) TO service_role;
