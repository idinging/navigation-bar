/**
 * 网站管理API处理器
 * 处理网站的增删改查操作
 */

import { KVStorageManager } from '../utils/kvStorage.js';
import { getNavigationDataWithFallback } from '../data/navigationData.js';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  isMethodAllowed,
  HTTP_STATUS 
} from '../utils/responseUtils.js';
import { KVStorageManager as _KVSM } from '../utils/kvStorage.js';

/**
 * 规范化路径段：
 * - 支持 { path: string[] } 或 { path: string }（使用'/'分割）
 * - 去除空项与首尾空白
 * @param {any} payload
 * @returns {string[]}
 */
function normalizeSegments(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.path)) {
    return payload.path.map(s => String(s || '').trim()).filter(Boolean);
  }
  if (typeof payload.path === 'string') {
    return payload.path.split('/').map(s => s.trim()).filter(Boolean);
  }
  if (Array.isArray(payload.segments)) {
    return payload.segments.map(s => String(s || '').trim()).filter(Boolean);
  }
  if (typeof payload.segments === 'string') {
    return payload.segments.split('/').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * 在节点的站点数组中按标题查找索引
 */
function findSiteIndexByTitle(node, title) {
  const t = String(title || '').trim();
  if (!t || !node || !Array.isArray(node.sites)) return -1;
  return node.sites.findIndex(s => s && s.title === t);
}

/**
 * 在节点的站点数组中按URL查找索引
 */
function findSiteIndexByUrl(node, url) {
  const u = String(url || '').trim();
  if (!u || !node || !Array.isArray(node.sites)) return -1;
  return node.sites.findIndex(s => s && s.url === u);
}

/**
 * 确保目标节点中不存在同URL站点
 */
function canInsertSite(node, site) {
  if (!node || !Array.isArray(node.sites) || !site || !site.url) return false;
  return findSiteIndexByUrl(node, site.url) === -1;
}

/**
 * 判断是否为图片URL（http/https/data:image）
 * @param {string} s
 */
function isImageUrl(s) {
  const v = String(s || '').trim();
  if (!v) return false;
  return /^https?:\/\//i.test(v) || /^data:image\//i.test(v);
}

/**
 * 从URL提取host
 * @param {string} url
 * @returns {string|null}
 */
function extractHost(url) {
  try { return new URL(String(url)).hostname; } catch (_) { return null; }
}

/**
 * 抓取并缓存favicon（duckduckgo优先，回退站点根/favicon.ico）
 * @param {KVStorageManager} kvManager
 * @param {string} host
 * @returns {Promise<{ok:boolean, path?:string}>}
 */
async function fetchAndCacheFavicon(kvManager, host) {
  if (!host) return { ok: false };
  const candidates = [
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://${host}/favicon.ico`
  ];
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { method: 'GET' });
      if (!resp || !resp.ok) continue;
      const ct = resp.headers.get('content-type') || 'image/x-icon';
      if (!/image\//i.test(ct)) continue;
      const buf = await resp.arrayBuffer();
      const base64 = (() => {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      })();
      const ok = await kvManager.putFavicon(host, ct, base64);
      if (ok) return { ok: true, path: `/api/favicon/${encodeURIComponent(host)}` };
    } catch (_) { /* ignore and try next */ }
  }
  return { ok: false };
}

/**
 * 处理添加网站请求
 * POST /api/admin/sites
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleAddSite(request, env) {
  if (!isMethodAllowed(request, 'POST')) {
    return createErrorResponse(
      '请求方法不支持，仅支持POST请求', 
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    const body = await request.json();
    
    if (!body || !body.categoryId || !body.title || !body.url || !body.description) {
      return createErrorResponse(
        '网站信息不完整，需要提供categoryId、title、url和description',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    
    // 获取当前数据
    let currentData = await kvManager.getNavigationData();
    if (!currentData) {
      currentData = await getNavigationDataWithFallback(kvManager);
    }

    // 查找目标分类
    const categoryIndex = currentData.categories.findIndex(cat => cat.id === body.categoryId);
    if (categoryIndex === -1) {
      return createErrorResponse(
        '指定的分类不存在',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 检查网站是否已存在
    const existingSite = currentData.categories[categoryIndex].sites.find(site => 
      site.title === body.title || site.url === body.url
    );
    if (existingSite) {
      return createErrorResponse(
        '网站标题或URL已存在',
        HTTP_STATUS.CONFLICT
      );
    }

    // 添加新网站（支持icon为emoji或图片URL；favicon统一指向 /api/favicon/<host>）
    const newSite = {
      title: body.title,
      description: body.description,
      url: body.url,
      icon: body.icon || '🌐'
    };

    // favicon 统一：始终绑定到 /api/favicon/<host>
    {
      const host = extractHost(body.url);
      if (host) {
        try {
          const cached = await fetchAndCacheFavicon(kvManager, host);
          if (cached.ok && cached.path) newSite.favicon = cached.path;
          else newSite.favicon = `/api/favicon/${encodeURIComponent(host)}`;
        } catch (_) {
          newSite.favicon = `/api/favicon/${encodeURIComponent(host)}`;
        }
      }
    }

    currentData.categories[categoryIndex].sites.push(newSite);

    // 保存数据
    if (kvManager.isAvailable()) {
      await kvManager.saveNavigationData(currentData);
    }

    return createSuccessResponse({
      message: '网站添加成功',
      site: newSite,
      category: currentData.categories[categoryIndex].title
    });
  } catch (error) {
    console.error('添加网站失败:', error);
    return createErrorResponse(
      '添加网站失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * 处理更新网站请求
 * PUT /api/admin/sites/:categoryId/:siteTitle
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @param {string} categoryId - 分类ID
 * @param {string} siteTitle - 网站标题
 * @returns {Promise<Response>} 响应对象
 */
export async function handleUpdateSite(request, env, categoryId, siteTitle) {
  if (!isMethodAllowed(request, 'PUT')) {
    return createErrorResponse(
      '请求方法不支持，仅支持PUT请求', 
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    const body = await request.json();
    
    if (!body) {
      return createErrorResponse(
        '请求数据不能为空',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    
    // 获取当前数据
    let currentData = await kvManager.getNavigationData();
    if (!currentData) {
      currentData = await getNavigationDataWithFallback(kvManager);
    }

    // 查找目标分类
    const categoryIndex = currentData.categories.findIndex(cat => cat.id === categoryId);
    if (categoryIndex === -1) {
      return createErrorResponse(
        '指定的分类不存在',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 查找要更新的网站（传入的 siteTitle 在路由层已 decode）
    const siteIndex = currentData.categories[categoryIndex].sites.findIndex(site => 
      site.title === siteTitle
    );
    if (siteIndex === -1) {
      return createErrorResponse(
        '指定的网站不存在',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 更新网站信息（同步处理favicon逻辑；favicon统一到 /api/favicon/<host>）
    const prev = currentData.categories[categoryIndex].sites[siteIndex];
    const updatedSite = { ...prev, ...body };
    {
      const host = extractHost(updatedSite.url || prev.url);
      if (host) {
        try {
          const kvManager = new KVStorageManager(env.NAVIGATION_KV);
          const cached = await fetchAndCacheFavicon(kvManager, host);
          if (cached.ok && cached.path) updatedSite.favicon = cached.path;
          else updatedSite.favicon = `/api/favicon/${encodeURIComponent(host)}`;
        } catch (_) {
          updatedSite.favicon = `/api/favicon/${encodeURIComponent(host)}`;
        }
      }
    }

    currentData.categories[categoryIndex].sites[siteIndex] = updatedSite;

    // 保存数据
    if (kvManager.isAvailable()) {
      await kvManager.saveNavigationData(currentData);
    }

    return createSuccessResponse({
      message: '网站更新成功',
      site: updatedSite,
      category: currentData.categories[categoryIndex].title
    });
  } catch (error) {
    console.error('更新网站失败:', error);
    return createErrorResponse(
      '更新网站失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * 处理删除网站请求
 * DELETE /api/admin/sites/:categoryId/:siteTitle
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @param {string} categoryId - 分类ID
 * @param {string} siteTitle - 网站标题
 * @returns {Promise<Response>} 响应对象
 */
export async function handleDeleteSite(request, env, categoryId, siteTitle) {
  if (!isMethodAllowed(request, 'DELETE')) {
    return createErrorResponse(
      '请求方法不支持，仅支持DELETE请求', 
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    
    // 获取当前数据
    let currentData = await kvManager.getNavigationData();
    if (!currentData) {
      currentData = await getNavigationDataWithFallback(kvManager);
    }

    // 查找目标分类
    const categoryIndex = currentData.categories.findIndex(cat => cat.id === categoryId);
    if (categoryIndex === -1) {
      return createErrorResponse(
        '指定的分类不存在',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 查找要删除的网站（传入的 siteTitle 在路由层已 decode）
    const siteIndex = currentData.categories[categoryIndex].sites.findIndex(site => 
      site.title === siteTitle
    );
    if (siteIndex === -1) {
      return createErrorResponse(
        '指定的网站不存在',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 删除网站
    const deletedSite = currentData.categories[categoryIndex].sites.splice(siteIndex, 1)[0];

    // 保存数据
    if (kvManager.isAvailable()) {
      await kvManager.saveNavigationData(currentData);
    }

    return createSuccessResponse({
      message: '网站删除成功',
      site: deletedSite,
      category: currentData.categories[categoryIndex].title
    });
  } catch (error) {
    console.error('删除网站失败:', error);
    return createErrorResponse(
      '删除网站失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * 处理移动网站到其他分类请求
 * PATCH /api/admin/sites/:categoryId/:siteTitle/move
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @param {string} categoryId - 原分类ID
 * @param {string} siteTitle - 网站标题
 * @returns {Promise<Response>} 响应对象
 */
export async function handleMoveSite(request, env, categoryId, siteTitle) {
  if (!isMethodAllowed(request, 'PATCH')) {
    return createErrorResponse(
      '请求方法不支持，仅支持PATCH请求', 
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    const body = await request.json();
    
    if (!body || !body.targetCategoryId) {
      return createErrorResponse(
        '请求数据不完整，需要提供targetCategoryId',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    
    // 获取当前数据
    let currentData = await kvManager.getNavigationData();
    if (!currentData) {
      currentData = await getNavigationDataWithFallback(kvManager);
    }

    // 查找原分类
    const sourceCategoryIndex = currentData.categories.findIndex(cat => cat.id === categoryId);
    if (sourceCategoryIndex === -1) {
      return createErrorResponse(
        '原分类不存在',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 查找目标分类
    const targetCategoryIndex = currentData.categories.findIndex(cat => cat.id === body.targetCategoryId);
    if (targetCategoryIndex === -1) {
      return createErrorResponse(
        '目标分类不存在',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 查找要移动的网站（传入的 siteTitle 在路由层已 decode）
    const siteIndex = currentData.categories[sourceCategoryIndex].sites.findIndex(site => 
      site.title === siteTitle
    );
    if (siteIndex === -1) {
      return createErrorResponse(
        '指定的网站不存在',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 移动网站
    const siteToMove = currentData.categories[sourceCategoryIndex].sites.splice(siteIndex, 1)[0];
    currentData.categories[targetCategoryIndex].sites.push(siteToMove);

    // 保存数据
    if (kvManager.isAvailable()) {
      await kvManager.saveNavigationData(currentData);
    }

    return createSuccessResponse({
      message: '网站移动成功',
      site: siteToMove,
      fromCategory: currentData.categories[sourceCategoryIndex].title,
      toCategory: currentData.categories[targetCategoryIndex].title
    });
  } catch (error) {
    console.error('移动网站失败:', error);
    return createErrorResponse(
      '移动网站失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * 批量新增或更新网站
 * PUT /api/admin/sites
 * body: {
 *   mode: 'add' | 'update',
 *   items: Array<
 *     mode='add': { path: string[]|string, site: { title, url, description?, icon? } }
 *     mode='update': { path: string[]|string, title: string, update: Partial<site> }
 *   >
 * }
 */
export async function handleBatchAddSites(request, env) {
  if (!isMethodAllowed(request, 'PUT')) {
    return createErrorResponse('请求方法不支持，仅支持PUT请求', HTTP_STATUS.METHOD_NOT_ALLOWED);
  }

  try {
    const body = await request.json();
    const mode = (body && body.mode) || 'add';
    const items = (body && Array.isArray(body.items)) ? body.items : [];
    if (items.length === 0) {
      return createErrorResponse('请求数据不完整，items不能为空', HTTP_STATUS.BAD_REQUEST);
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);

    let added = 0;
    let updated = 0;

    // 收集每个目录的最终节点，最后一次性写入
    const segKey = (segs) => segs.map(s => String(s || '').trim()).filter(Boolean).join('/');
    const pendingMap = new Map(); // key(path) -> { segments, node }

    for (const it of items) {
      const segments = normalizeSegments(it);
      const key = segKey(segments);
      if (!key) continue;

      let record = pendingMap.get(key);
      if (!record) {
        const node = await kvManager.getFolderNode(segments);
        if (!Array.isArray(node.sites)) node.sites = [];
        record = { segments, node };
        pendingMap.set(key, record);
      }

      const node = record.node;

      if (mode === 'add') {
        const site = it && it.site;
        if (!site || !site.title || !site.url) continue;
        if (canInsertSite(node, site)) {
          const s = {
            title: site.title,
            description: site.description || '',
            url: site.url,
            icon: site.icon || '🌐'
          };
          // favicon 统一：始终绑定到 /api/favicon/<host>
          {
            const host = extractHost(s.url);
            if (host) {
              try {
                const cached = await fetchAndCacheFavicon(kvManager, host);
                if (cached.ok && cached.path) s.favicon = cached.path;
                else s.favicon = `/api/favicon/${encodeURIComponent(host)}`;
              } catch (_) {
                s.favicon = `/api/favicon/${encodeURIComponent(host)}`;
              }
            }
          }
          node.sites.push(s);
          added += 1;
        }
      } else if (mode === 'update') {
        const title = it && it.title;
        const update = (it && it.update) || {};
        const idx = findSiteIndexByTitle(node, title);
        if (idx !== -1) {
          const prev = node.sites[idx];
          const merged = { ...prev, ...update };
          // favicon 统一：始终绑定到 /api/favicon/<host>
          {
            const host = extractHost(merged.url || prev.url);
            if (host) {
              try {
                const cached = await fetchAndCacheFavicon(kvManager, host);
                if (cached.ok && cached.path) merged.favicon = cached.path;
                else merged.favicon = `/api/favicon/${encodeURIComponent(host)}`;
              } catch (_) {
                merged.favicon = `/api/favicon/${encodeURIComponent(host)}`;
              }
            }
          }
          node.sites[idx] = merged;
          updated += 1;
        }
      }
    }

    if (pendingMap.size > 0) {
      await kvManager.putFolderNodesBulk(Array.from(pendingMap.values()));
    }

    return createSuccessResponse({ message: '批量处理完成', mode, added, updated });
  } catch (error) {
    console.error('批量新增/更新网站失败:', error);
    return createErrorResponse('批量新增/更新网站失败', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * 批量删除网站
 * DELETE /api/admin/sites
 * body: { items: Array<{ path: string[]|string, titles: string[] }> }
 */
export async function handleBatchDeleteSites(request, env) {
  if (!isMethodAllowed(request, 'DELETE')) {
    return createErrorResponse('请求方法不支持，仅支持DELETE请求', HTTP_STATUS.METHOD_NOT_ALLOWED);
  }

  try {
    const body = await request.json();
    const items = (body && Array.isArray(body.items)) ? body.items : [];
    if (items.length === 0) {
      return createErrorResponse('请求数据不完整，items不能为空', HTTP_STATUS.BAD_REQUEST);
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    let deleted = 0;
    const segKey = (segs) => segs.map(s => String(s || '').trim()).filter(Boolean).join('/');
    const pendingMap = new Map();

    for (const it of items) {
      const segments = normalizeSegments(it);
      const titles = Array.isArray(it.titles) ? it.titles : [];
      if (titles.length === 0) continue;
      const key = segKey(segments);
      if (!key) continue;

      let record = pendingMap.get(key);
      if (!record) {
        const node = await kvManager.getFolderNode(segments);
        if (!Array.isArray(node.sites)) node.sites = [];
        record = { segments, node };
        pendingMap.set(key, record);
      }
      const node = record.node;
      const titleSet = new Set(titles.map(t => String(t || '').trim()).filter(Boolean));
      const before = node.sites.length;
      node.sites = node.sites.filter(s => !(s && titleSet.has(s.title)));
      deleted += Math.max(0, before - node.sites.length);
    }

    if (pendingMap.size > 0) {
      await kvManager.putFolderNodesBulk(Array.from(pendingMap.values()));
    }

    return createSuccessResponse({ message: '批量删除完成', deleted });
  } catch (error) {
    console.error('批量删除网站失败:', error);
    return createErrorResponse('批量删除网站失败', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * 批量移动网站
 * PATCH /api/admin/sites
 * body: { items: Array<{ path: string[]|string, titles: string[] }>, target: string[]|string }
 */
export async function handleBatchMoveSites(request, env) {
  if (!isMethodAllowed(request, 'PATCH')) {
    return createErrorResponse('请求方法不支持，仅支持PATCH请求', HTTP_STATUS.METHOD_NOT_ALLOWED);
  }

  try {
    const body = await request.json();
    const items = (body && Array.isArray(body.items)) ? body.items : [];
    const targetSegments = normalizeSegments({ path: body && body.target });
    if (items.length === 0 || targetSegments.length === 0) {
      return createErrorResponse('请求数据不完整，items和target均不能为空', HTTP_STATUS.BAD_REQUEST);
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    const segKey = (segs) => segs.map(s => String(s || '').trim()).filter(Boolean).join('/');
    const pendingMap = new Map();
    let targetRecord = null;

    const ensureRecord = async (segments) => {
      const key = segKey(segments);
      let rec = pendingMap.get(key);
      if (!rec) {
        const node = await kvManager.getFolderNode(segments);
        if (!Array.isArray(node.sites)) node.sites = [];
        rec = { segments, node };
        pendingMap.set(key, rec);
      }
      return rec;
    };

    let moved = 0;
    const movedSites = [];

    // 源节点删除并收集
    for (const it of items) {
      const segments = normalizeSegments(it);
      const titles = Array.isArray(it.titles) ? it.titles : [];
      if (titles.length === 0) continue;
      const rec = await ensureRecord(segments);
      const node = rec.node;
      const titleSet = new Set(titles.map(t => String(t || '').trim()).filter(Boolean));
      const remain = [];
      for (const s of node.sites) {
        if (s && titleSet.has(s.title)) {
          movedSites.push(s);
        } else {
          remain.push(s);
        }
      }
      moved += (node.sites.length - remain.length);
      node.sites = remain;
    }

    // 目标插入
    targetRecord = await ensureRecord(targetSegments);
    for (const s of movedSites) {
      if (canInsertSite(targetRecord.node, s)) {
        targetRecord.node.sites.push(s);
      }
    }

    if (pendingMap.size > 0) {
      await kvManager.putFolderNodesBulk(Array.from(pendingMap.values()));
    }

    return createSuccessResponse({ message: '批量移动完成', moved });
  } catch (error) {
    console.error('批量移动网站失败:', error);
    return createErrorResponse('批量移动网站失败', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * 批量更新网站（单独导出，便于未来独立路由；当前通过 PUT + mode=update 使用）
 */
export async function handleBatchUpdateSites(request, env) {
  if (!isMethodAllowed(request, 'PUT')) {
    return createErrorResponse('请求方法不支持，仅支持PUT请求', HTTP_STATUS.METHOD_NOT_ALLOWED);
  }
  try {
    const body = await request.json();
    const items = (body && Array.isArray(body.items)) ? body.items : [];
    if (items.length === 0) {
      return createErrorResponse('请求数据不完整，items不能为空', HTTP_STATUS.BAD_REQUEST);
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    let updated = 0;
    const segKey = (segs) => segs.map(s => String(s || '').trim()).filter(Boolean).join('/');
    const pendingMap = new Map();

    for (const it of items) {
      const segments = normalizeSegments(it);
      const key = segKey(segments);
      if (!key) continue;
      let record = pendingMap.get(key);
      if (!record) {
        const node = await kvManager.getFolderNode(segments);
        if (!Array.isArray(node.sites)) node.sites = [];
        record = { segments, node };
        pendingMap.set(key, record);
      }
      const node = record.node;
      const title = it && it.title;
      const update = (it && it.update) || {};
      const idx = findSiteIndexByTitle(node, title);
      if (idx !== -1) {
        node.sites[idx] = { ...node.sites[idx], ...update };
        updated += 1;
      }
    }

    if (pendingMap.size > 0) {
      await kvManager.putFolderNodesBulk(Array.from(pendingMap.values()));
    }

    return createSuccessResponse({ message: '批量更新完成', updated });
  } catch (error) {
    console.error('批量更新网站失败:', error);
    return createErrorResponse('批量更新网站失败', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * 手动刷新 favicon
 * POST /api/admin/sites/favicon/refresh
 * body: { urls: string[] }
 */
export async function handleRefreshFavicons(request, env, ctx) {
  if (!isMethodAllowed(request, 'POST')) {
    return createErrorResponse('请求方法不支持，仅支持POST请求', HTTP_STATUS.METHOD_NOT_ALLOWED);
  }
  try {
    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    const body = await request.json().catch(() => ({}));
    const urls = Array.isArray(body && body.urls) ? body.urls : [];
    const force = !!(body && body.force);
    let hosts = Array.from(new Set(urls.map(u => { try { return new URL(u).hostname; } catch(_) { return ''; } }).filter(Boolean)));
    let refreshed = 0;
    // 记录成功抓取的 favicon 原始数据，随后统一写入 KV，并让站点引用 /api/favicon/<host>
    const hostToFavicon = new Map(); // host -> { b64, ct }
    const doWork = async () => {
      const now = Date.now();
      const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7天
      // 若 force=true 则刷新全部站点；否则当未传 urls 时仅刷新超过7天或从未刷新的主机
      if (hosts.length === 0) {
        let nav = await kvManager.getNavigationData();
        if (!nav) nav = await getNavigationDataWithFallback(kvManager);
        const collectHosts = (category) => {
          if (Array.isArray(category.sites)) {
            for (const site of category.sites) {
              try {
                const h = new URL(site.url).hostname;
                const ts = Number(site.faviconUpdatedAt || 0);
                if (!h) continue;
                if (force) {
                  hosts.push(h);
                } else if (!ts || (now - ts) > MAX_AGE) {
                  hosts.push(h);
                }
              } catch(_) {}
            }
          }
          if (Array.isArray(category.children)) category.children.forEach(collectHosts);
        };
        if (nav && Array.isArray(nav.categories)) nav.categories.forEach(collectHosts);
        hosts = Array.from(new Set(hosts.filter(Boolean)));
      }
      for (const host of hosts) {
        try {
          // 优先 duckduckgo，其次站点根 /favicon.ico
          const tryFetch = async (url) => {
            const r = await fetch(url);
            if (!r || !r.ok) return null;
            const ct = r.headers.get('content-type') || 'image/x-icon';
            if (!/image\//i.test(ct)) return null;
            const buf = await r.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            return { b64: btoa(bin), ct };
          };

          let result = await tryFetch(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`);
          if (!result) {
            result = await tryFetch(`https://${host}/favicon.ico`);
          }
          if (result) {
            refreshed += 1;
            hostToFavicon.set(host, { b64: result.b64, ct: result.ct });
          }
        } catch (_) {}
      }
      if (hostToFavicon.size > 0) {
        // 先批量写入 favicon 缓存（按 host 键并行，内部已去重）
        try {
          await Promise.all(Array.from(hostToFavicon.entries()).map(([h, v]) => 
            kvManager.putFavicon(h, v.ct, v.b64)
          ));
        } catch (_) {}

        let nav = await kvManager.getNavigationData();
        if (!nav) nav = await getNavigationDataWithFallback(kvManager);
        if (nav && Array.isArray(nav.categories)) {
          const updateCategory = (category) => {
            if (Array.isArray(category.sites)) {
              category.sites = category.sites.map(site => {
                try {
                  const h = new URL(site.url).hostname;
                  if (hostToFavicon.has(h)) {
                    return { ...site, favicon: `/api/favicon/${encodeURIComponent(h)}`, faviconUpdatedAt: now };
                  }
                } catch (_) {}
                return site;
              });
            }
            if (Array.isArray(category.children)) category.children.forEach(updateCategory);
          };
          nav.categories.forEach(updateCategory);
          await kvManager.saveNavigationData(nav);
        }
      }
    };
    // 强制刷新或明确传入urls时，改为同步执行，确保返回时数据已更新
    try {
      if (force || (urls && urls.length > 0)) {
        await doWork();
        return createSuccessResponse({ message: '已刷新完成', total: hosts.length, mode: 'sync' });
      } else {
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(doWork());
          return createSuccessResponse({ message: '刷新任务已提交', total: hosts.length, mode: 'async' });
        }
        await doWork();
        return createSuccessResponse({ message: '已刷新完成', total: hosts.length, mode: 'sync-fallback' });
      }
    } catch (_) {
      await doWork();
      return createSuccessResponse({ message: '已刷新完成', total: hosts.length, mode: 'sync-fallback' });
    }
  } catch (error) {
    console.error('刷新favicon失败:', error);
    return createErrorResponse('刷新favicon失败', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

