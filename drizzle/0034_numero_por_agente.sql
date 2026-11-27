DROP INDEX "evolution_credentials_org_uq";--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "evolution_linha_id" text;--> statement-breakpoint
ALTER TABLE "evolution_credentials" ADD COLUMN "agente_area_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_evolution_linha_id_evolution_credentials_id_fk" FOREIGN KEY ("evolution_linha_id") REFERENCES "public"."evolution_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_credentials" ADD CONSTRAINT "evolution_credentials_agente_area_id_agente_area_id_fk" FOREIGN KEY ("agente_area_id") REFERENCES "public"."agente_area"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evolution_credentials_agente_uq" ON "evolution_credentials" USING btree ("agente_area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evolution_credentials_org_uq" ON "evolution_credentials" USING btree ("organization_id") WHERE "evolution_credentials"."agente_area_id" is null;