"use client";

// Client-side image compression for inspection photos. Roof photos only need
// enough resolution for AI vision (which downscales anyway) and for a human to
// see the defect — so we resize hard and re-encode to JPEG before upload. This
// keeps storage tiny and uploads fast on field cell signal. Falls back to the
// original file if anything goes wrong (e.g. an undecodable format).

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // Prefer createImageBitmap with EXIF orientation honored (iPhone photos).
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to <img>
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export async function compressImage(
  file: File,
  maxEdge = 1600,
  quality = 0.72,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await loadBitmap(file);
    const w0 = "width" in bmp ? bmp.width : (bmp as HTMLImageElement).naturalWidth;
    const h0 = "height" in bmp ? bmp.height : (bmp as HTMLImageElement).naturalHeight;
    if (!w0 || !h0) return file;

    const scale = Math.min(1, maxEdge / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file; // never upsize

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
