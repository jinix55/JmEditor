/**
 * gallery-upload — 이미지 갤러리 업로드 제한·리사이즈 (에디터 전용)
 *
 * - 제한값은 config.js 기본값(jpg·png·gif·webp, 파일당 10MB, 1회 10장, 글당 50장 또는 100MB, 긴 변 2000px)에
 *   설정 파일(jm-editor.config.js) → 에디터 옵션 galleryLimits 순으로 덮어쓴다.
 * - 파일당 크기는 원본 기준, 글당 용량은 축소 후 실제로 올라가는 크기 기준으로 센다.
 * - GIF 는 브라우저에서 줄이면 애니메이션이 사라지므로 축소하지 않는다 (파일당 크기 제한만 적용).
 * - 클라이언트 제한은 우회할 수 있으므로 서버에서도 같은 제한을 다시 검사해야 한다.
 */
import { resolveConfig } from '../../config.js';

const MB = 1024 * 1024;

/**
 * @typedef {object} GalleryLimits 내부 계산용 제한값 (크기는 바이트)
 * @property {string[]} types
 * @property {number} maxFileSize
 * @property {number} maxFilesPerAdd
 * @property {number} maxImagesPerPost
 * @property {number} maxTotalSize
 * @property {number} maxDimension
 */

/** 형식 안내 문구 (예: "jpg·png·gif·webp") */
export function typeLabel(types) {
  return types.map((t) => t.replace('image/', '').replace('jpeg', 'jpg')).join('·');
}

/** 바이트를 MB 문구로 */
export function mbLabel(bytes) {
  return `${Math.round((bytes / MB) * 10) / 10}MB`;
}

/**
 * 기본값 < 설정 파일 < 에디터 옵션(galleryLimits) 을 합쳐 내부 제한값(바이트 단위)으로 바꾼다
 * @param {object} [override] 에디터 옵션 galleryLimits (설정 파일과 같은 키, 크기는 MB)
 * @returns {GalleryLimits}
 */
export function resolveLimits(override) {
  const c = resolveConfig('gallery', override);
  return {
    types: [...c.types],
    maxFileSize: c.maxFileSizeMB * MB,
    maxFilesPerAdd: c.maxFilesPerAdd,
    maxImagesPerPost: c.maxImagesPerPost,
    maxTotalSize: c.maxTotalSizeMB * MB,
    maxDimension: c.maxDimension,
  };
}

/**
 * 형식·파일당 크기로 파일을 고른다 (장수·글당 제한은 호출하는 쪽에서 검사)
 * @param {File[]} files
 * @param {GalleryLimits} limits
 * @returns {{ accepted: File[], messages: string[] }} 통과한 파일과 제외 사유 문구
 */
export function filterFiles(files, limits) {
  const badType = [], tooBig = [];
  const accepted = files.filter((f) => {
    if (!limits.types.includes(f.type)) { badType.push(f.name); return false; }
    if (f.size > limits.maxFileSize) { tooBig.push(f.name); return false; }
    return true;
  });
  const messages = [];
  if (badType.length) messages.push(`${typeLabel(limits.types)} 파일만 올릴 수 있습니다. (제외: ${badType.join(', ')})`);
  if (tooBig.length) messages.push(`파일당 ${mbLabel(limits.maxFileSize)}까지 올릴 수 있습니다. (제외: ${tooBig.join(', ')})`);
  return { accepted, messages };
}

/**
 * 긴 변이 maxDimension 을 넘으면 비율을 유지한 채 줄인다. GIF·작은 이미지는 원본 그대로 돌려준다.
 * @param {File} file
 * @param {number} maxDimension
 * @returns {Promise<File>}
 */
export async function resizeImage(file, maxDimension) {
  if (file.type === 'image/gif' || !(maxDimension > 0)) return file;
  const bitmap = await createImageBitmap(file); // EXIF 회전 반영
  try {
    const { width, height } = bitmap;
    if (Math.max(width, height) <= maxDimension) return file;
    const scale = maxDimension / Math.max(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, file.type, 0.9));
    if (!blob) return file;
    return new File([blob], file.name, { type: blob.type, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
