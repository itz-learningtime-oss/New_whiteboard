import { db } from "@/db";
import { projects } from "@/db/schema";
import { validateProject } from "@/lib/story";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  try {
    const project = validateProject(await request.json());
    const [saved] = await db.update(projects).set({ name: project.name, content: { ...project, id: undefined }, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    return saved ? NextResponse.json(saved) : NextResponse.json({ error: "Project not found." }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save." }, { status: 400 }); }
}
export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  try {
    const result = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
    return result.length ? NextResponse.json({ success: true }) : NextResponse.json({ error: "Project not found." }, { status: 404 });
  } catch { return NextResponse.json({ error: "Unable to delete project." }, { status: 500 }); }
}
