"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Plane } from "@/lib/measure/geometry";

// Konva touches window, so load the canvas client-side only.
const MeasureCanvas = dynamic(
  () => import("./MeasureCanvas").then((m) => m.MeasureCanvas),
  { ssr: false, loading: () => <p className="text-sm text-ink-soft">Loading canvas…</p> },
);

export type MeasurementData = {
  id: string;
  imageWidth: number;
  imageHeight: number;
  feetPerPixel: number | null;
  planes: Plane[];
};

export function MeasureClient({
  propertyId,
  measurement,
}: {
  propertyId: string;
  measurement: MeasurementData | null;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      // Read natural dimensions so the canvas knows the underlay size.
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const im = new window.Image();
        im.onload = () => {
          resolve({ w: im.naturalWidth, h: im.naturalHeight });
          URL.revokeObjectURL(url);
        };
        im.onerror = reject;
        im.src = url;
      });

      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "ROOF");
      fd.append("width", String(dims.w));
      fd.append("height", String(dims.h));

      const res = await fetch(`/api/properties/${propertyId}/measurements`, {
        method: "POST",
        body: fd,
      });
      if (res.ok) router.refresh();
      else alert("Upload failed.");
    } catch {
      alert("Could not read that image.");
    } finally {
      setUploading(false);
    }
  }

  if (!measurement) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
        <p className="text-sm text-ink-soft">
          Upload a satellite or roof image to start measuring. Screenshot a clear,
          leaf-off shot from Google Earth Pro for the cleanest underlay.
        </p>
        <label className="mt-4 inline-block cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
          {uploading ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={onUpload}
          />
        </label>
      </div>
    );
  }

  return (
    <MeasureCanvas
      measurementId={measurement.id}
      imageSrc={`/api/measurements/${measurement.id}/image`}
      imageWidth={measurement.imageWidth}
      imageHeight={measurement.imageHeight}
      initialFeetPerPixel={measurement.feetPerPixel}
      initialPlanes={measurement.planes}
    />
  );
}
