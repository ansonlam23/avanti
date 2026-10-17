// Client-side photo prep. Vercel caps request bodies at 4.5 MB, and phone
// photos are 3–12 MB (iPhone library photos may be HEIC), so we always
// re-encode in the browser: decode → max 1600px long edge → JPEG q≈0.85.

export interface PreparedPhoto {
  blob: Blob;
  url: string; // object URL for display (revoke when done)
  width: number;
  height: number;
}

const MAX_EDGE = 1600;
const MAX_BYTES = 3.8 * 1024 * 1024;

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const source = await decode(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source.image, 0, 0, width, height);
    let blob = await toJpeg(canvas, 0.85);
    if (blob.size > MAX_BYTES) blob = await toJpeg(canvas, 0.7);
    return { blob, url: URL.createObjectURL(blob), width, height };
  } finally {
    source.close();
  }
}

interface Decoded {
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decode(file: File): Promise<Decoded> {
  // 1) createImageBitmap honours EXIF orientation with "from-image".
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through (e.g. HEIC in browsers whose createImageBitmap can't, but <img> can)
    }
  }
  // 2) <img> decode (Safari decodes HEIC here).
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      image: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This browser can't open that photo. Try taking a new one, or pick a JPEG.");
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("couldn't encode photo"))), "image/jpeg", quality),
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
