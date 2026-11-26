CREATE TABLE "agente_area" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"nome" text NOT NULL,
	"assunto" text NOT NULL,
	"tom" text,
	"instrucoes" text,
	"regras_escalonamento" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agente_transferencia" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"de_nome" text NOT NULL,
	"para_nome" text NOT NULL,
	"origem" text NOT NULL,
	"motivo" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "agente_area_id" text;--> statement-breakpoint
ALTER TABLE "agente_area" ADD CONSTRAINT "agente_area_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agente_transferencia" ADD CONSTRAINT "agente_transferencia_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agente_transferencia" ADD CONSTRAINT "agente_transferencia_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agente_area_org_nome_uq" ON "agente_area" USING btree ("organization_id","nome");--> statement-breakpoint
CREATE INDEX "agente_transferencia_conv_idx" ON "agente_transferencia" USING btree ("organization_id","conversation_id");--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_agente_area_id_agente_area_id_fk" FOREIGN KEY ("agente_area_id") REFERENCES "public"."agente_area"("id") ON DELETE set null ON UPDATE no action;