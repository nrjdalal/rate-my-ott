CREATE TABLE "imdb_name" (
	"key" text NOT NULL,
	"title_id" text NOT NULL,
	CONSTRAINT "imdb_name_key_title_id_pk" PRIMARY KEY("key","title_id")
);
--> statement-breakpoint
CREATE TABLE "imdb_title" (
	"end_year" integer,
	"id" text PRIMARY KEY NOT NULL,
	"original_title" text NOT NULL,
	"primary_title" text NOT NULL,
	"rating" double precision,
	"runtime" integer,
	"start_year" integer,
	"title_type" text NOT NULL,
	"votes" integer
);
--> statement-breakpoint
ALTER TABLE "imdb_name" ADD CONSTRAINT "imdb_name_title_id_imdb_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."imdb_title"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imdb_name_title_id_idx" ON "imdb_name" USING btree ("title_id");