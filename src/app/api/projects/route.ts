import { db } from "@/db";
import { projects } from "@/db/schema";
import { validateProject } from "@/lib/story";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { dbRequired } from "@/lib/api";

export async function GET() {
  const missing = dbRequired(); if (missing) return missing;
  try { return NextResponse.json(await db.select().from(projects).orderBy(desc(projects.updatedAt)).limit(100)); }
  catch (error) { console.error("Projects:", error); return NextResponse.json({ error: "Unable to load projects. Please try again." }, { status: 500 }); }
}
export async function POST(request: Request) {
  const missing = dbRequired(); if (missing) return missing;
  try {
    const project = validateProject(await request.json());
    const [saved] = await db.insert(projects).values({ name: project.name, content: { ...project, id: undefined } }).returning();
    return NextResponse.json(saved, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save project." }, { status: 400 }); }
}
