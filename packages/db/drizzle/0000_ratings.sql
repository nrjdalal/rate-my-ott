CREATE TABLE "rating" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"found" boolean NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"imdb_id" text,
	"imdb_rating" double precision,
	"imdb_votes" integer,
	"key" text NOT NULL,
	"metascore" integer,
	"poster" text,
	"rotten_tomatoes" integer,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"year" integer,
	CONSTRAINT "rating_key_unique" UNIQUE("key")
);
