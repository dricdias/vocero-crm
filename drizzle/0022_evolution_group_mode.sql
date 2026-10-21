CREATE TABLE "evolution_group_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"group_jid" text NOT NULL,
	"reply_mode" text DEFAULT 'mentions' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evolution_group_settings_mode_ck" CHECK ("evolution_group_settings"."reply_mode" in ('mentions', 'all'))
);
--> statement-breakpoint
ALTER TABLE "evolution_group_settings" ADD CONSTRAINT "evolution_group_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evolution_group_settings_org_group_uq" ON "evolution_group_settings" USING btree ("organization_id","group_jid");