CREATE TABLE "imdb_sync" (
	"akas" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"finished_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"names" integer NOT NULL,
	"pruned" integer NOT NULL,
	"titles" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imdb_name" ADD COLUMN "aka" boolean DEFAULT false NOT NULL;