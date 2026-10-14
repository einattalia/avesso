export const PART_SIZE = 64 * 1024 * 1024;
export const ALLOWED_TYPES = new Set(['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','application/pdf']);
export const CONTRACT_TYPES = new Set(['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
export function fail(message, status = 400) { throw Object.assign(new Error(message), {status}); }
export function validateFile(file, maxBytes = 50 * 1024 ** 3, allowedTypes = ALLOWED_TYPES) {
  if (!file || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255) fail('Nome de arquivo inválido.');
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maxBytes) fail('Arquivo vazio ou acima do limite de envio.');
  if (!allowedTypes.has(file.type)) fail('Tipo de arquivo não permitido.');
  if (!/^[a-f0-9]{64}$/.test(file.fingerprint || '')) fail('Identificação do arquivo inválida.');
}
export function validateParts(parts, size, partSize = PART_SIZE) {
  const count = Math.ceil(size / partSize);
  const sorted = [...parts].sort((a,b) => a.PartNumber - b.PartNumber);
  if (sorted.length !== count) fail('Envio incompleto. Selecione o arquivo novamente para retomar.');
  for (let i=0; i<count; i++) {
    if (sorted[i].PartNumber !== i+1 || !sorted[i].ETag || Number(sorted[i].Size) !== Math.min(partSize, size-i*partSize)) fail('Parte incompleta ou tamanho inválido. Retome o envio.');
  }
  return sorted.map(({PartNumber,ETag}) => ({PartNumber,ETag}));
}
export function canReadClientVersion(status) {
  return ['sent_for_review','approved','changes_requested','delivered'].includes(status);
}
