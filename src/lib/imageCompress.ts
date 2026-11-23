/**
 * Client-side image compression and bounded file reading helpers for Firestore document storage.
 */

export async function compressImageFileToDataUrl(
  file: File,
  maxDim = 760,
  maxCharLen = 190_000
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPG, PNG, or WebP).');
  }

  const rawDataUrl = await readFileAsRawDataUrl(file);
  const img = await loadImage(rawDataUrl);

  const ratio = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
  let targetW = Math.max(1, Math.round((img.width || maxDim) * ratio));
  let targetH = Math.max(1, Math.round((img.height || maxDim) * ratio));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (rawDataUrl.length <= maxCharLen) return rawDataUrl;
    throw new Error('Image processing is unavailable in this browser.');
  }

  const qualities = [0.78, 0.65, 0.52, 0.4];
  for (let pass = 0; pass < 3; pass++) {
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    for (const q of qualities) {
      const candidate = canvas.toDataURL('image/jpeg', q);
      if (candidate.length <= maxCharLen) {
        return candidate;
      }
    }

    targetW = Math.max(240, Math.round(targetW * 0.72));
    targetH = Math.max(240, Math.round(targetH * 0.72));
  }

  const fallback = canvas.toDataURL('image/jpeg', 0.35);
  if (fallback.length <= maxCharLen) {
    return fallback;
  }
  throw new Error('Image is still too large after compression. Please pick a smaller image.');
}

export async function readFileAsBoundedDataUrl(
  file: File,
  maxBytes = 260_000
): Promise<{ dataUrl: string; fileName: string; fileSize: number; fileMime: string }> {
  if (file.size > maxBytes) {
    throw new Error(`File must be smaller than ${Math.round(maxBytes / 1024)} KB.`);
  }
  const dataUrl = await readFileAsRawDataUrl(file);
  return {
    dataUrl,
    fileName: file.name.slice(0, 150),
    fileSize: file.size,
    fileMime: (file.type || 'application/octet-stream').slice(0, 90),
  };
}

function readFileAsRawDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid image file.'));
    img.src = src;
  });
}
