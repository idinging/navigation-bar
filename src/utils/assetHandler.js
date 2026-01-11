/**
 * 静态资源处理模块
 * 负责处理静态文件请求和错误处理
 */

/**
 * 处理静态资源请求
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleStaticAssets(request, env) {
  try {
    // 管理后台页面访问控制
    const url = new URL(request.url);
    if (isAdminPageRequest(url)) {
      const gate = await ensureAdminPageAuthorized(request, env);
      if (gate && gate.authorized === false) {
        return renderAdminLoginPage();
      }
      // 通过鉴权后，强制返回实际 admin.html
      const adminRequestUrl = new URL('/admin.html', url);
      const adminRequest = new Request(adminRequestUrl.toString(), request);
      const resp = await env.ASSETS.fetch(adminRequest);
      if (resp.ok) return resp;
    }
    // 检查ASSETS绑定是否存在
    if (!env.ASSETS) {
      console.warn('ASSETS binding not found, returning 404');
      return createNotFoundResponse();
    }

    // 尝试获取静态资源
    const response = await env.ASSETS.fetch(request);
    
    // 如果资源存在，添加缓存头
    if (response.ok) {
      return addCacheHeaders(response);
    }
    
    return createNotFoundResponse();
    
  } catch (error) {
    console.error('Static asset handling error:', error);
    return createNotFoundResponse();
  }
}

/**
 * 创建404响应
 * @returns {Response} 404响应
 */
function createNotFoundResponse() {
  return new Response('Resource Not Found', { 
    status: 404,
    headers: {
      'Content-Type': 'text/plain'
    }
  });
}

/**
 * 判断是否访问管理后台页面
 */
function isAdminPageRequest(url) {
  const p = url.pathname;
  return p === '/admin' || p === '/admin/' || p === '/admin.html';
}

/**
 * 管理页面鉴权（使用与API相同的 ADMIN_PASSWORD）
 * 支持 Authorization Bearer / X-Admin-Token / Cookie admin_token
 */
async function ensureAdminPageAuthorized(request, env) {
  const configuredPassword = (env && env.ADMIN_PASSWORD) ? String(env.ADMIN_PASSWORD) : '';
  if (!configuredPassword) return { authorized: false };
  const headerAuth = request.headers.get('Authorization') || '';
  const tokenHeader = request.headers.get('X-Admin-Token') || '';
  const cookieHeader = request.headers.get('Cookie') || '';
  let cookieToken = '';
  if (cookieHeader) {
    try {
      const pairs = cookieHeader.split(';').map(s => s.trim());
      for (const p of pairs) {
        const [k, ...rest] = p.split('=');
        if (k === 'admin_token') {
          cookieToken = decodeURIComponent(rest.join('='));
          break;
        }
      }
    } catch (_) {}
  }
  let provided = '';
  if (headerAuth.startsWith('Bearer ')) provided = headerAuth.slice('Bearer '.length).trim();
  else if (tokenHeader) provided = tokenHeader.trim();
  else if (cookieToken) provided = cookieToken.trim();
  // 支持 JWT：当 admin_token 已是 JWT 时，认为已授权（后端API会再严格校验签名与过期）
  const isJWT = !!(provided && provided.split('.').length === 3);
  if (isJWT) return { authorized: true };
  return { authorized: !!provided && provided === configuredPassword };
}

/**
 * 返回一个简单的管理员登录页面（静态渲染）
 */
function renderAdminLoginPage() {
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>管理后台登录</title><link rel="icon" href="/asset/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/css/styles.css"></head><body><div class="container" style="max-width:420px;margin:80px auto;"> <h1 style="text-align:center;">管理后台登录</h1><div class="card" style="padding:16px;"> <div class="form-group"><label class="form-label">管理员密码</label><input type="password" id="pwd" class="form-input" placeholder="请输入管理员密码"></div><button id="login-btn" class="btn btn-primary" style="width:100%;margin-top:8px;">登录</button><div id="msg" style="color:#e00;margin-top:8px;display:none;"></div> </div><p style="text-align:center;margin-top:12px;"><a href="/">返回首页</a></p></div><script>document.getElementById('login-btn').addEventListener('click', async ()=>{ const pwdEl = document.getElementById('pwd'); const msg = document.getElementById('msg'); msg.style.display='none'; try { const resp = await fetch('/api/admin/auth/login',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password: pwdEl.value||'' }) }); const data = await resp.json().catch(()=>({})); if(resp.ok && data && data.success){ try{ sessionStorage.setItem('admin_jwt', data.data.token); }catch(_){} location.href='/admin.html'; } else { msg.textContent = (data && data.error) || ('HTTP '+resp.status); msg.style.display='block'; } } catch(e){ msg.textContent = '请求失败'; msg.style.display='block'; } }); </script></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/**
 * 为静态资源添加缓存头
 * @param {Response} response - 原响应对象
 * @returns {Response} 带缓存头的响应
 */
function addCacheHeaders(response) {
  const newHeaders = new Headers(response.headers);
  
  // 根据文件类型设置不同的缓存策略
  const contentType = response.headers.get('content-type') || '';
  
  if (contentType.includes('text/html')) {
    // HTML文件：短期缓存
    newHeaders.set('Cache-Control', 'public, max-age=300'); // 5分钟
  } else if (contentType.includes('text/css') || contentType.includes('application/javascript')) {
    // CSS和JS文件：长期缓存
    newHeaders.set('Cache-Control', 'public, max-age=86400'); // 24小时
  } else if (contentType.includes('image/')) {
    // 图片文件：长期缓存
    newHeaders.set('Cache-Control', 'public, max-age=604800'); // 7天
  } else {
    // 其他文件：中期缓存
    newHeaders.set('Cache-Control', 'public, max-age=3600'); // 1小时
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/**
 * 检查是否为静态资源请求
 * @param {URL} url - 请求URL
 * @returns {boolean} 是否为静态资源
 */
export function isStaticAssetRequest(url) {
  const pathname = url.pathname;
  
  // 常见的静态资源文件扩展名
  const staticExtensions = [
    '.html', '.css', '.js', '.json',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.woff', '.woff2', '.ttf', '.eot',
    '.pdf', '.txt', '.xml'
  ];
  
  return staticExtensions.some(ext => pathname.endsWith(ext)) ||
         pathname === '/' || // 根路径
         pathname === '/index.html'; // 主页
}
