CREATE TABLE "mcp_oauth_client" (
	"client_id" text PRIMARY KEY NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"client_name" text,
	"issued_at" timestamp DEFAULT now() NOT NULL
);
