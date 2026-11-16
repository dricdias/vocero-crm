CREATE TABLE "team_alert_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"group_jid" text,
	"group_name" text,
	"reminder_minutes" integer DEFAULT 15 NOT NULL,
	"enabled_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_alert_settings_minutes_ck" CHECK ("team_alert_settings"."reminder_minutes" between 5 and 240)
);
--> statement-breakpoint
CREATE TABLE "team_alert_state" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alerted_handoff_at" timestamp,
	"reminded_inbound_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_alert_settings" ADD CONSTRAINT "team_alert_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_alert_state" ADD CONSTRAINT "team_alert_state_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_alert_state" ADD CONSTRAINT "team_alert_state_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;