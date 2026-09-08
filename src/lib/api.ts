import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db";

/** Returns a JSON 503 response when the database is not configured, else null. */
export function dbRequired() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      {
        error:
          "Database is not configured. Set DATABASE_URL in .env to point at your local PostgreSQL and restart the server (see README).",
      },
      { status: 503 }
    );
  }
  return null;
}

/** Python executable: explicit env override, then `python` on Windows, else `python3`. */
export function pythonBinary() {
  if (process.env.PYTHON_BINARY) return process.env.PYTHON_BINARY;
  return process.platform === "win32" ? "python" : "python3";
}
