/**
 * JWT 工具 - HS256
 * 仅用于管理后台的简单认证
 */

/**
 * Base64URL 编码
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function base64UrlEncode(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * 将对象转为 Base64URL JSON
 * @param {Object} obj
 * @returns {string}
 */
function encodeJSON(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return base64UrlEncode(bytes);
}

/**
 * 计算 HS256 签名
 * @param {string} data
 * @param {string} secret
 * @returns {Promise<string>}
 */
async function hmacSha256(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(sig));
}

/**
 * 签发 JWT（HS256）
 * @param {Object} payload - 负载，会自动加入 iat/exp
 * @param {string} secret - 密钥
 * @param {number} ttlSeconds - 有效期（秒）
 * @returns {Promise<string>} token
 */
export async function signJWT(payload, secret, ttlSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const pl = { ...payload, iat: now, exp: now + ttlSeconds };
  const p1 = encodeJSON(header);
  const p2 = encodeJSON(pl);
  const toSign = `${p1}.${p2}`;
  const sig = await hmacSha256(toSign, secret);
  return `${toSign}.${sig}`;
}

/**
 * 验证 JWT（HS256）
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<{valid:boolean, payload?:any, error?:string}>}
 */
export async function verifyJWT(token, secret) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return { valid: false, error: 'format' };
    const [p1, p2, sig] = parts;
    const toSign = `${p1}.${p2}`;
    const expectedSig = await hmacSha256(toSign, secret);
    if (sig !== expectedSig) return { valid: false, error: 'signature' };
    // 解析 payload
    const json = atob(p2.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && now >= payload.exp) return { valid: false, error: 'expired' };
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: 'exception' };
  }
}


