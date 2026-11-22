import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  fen: text("fen").notNull(),
  moves: jsonb("moves").$type<string[]>().notNull().default([]),
  lastMove: jsonb("last_move").$type<{ from: string; to: string } | null>(),
  whiteToken: text("white_token").notNull(),
  blackToken: text("black_token"),
  whiteName: text("white_name").notNull().default("White"),
  blackName: text("black_name"),
  status: text("status").notNull().default("waiting"), // waiting | active | finished
  result: text("result"), // e.g. "White wins by checkmate"
  featured: integer("featured").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  score: integer("score").notNull(),
  mode: text("mode").notNull(),
  result: text("result").notNull(),
  moves: integer("moves").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
