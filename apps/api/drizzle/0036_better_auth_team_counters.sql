ALTER TABLE "team" ADD COLUMN "member_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN "membership_key" text;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_membership_key_unique" UNIQUE("membership_key");--> statement-breakpoint
UPDATE "team" SET "member_count" = "counts"."member_count" FROM (SELECT "team_id", count(*)::integer AS "member_count" FROM "team_member" GROUP BY "team_id") AS "counts" WHERE "counts"."team_id" = "team"."id";
