/*
 * Profile photo: picked from the gallery or camera, cropped to a square and
 * shrunk to a small JPEG so it can be shared quickly with the room.
 */
const SIZE = 160;
const MAX_LENGTH = 58000;

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function shrinkPhoto(file) {
  const img = await loadImage(await readFile(file));
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
  let quality = 0.82;
  let data = canvas.toDataURL("image/jpeg", quality);
  while (data.length > MAX_LENGTH && quality > 0.3) {
    quality -= 0.15;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  return data;
}

/** opens the photo picker; resolves with a data url or null */
export function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      try {
        resolve(await shrinkPhoto(file));
      } catch (e) {
        resolve(null);
      }
    };
    input.click();
  });
}
