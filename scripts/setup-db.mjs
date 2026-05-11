import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("prisma/dev.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS User (
    id TEXT NOT NULL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  );
`);

db.close();

console.log("SQLite database is ready at prisma/dev.db");
