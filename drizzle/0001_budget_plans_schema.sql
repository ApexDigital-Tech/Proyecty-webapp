-- Formalización idempotente de la tabla budget_plans y la columna budget_versions.budget_plan_id

CREATE TABLE IF NOT EXISTS "budget_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer REFERENCES "organizations"("id") ON DELETE cascade,
	"project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"period" text DEFAULT 'Anual' NOT NULL,
	"fiscal_year" integer DEFAULT 2026 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now()
);

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'budget_versions' 
        AND column_name = 'budget_plan_id'
    ) THEN
        ALTER TABLE "budget_versions" ADD COLUMN "budget_plan_id" integer REFERENCES "budget_plans"("id");
    END IF;
END $$;
