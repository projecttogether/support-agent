/** Images for the test console: PNG, JPEG, GIF or WebP, at most 5 MB each and 3 per question. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 3;

export type TestImage = {
  name: string;
  size: number;
  mediaType: ImageType;
  /** Base64 without a `data:` prefix, as the API expects. */
  data: string;
};

export type ImageProblem = { name: string; problem: "type" | "size" | "count" };

function isImageType(type: string): type is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(type);
}

/** Base64 of the file's bytes (no `data:` prefix). */
export async function toBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/**
 * Reads chosen files next to the images already attached: skips files of
 * other types, larger than 5 MB, or beyond the third image, and says why.
 */
export async function readImages(
  files: Iterable<File>,
  attached: number,
): Promise<{ images: TestImage[]; problems: ImageProblem[] }> {
  const images: TestImage[] = [];
  const problems: ImageProblem[] = [];
  for (const file of files) {
    if (!isImageType(file.type)) problems.push({ name: file.name, problem: "type" });
    else if (file.size > MAX_IMAGE_BYTES) problems.push({ name: file.name, problem: "size" });
    else if (attached + images.length >= MAX_IMAGES) problems.push({ name: file.name, problem: "count" });
    else images.push({ name: file.name, size: file.size, mediaType: file.type, data: await toBase64(file) });
  }
  return { images, problems };
}
