// 头像图片压缩(对标扯旋压缩参数:最长边 256px、JPEG、目标 ≤100KB)
// 本地 canvas 压缩后再直传 MinIO,几 MB 的照片落盘只有几十 KB。

const MAX_DIM = 256
const TARGET_BYTES = 100 * 1024

/**
 * 压缩图片文件 → JPEG Blob(质量从 0.82 逐步降到 0.34 直至达标)。
 * 无法解码时 reject。
 * @param {File|Blob} file
 * @returns {Promise<Blob>}
 */
export async function compressAvatar(file) {
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  // 透明背景填白(JPEG 无 alpha)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  let blob = null
  for (let q = 0.82; q >= 0.34; q -= 0.12) {
    blob = await toBlob(canvas, 'image/jpeg', q)
    if (blob && blob.size <= TARGET_BYTES) break
  }
  if (!blob) throw new Error('图片压缩失败')
  return blob
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片,请换一张')) }
    img.src = url
  })
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}
