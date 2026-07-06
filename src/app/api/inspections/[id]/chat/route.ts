import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inspectionChat, type ChatTurn } from "@/lib/ai/inspection";

export const maxDuration = 60;

// POST /api/inspections/:id/chat — append the user's message, get the bot's
// reply (with photo context), persist both, return the assistant message.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "Empty message." }, { status: 400 });
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
  }

  await prisma.inspectionMessage.create({
    data: { inspectionId: id, role: "user", content },
  });

  const contextSummary = inspection.photos
    .map((p, i) => {
      const tags = p.tags.length ? ` [${p.tags.join(", ")}]` : "";
      const desc = p.description || p.aiDescription || "";
      return `Photo ${i + 1}${tags}: ${desc}`.trim();
    })
    .join("\n");

  const turns: ChatTurn[] = [
    ...inspection.messages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user", content },
  ];

  try {
    const reply = await inspectionChat(turns, contextSummary);
    const saved = await prisma.inspectionMessage.create({
      data: { inspectionId: id, role: "assistant", content: reply },
    });
    return NextResponse.json({ message: { role: "assistant", content: saved.content } });
  } catch (err) {
    const msg = (err as Error).message;
    const text =
      msg === "NO_AI_KEY"
        ? "No AI engine is configured yet — add an API key in Settings to chat with the review bot. Your message was saved."
        : "The review bot hit an error. Your message was saved; try again.";
    return NextResponse.json({ message: { role: "assistant", content: text } });
  }
}
