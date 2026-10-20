CREATE TABLE "evolution_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"base_url" text NOT NULL,
	"token_cipher" text NOT NULL,
	"token_iv" text NOT NULL,
	"token_tag" text NOT NULL,
	"webhook_hash" text NOT NULL,
	"status" text DEFAULT 'reconnect_required' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evolution_credentials" ADD CONSTRAINT "evolution_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evolution_credentials_org_uq" ON "evolution_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evolution_credentials_hook_uq" ON "evolution_credentials" USING btree ("webhook_hash");