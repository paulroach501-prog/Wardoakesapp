"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { compressImage } from "@/lib/image";

type Photo = {
  id: string;
  tags: string[];
  description: string | null;
  aiDescription: string | null;
};
type Msg = { role: string; content: string };
type Inspection = { id: string; photos: Photo[]; messages: Msg[] };

const TAGS = [
  "hail",
  "wind",
  "general condition",
  "test square",
  "flashing",
  "penetration",
  "gutter",
  "damage",
  "overview",
];

export function InspectionClient({
  propertyId,
  inspection,
}: {
  propertyId: string;
  inspection: Inspection | null;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  async function startInspection() {
    setStarting(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/inspections`, { method: "POST" });
      if (res.ok) router.refresh();
      else alert("Could not start inspection.");
    } finally {
      setStarting(false);
    }
  }

  if (!inspection) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
        <p className="text-sm text-ink-soft">
          Start an inspection to capture photos, tag them, dictate notes, and chat
          with the review bot as you work.
        </p>
        <button
          type="button"
          onClick={startInspection}
          disabled={starting}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {starting ? "Starting…" : "Start inspection"}
        </button>
      </div>
    );
  }

  return <ActiveInspection inspection={inspection} />;
}

function ActiveInspection({ inspection }: { inspection: Inspection }) {
  const [photos, setPhotos] = useState<Photo[]>(inspection.photos);
  const [messages, setMessages] = useState<Msg[]>(inspection.messages);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      // Compress hard on-device before upload — small storage, fast on cell.
      const compressed = await Promise.all(Array.from(files).map((f) => compressImage(f)));
      compressed.forEach((f) => fd.append("files", f));
      const res = await fetch(`/api/inspections/${inspection.id}/photos`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        const { ids } = (await res.json()) as { ids: string[] };
        setPhotos((ps) => [
          ...ps,
          ...ids.map((id) => ({ id, tags: [], description: null, aiDescription: null })),
        ]);
      } else alert("Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const patchPhoto = useCallback(
    async (id: string, patch: Partial<Photo>) => {
      setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      await fetch(`/api/photos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => {});
    },
    [],
  );

  async function deletePhoto(id: string) {
    if (!confirm("Delete this photo?")) return;
    setPhotos((ps) => ps.filter((p) => p.id !== id));
    if (selected === id) setSelected(null);
    await fetch(`/api/photos/${id}`, { method: "DELETE" }).catch(() => {});
  }

  const sel = photos.find((p) => p.id === selected) ?? null;

  return (
    <div className="space-y-4">
      {/* Capture */}
      <div className="flex items-center gap-2">
        <label className="cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
          {uploading ? "Uploading…" : "＋ Add photos"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={onUpload}
          />
        </label>
        <span className="text-xs text-ink-soft">{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
      </div>

      {/* Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id === selected ? null : p.id)}
              className={`relative aspect-square overflow-hidden rounded-lg border ${
                p.id === selected ? "border-brand ring-2 ring-brand/30" : "border-slate-200"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${p.id}/image`}
                alt=""
                className="h-full w-full object-cover"
              />
              {p.tags.length > 0 && (
                <span className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1 py-0.5 text-[10px] text-white">
                  {p.tags.join(", ")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Selected photo editor */}
      {sel && <PhotoEditor photo={sel} onPatch={patchPhoto} onDelete={deletePhoto} onUpdate={(patch) => setPhotos((ps) => ps.map((p) => (p.id === sel.id ? { ...p, ...patch } : p)))} />}

      {/* Chat */}
      <ChatPanel inspectionId={inspection.id} messages={messages} setMessages={setMessages} />
    </div>
  );
}

function PhotoEditor({
  photo,
  onPatch,
  onDelete,
  onUpdate,
}: {
  photo: Photo;
  onPatch: (id: string, patch: Partial<Photo>) => void;
  onDelete: (id: string) => void;
  onUpdate: (patch: Partial<Photo>) => void;
}) {
  const [desc, setDesc] = useState(photo.description ?? "");
  const [describing, setDescribing] = useState(false);
  const { supported, listening, toggle } = useDictation((text) =>
    setDesc((d) => (d ? `${d} ${text}` : text)),
  );

  function toggleTag(tag: string) {
    const tags = photo.tags.includes(tag)
      ? photo.tags.filter((t) => t !== tag)
      : [...photo.tags, tag];
    onPatch(photo.id, { tags });
  }

  async function aiDescribe() {
    setDescribing(true);
    try {
      const res = await fetch(`/api/photos/${photo.id}/describe`, { method: "POST" });
      const data = await res.json();
      if (res.ok) onUpdate({ aiDescription: data.aiDescription });
      else alert(data.error || "AI description failed.");
    } finally {
      setDescribing(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/photos/${photo.id}/image`} alt="" className="max-h-64 w-full rounded-lg object-contain" />

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-soft">Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map((t) => {
            const on = photo.tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                  on ? "bg-brand text-white" : "border border-slate-300 text-ink"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Description</p>
          {supported && (
            <button
              type="button"
              onClick={toggle}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                listening ? "bg-red-600 text-white" : "border border-slate-300 text-ink"
              }`}
            >
              {listening ? "● listening…" : "🎤 dictate"}
            </button>
          )}
        </div>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => onPatch(photo.id, { description: desc })}
          rows={3}
          placeholder="Type or dictate what this photo shows…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={aiDescribe}
          disabled={describing}
          className="rounded-lg border border-brand px-3 py-1.5 text-xs font-semibold text-brand disabled:opacity-60"
        >
          {describing ? "Describing…" : "AI describe"}
        </button>
        <button type="button" onClick={() => onDelete(photo.id)} className="ml-auto text-xs font-medium text-red-600">
          Delete photo
        </button>
      </div>

      {photo.aiDescription && (
        <div className="rounded-lg bg-canvas p-2 text-sm text-ink">
          <span className="text-xs font-semibold text-ink-soft">AI: </span>
          {photo.aiDescription}
        </div>
      )}
    </div>
  );
}

function ChatPanel({
  inspectionId,
  messages,
  setMessages,
}: {
  inspectionId: string;
  messages: Msg[];
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>;
}) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content }]);
    setSending(true);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.message) setMessages((m) => [...m, data.message]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Network error." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-2">
        <p className="text-sm font-semibold text-ink">Review bot</p>
        <p className="text-xs text-ink-soft">Ask about what you&apos;re seeing; it knows your photos + tags.</p>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-ink-soft">No messages yet.</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-brand text-white"
                : "bg-canvas text-ink"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && <p className="text-xs text-ink-soft">Bot is thinking…</p>}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message the review bot…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// --- voice dictation via the Web Speech API (single-shot) ---
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
}

function useDictation(onText: (text: string) => void) {
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);

  const w =
    typeof window !== "undefined"
      ? (window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionLike;
        })
      : undefined;
  const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
  const supported = Boolean(Ctor);

  function toggle() {
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const first = e.results[0];
      const text = first?.[0]?.transcript ?? "";
      if (text) onText(text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return { supported, listening, toggle };
}
