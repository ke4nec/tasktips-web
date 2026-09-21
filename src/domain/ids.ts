// 云端同步用的标识与时间格式（对齐 tasktips-cloud 契约）。

// Crockford Base32（剔除 I、L、O、U），与云端 ULID 校验的字节集一致。
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 生成 26 位 ULID：48 位毫秒时间戳 + 80 位随机，按 Crockford Base32 编码。 */
export function newUlid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const millis = Date.now();
  bytes[0] = (millis / 2 ** 24) & 0xff;
  bytes[1] = (millis / 2 ** 16) & 0xff;
  bytes[2] = (millis / 2 ** 8) & 0xff;
  bytes[3] = millis & 0xff;
  // 时间戳 48 位取低 40 位参与前 8 个字符，其余随机，保证单调性与唯一性足够。
  let value = 0n;
  let bits = 0;
  const nibbles: number[] = [];
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
    bits += 8;
    while (bits >= 5) {
      nibbles.push(Number((value >> BigInt(bits - 5)) & 0x1fn));
      bits -= 5;
    }
  }
  if (bits > 0) nibbles.push(Number((value << BigInt(5 - bits)) & 0x1fn));
  return nibbles
    .slice(0, 26)
    .map((nibble) => CROCKFORD[nibble])
    .join("");
}
