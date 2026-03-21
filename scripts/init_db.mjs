import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import 'dotenv/config';

async function init() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required in environment variables.");
    process.exit(1);
  }

  const sql = neon(url);
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log("Table 'users' created or verified.");

    const email = "admin@ekonomi.local";
    const password = "admin";
    const hash = await bcrypt.hash(password, 10);
    
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length === 0) {
      await sql`INSERT INTO users (email, password_hash) VALUES (${email}, ${hash})`;
      console.log(`Inserted default user: ${email} / ${password}`);
    } else {
      console.log(`User ${email} already exists.`);
    }

  } catch (error) {
    console.error("Error initializing DB:", error);
  }
}

init();
