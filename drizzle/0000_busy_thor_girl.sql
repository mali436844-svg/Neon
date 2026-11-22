CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"fen" text NOT NULL,
	"moves" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_move" jsonb,
	"white_token" text NOT NULL,
	"black_token" text,
	"white_name" text DEFAULT 'White' NOT NULL,
	"black_name" text,
	"status" text DEFAULT 'waiting' NOT NULL,
	"result" text,
	"featured" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "games_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"score" integer NOT NULL,
	"mode" text NOT NULL,
	"result" text NOT NULL,
	"moves" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
