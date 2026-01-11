/**
 * API路由模块
 * 统一管理所有API路由和处理器
 */

import { handleGetNavigation } from '../handlers/navigationHandler.js';
import { handleGetAllSites } from '../handlers/sitesHandler.js';
import { handleSearchSites } from '../handlers/searchHandler.js';
import { handleGetStats } from '../handlers/statsHandler.js';
import { 
  handleGetAdminData, 
  handleSaveAdminData, 
  handleResetAdminData,
  handleAddCategory,
  handleUpdateCategory,
  handleDeleteCategory
} from '../handlers/adminHandler.js';
import { handleImportBookmarks } from '../handlers/bookmarkImportHandler.js';
import {
  handleAddSite,
  handleUpdateSite,
  handleDeleteSite,
  handleMoveSite,
  handleBatchDeleteSites,
  handleBatchMoveSites,
  handleBatchUpdateSites,
  handleBatchAddSites,
  handleRefreshFavicons
} from '../handlers/siteManagementHandler.js';
import { 
  createErrorResponse, 
  handleOptionsRequest,
  HTTP_STATUS 
} from '../utils/responseUtils.js';
import { signJWT, verifyJWT } from '../utils/jwt.js';
import { KVStorageManager } from '../utils/kvStorage.js';

/**
 * API路由配置
 */
const API_ROUTES = {
  '/api/navigation': handleGetNavigation,
  '/api/sites': handleGetAllSites,
  '/api/search': handleSearchSites,
  '/api/stats': handleGetStats
};

/**
 * 处理API请求的主函数
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleAPIRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 处理OPTIONS预检请求
  if (request.method === 'OPTIONS') {
    return handleOptionsRequest();
  }

  try {
    // 公开 favicon 读取路由：/api/favicon/:host
    const favMatch = pathname.match(/^\/api\/favicon\/(.+)$/);
    if (favMatch) {
      const cache = caches.default;
      // 利用完整 URL 作为缓存键（包含 ?v= 版本时可长期缓存）
      const cacheHit = await cache.match(request);
      if (cacheHit) return cacheHit;

      const host = decodeURIComponent(favMatch[1] || '').trim();
      const kv = new KVStorageManager(env.NAVIGATION_KV);
      let stored = await kv.getFavicon(host);
      const needsRefresh = !stored || !stored.updatedAt || (Date.now() - stored.updatedAt) > (7 * 24 * 60 * 60 * 1000);
      if (needsRefresh) {
        // 静默刷新：不阻塞响应
        fetch(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`).then(async (resp) => {
          if (resp && resp.ok && (/image\//i.test(resp.headers.get('content-type') || ''))) {
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            const b64 = btoa(bin);
            await kv.putFavicon(host, resp.headers.get('content-type') || 'image/x-icon', b64);
          }
        }).catch(() => {});
      }
      if (!stored) {
        return new Response('Not Found', { status: HTTP_STATUS.NOT_FOUND });
      }
      const bytes = Uint8Array.from(atob(stored.data), c => c.charCodeAt(0));
      const response = new Response(bytes, {
        status: HTTP_STATUS.OK,
        headers: { 'Content-Type': stored.contentType, 'Cache-Control': 'public, max-age=604800' }
      });
      // 写入边缘缓存
      try { await cache.put(request, response.clone()); } catch (_) {}
      return response;
    }

    // 管理登录路由（不需要预先鉴权）
    if (pathname === '/api/admin/auth/login') {
      return await handleAdminLogin(request, env);
    }

    // 基础API路由
    const handler = API_ROUTES[pathname];
    if (handler) {
      return await handler(request, env);
    }
    
    // 管理API路由（动态路径）
    if (pathname.startsWith('/api/admin/')) {
      // 管理接口鉴权
      const authResp = await ensureAdminAuthorized(request, env);
      if (authResp) return authResp;
      return await handleAdminRoute(request, env, pathname, ctx);
    }
    
    // 路由不存在
    return createErrorResponse(
      `API接口不存在: ${pathname}`,
      HTTP_STATUS.NOT_FOUND
    );
    
  } catch (error) {
    console.error('API request handling error:', error);
    return createErrorResponse(
      '服务器内部错误',
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
/**
 * 管理登录：POST { password }
 * 成功后设置 HttpOnly Cookie 并返回成功
 */
async function handleAdminLogin(request, env) {
  if (request.method !== 'POST') {
    return createErrorResponse('请求方法不支持', HTTP_STATUS.METHOD_NOT_ALLOWED);
  }
  const configuredPassword = (env && env.ADMIN_PASSWORD) ? String(env.ADMIN_PASSWORD) : '';
  if (!configuredPassword) {
    return createErrorResponse('管理员密码未配置', HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
  try {
    const body = await request.json();
    const pwd = (body && body.password) ? String(body.password) : '';
    if (!pwd || pwd !== configuredPassword) {
      return createErrorResponse('密码错误', HTTP_STATUS.UNAUTHORIZED);
    }
    const jwt = await signJWT({ sub: 'admin' }, configuredPassword, 86400);
    const isHttps = new URL(request.url).protocol === 'https:';
    const cookieFlags = `Path=/; Max-Age=86400; HttpOnly; ${isHttps ? 'Secure; ' : ''}SameSite=Lax`;
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...{ 'Set-Cookie': `admin_token=${encodeURIComponent(jwt)}; ${cookieFlags}` }
    });
    return new Response(JSON.stringify({ success: true, data: { ok: true, token: jwt } }), {
      status: HTTP_STATUS.OK,
      headers
    });
  } catch (e) {
    return createErrorResponse('请求数据格式错误', HTTP_STATUS.BAD_REQUEST);
  }
}

/**
 * 管理接口鉴权：使用 Authorization: Bearer <ADMIN_PASSWORD> 或 X-Admin-Token
 * 未配置 ADMIN_PASSWORD 则返回 503
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response|null>} 未授权时返回响应，否则返回null
 */
async function ensureAdminAuthorized(request, env) {
  const configuredPassword = (env && env.ADMIN_PASSWORD) ? String(env.ADMIN_PASSWORD) : '';
  if (!configuredPassword) {
    return createErrorResponse(
      '管理员密码未配置',
      HTTP_STATUS.SERVICE_UNAVAILABLE
    );
  }

  const headerAuth = request.headers.get('Authorization') || '';
  const tokenHeader = request.headers.get('X-Admin-Token') || '';
  const cookieHeader = request.headers.get('Cookie') || '';
  const jwtHeader = request.headers.get('X-Admin-JWT') || '';
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
  // 先尝试JWT
  const jwtToken = (jwtHeader || cookieToken || (headerAuth.startsWith('JWT ') ? headerAuth.slice(4).trim() : '')).trim();
  if (jwtToken) {
    const verify = await verifyJWT(jwtToken, configuredPassword);
    if (verify && verify.valid) return null;
  }

  // 再回退到明文口令（兼容旧版本调试工具）
  let provided = '';
  if (headerAuth.startsWith('Bearer ')) provided = headerAuth.slice('Bearer '.length).trim();
  else if (tokenHeader) provided = tokenHeader.trim();
  else if (cookieToken) provided = cookieToken.trim();

  if (!provided || provided !== configuredPassword) {
    return createErrorResponse(
      '未授权的管理请求',
      HTTP_STATUS.UNAUTHORIZED,
      { 'WWW-Authenticate': 'Bearer realm="admin"' }
    );
  }
  return null;
}

/**
 * 处理管理API路由
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @param {string} pathname - 路径
 * @returns {Promise<Response>} 响应对象
 */
async function handleAdminRoute(request, env, pathname, ctx) {
  // 管理数据路由
  if (pathname === '/api/admin/data') {
    switch (request.method) {
      case 'GET':
        return await handleGetAdminData(request, env);
      case 'POST':
        return await handleSaveAdminData(request, env);
      case 'DELETE':
        return await handleResetAdminData(request, env);
      default:
        return createErrorResponse(
          '请求方法不支持',
          HTTP_STATUS.METHOD_NOT_ALLOWED
        );
    }
  }

  // 书签导入路由
  if (pathname === '/api/admin/import/bookmarks') {
    switch (request.method) {
      case 'POST':
        return await handleImportBookmarks(request, env);
      default:
        return createErrorResponse(
          '请求方法不支持',
          HTTP_STATUS.METHOD_NOT_ALLOWED
        );
    }
  }
  
  // 分类管理路由
  if (pathname === '/api/admin/categories') {
    switch (request.method) {
      case 'POST':
        return await handleAddCategory(request, env);
      default:
        return createErrorResponse(
          '请求方法不支持',
          HTTP_STATUS.METHOD_NOT_ALLOWED
        );
    }
  }
  
  // 单个分类操作路由
  const categoryMatch = pathname.match(/^\/api\/admin\/categories\/(.+)$/);
  if (categoryMatch) {
    const categoryId = decodeURIComponent(categoryMatch[1]);
    
    switch (request.method) {
      case 'PUT':
        return await handleUpdateCategory(request, env, categoryId);
      case 'DELETE':
        return await handleDeleteCategory(request, env, categoryId);
      default:
        return createErrorResponse(
          '请求方法不支持',
          HTTP_STATUS.METHOD_NOT_ALLOWED
        );
    }
  }
  
  // 网站管理路由
  if (pathname === '/api/admin/sites') {
    switch (request.method) {
      case 'POST':
        return await handleAddSite(request, env);
      case 'PUT':
        // 批量新增或更新：根据 body.mode 区分 add|update
        return await handleBatchAddSites(request, env);
      case 'PATCH':
        // 批量移动
        return await handleBatchMoveSites(request, env);
      case 'DELETE':
        // 批量删除
        return await handleBatchDeleteSites(request, env);
      default:
        return createErrorResponse(
          '请求方法不支持',
          HTTP_STATUS.METHOD_NOT_ALLOWED
        );
    }
  }

  // 手动刷新 favicon
  if (pathname === '/api/admin/sites/favicon/refresh') {
    switch (request.method) {
      case 'POST':
        return await handleRefreshFavicons(request, env, ctx);
      default:
        return createErrorResponse('请求方法不支持', HTTP_STATUS.METHOD_NOT_ALLOWED);
    }
  }
  
  // 单个网站操作路由
  const siteMatch = pathname.match(/^\/api\/admin\/sites\/([^\/]+)\/(.+)$/);
  if (siteMatch) {
    const categoryId = decodeURIComponent(siteMatch[1]);
    const siteTitle = decodeURIComponent(siteMatch[2]);
    
    // 处理移动网站的特殊路由
    if (siteTitle.endsWith('/move')) {
      const actualSiteTitle = siteTitle.replace('/move', '');
      switch (request.method) {
        case 'PATCH':
          return await handleMoveSite(request, env, categoryId, actualSiteTitle);
        default:
          return createErrorResponse(
            '请求方法不支持',
            HTTP_STATUS.METHOD_NOT_ALLOWED
          );
      }
    }
    
    // 普通网站操作
    switch (request.method) {
      case 'PUT':
        return await handleUpdateSite(request, env, categoryId, siteTitle);
      case 'DELETE':
        return await handleDeleteSite(request, env, categoryId, siteTitle);
      default:
        return createErrorResponse(
          '请求方法不支持',
          HTTP_STATUS.METHOD_NOT_ALLOWED
        );
    }
  }
  
  return createErrorResponse(
    `管理API接口不存在: ${pathname}`,
    HTTP_STATUS.NOT_FOUND
  );
}

/**
 * 检查是否为API请求
 * @param {URL} url - 请求URL
 * @returns {boolean} 是否为API请求
 */
export function isAPIRequest(url) {
  return url.pathname.startsWith('/api/');
}

/**
 * 获取支持的API路由列表
 * @returns {Array} API路由列表
 */
export function getSupportedRoutes() {
  return Object.keys(API_ROUTES);
}
