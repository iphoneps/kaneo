-- Databases that ran the iphoneps fork's 0035_persist_mcp_oauth_clients keep
-- registered MCP OAuth clients in "mcp_oauth_client". Copy them into
-- "mcp_oauth_state", where upstream stores clients, so connected MCP clients
-- keep their client_id. The old table is left untouched. No-op when it does
-- not exist, and safe to run again.
DO $$
BEGIN
	IF to_regclass('public.mcp_oauth_client') IS NOT NULL THEN
		INSERT INTO "mcp_oauth_state" ("id", "kind", "key", "payload", "expires_at")
		SELECT
			replace(gen_random_uuid()::text, '-', ''),
			'client',
			c."client_id",
			jsonb_strip_nulls(jsonb_build_object(
				'clientId', c."client_id",
				'redirectUris', c."redirect_uris",
				'clientName', c."client_name",
				'issuedAt', floor(extract(epoch FROM c."issued_at"))::bigint
			)),
			-- Same 30-day client TTL as registerClient(), counted from now.
			(now() AT TIME ZONE 'utc') + interval '30 days'
		FROM "mcp_oauth_client" AS c
		ON CONFLICT ("kind", "key") DO NOTHING;
	END IF;
END $$;
