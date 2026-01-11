/**
 * Chrome 书签导入处理器
 * 解析 Netscape Bookmark HTML 并合并到导航数据
 */

import { KVStorageManager } from '../utils/kvStorage.js';
import { getNavigationDataWithFallback } from '../data/navigationData.js';
import {
  createSuccessResponse,
  createErrorResponse,
  isMethodAllowed,
  HTTP_STATUS
} from '../utils/responseUtils.js';

/**
 * 处理导入Chrome书签请求
 * POST /api/admin/import/bookmarks?mode=merge|replace
 * - 请求体: multipart/form-data，字段名 file
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleImportBookmarks(request, env) {
  if (!isMethodAllowed(request, 'POST')) {
    return createErrorResponse(
      '请求方法不支持，仅支持POST请求',
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    const url = new URL(request.url);
    const mode = (url.searchParams.get('mode') || 'merge').toLowerCase();

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return createErrorResponse(
        '请求必须为multipart/form-data并包含文件',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return createErrorResponse('缺少文件字段 file', HTTP_STATUS.BAD_REQUEST);
    }

    const html = await file.text();

    // 解析书签
    const parsed = parseBookmarksHtml(html);
    if (parsed.totalSites === 0) {
      return createErrorResponse('未从文件中解析到任何书签', HTTP_STATUS.BAD_REQUEST);
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    let currentData = await getNavigationDataWithFallback(kvManager);

    // 建立已有URL集合用来去重（递归收集所有层级的站点URL）
    const existingUrlSet = new Set();
    const collectExistingUrls = (node, depth = 0) => {
      if (!node || depth > 50) return; // 保护
      if (Array.isArray(node.sites)) {
        node.sites.forEach(s => s && s.url && existingUrlSet.add(s.url));
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(child => collectExistingUrls(child, depth + 1));
      }
    };
    (currentData.categories || []).forEach(cat => collectExistingUrls(cat));

    const result = {
      addedCategories: 0,
      addedSites: 0,
      skippedSites: 0
    };

    if (mode === 'replace') {
      currentData = {
        ...currentData,
        categories: []
      };
    }

    // 合并分类与网站
    // 递归合并分类（按标题合并），支持多级目录
    const mergeCategory = (target, source, depth = 0) => {
      if (!target || !source || depth > 10) return; // 最多支持10级
      // 合并站点
      (source.sites || []).forEach(site => {
        if (!site || !site.url) return;
        if (existingUrlSet.has(site.url)) {
          result.skippedSites += 1;
        } else {
          if (!Array.isArray(target.sites)) target.sites = [];
          target.sites.push(site);
          existingUrlSet.add(site.url);
          result.addedSites += 1;
        }
      });
      // 合并子分类
      const targetChildren = Array.isArray(target.children) ? target.children : (target.children = []);
      (source.children || []).forEach(srcChild => {
        const idx = targetChildren.findIndex(c => c.title === srcChild.title);
        if (idx === -1) {
          targetChildren.push(srcChild);
          // 统计新增站点（递归遍历新加入的子树）
          const stack = [srcChild];
          let guard = 0;
          while (stack.length && guard < 10000) {
            guard += 1;
            const node = stack.pop();
            if (!node) continue;
            (node.sites || []).forEach(s => {
              if (s && s.url && !existingUrlSet.has(s.url)) {
                existingUrlSet.add(s.url);
                result.addedSites += 1;
              } else if (s && s.url) {
                result.skippedSites += 1;
              }
            });
            (node.children || []).forEach(ch => stack.push(ch));
          }
        } else {
          mergeCategory(targetChildren[idx], srcChild, depth + 1);
        }
      });
    };

    parsed.categories.forEach(importCat => {
      const existingIndex = currentData.categories.findIndex(c => c.title === importCat.title);
      if (existingIndex === -1) {
        currentData.categories.push(importCat);
        result.addedCategories += 1;
        // 统计新加入分类中的所有站点
        const stack = [importCat];
        let guard = 0;
        while (stack.length && guard < 10000) {
          guard += 1;
          const node = stack.pop();
          if (!node) continue;
          (node.sites || []).forEach(s => {
            if (s && s.url && !existingUrlSet.has(s.url)) {
              existingUrlSet.add(s.url);
              result.addedSites += 1;
            } else if (s && s.url) {
              result.skippedSites += 1;
            }
          });
          (node.children || []).forEach(ch => stack.push(ch));
        }
      } else {
        // 合并到已有分类（递归）
        mergeCategory(currentData.categories[existingIndex], importCat, 0);
      }
    });

    // 保存
    const saveOk = await kvManager.saveNavigationData(currentData);
    if (!saveOk) {
      return createErrorResponse('保存导入数据失败', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    return createSuccessResponse({
      message: '书签导入成功',
      summary: result
    });
  } catch (error) {
    console.error('导入书签失败:', error);
    return createErrorResponse('导入书签失败', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * 解析 Netscape Bookmark HTML
 * 仅提取 H3 作为分类名，A 标签为站点；ICON 属性若存在存为 favicon
 * @param {string} html - 书签HTML
 * @returns {{categories: Array, totalSites: number}}
 */
function parseBookmarksHtml(html) {
  const lines = html.split(/\r?\n/);
  const createNode = (title) => ({ title, sites: [], children: [] });
  const rootTree = createNode('ROOT');
  const stack = [rootTree];
  let pendingTitle = null;

  const h3Regex = /<H3[^>]*>(.*?)<\/H3>/i;
  const aRegex = /<A\s+[^>]*HREF="([^"]+)"[^>]*>(.*?)<\/A>/i;
  const iconRegex = /ICON="([^"]+)"/i;
  const dlOpenRegex = /<DL>/i;
  const dlCloseRegex = /<\/DL>/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const h3Match = line.match(h3Regex);
    if (h3Match) {
      pendingTitle = decodeHtmlEntities(h3Match[1].trim()) || '导入书签';
      continue;
    }

    if (dlOpenRegex.test(line)) {
      if (pendingTitle !== null) {
        const parent = stack[stack.length - 1];
        const node = createNode(pendingTitle);
        parent.children.push(node);
        stack.push(node);
        pendingTitle = null;
      }
      continue;
    }

    if (dlCloseRegex.test(line)) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const aMatch = line.match(aRegex);
    if (aMatch) {
      const url = aMatch[1];
      const title = decodeHtmlEntities(aMatch[2].trim()) || url;
      const iconMatch = line.match(iconRegex);
      const favicon = iconMatch ? iconMatch[1] : '';
      const current = stack[stack.length - 1];
      // 若存在 ICON（如 data:image/... 或 http(s) 链接），优先作为 favicon；此时不设置 icon，
      // 以便前端遵循“icon(若有) > favicon”的优先级显示 favicon
      const site = {
        title,
        description: '',
        url,
        icon: favicon ? '' : '🌐',
        favicon: favicon || undefined
      };
      current.sites.push(site);
    }
  }

  // 转换为导航数据结构
  let seq = 0;
  const mapNode = (node) => ({
    id: generateCategoryId(node.title, seq++),
    title: node.title,
    icon: '📁',
    sites: node.sites,
    children: node.children.map(mapNode)
  });

  let categories = rootTree.children.map(mapNode)
    .filter(cat => (cat.sites && cat.sites.length) || (cat.children && cat.children.length));

  // 规范化根：将除“书签栏/Bookmarks Bar/Bookmarks bar/Bookmarks Toolbar/All Bookmarks”以外的分类，
  // 统一作为“书签栏”的子分类，确保只有一个一级分类
  const ROOT_CANDIDATES = ['书签栏', 'Bookmarks Bar', 'Bookmarks bar', 'Bookmarks Toolbar', 'Bookmarks', 'All Bookmarks'];
  let rootIndex = categories.findIndex(c => ROOT_CANDIDATES.includes(c.title));
  if (rootIndex === -1) {
    // 创建根
    categories.unshift({ id: generateCategoryId('书签栏', 0), title: '书签栏', icon: '📁', sites: [], children: [] });
    rootIndex = 0;
  }
  const root = categories[rootIndex];
  const others = categories.filter((_, i) => i !== rootIndex);
  if (!root.children) root.children = [];
  // 合并其它分类到根的子分类
  root.children.push(...others.map((c, i2) => ({
    id: c.id || generateCategoryId(`${root.title}-${c.title}`, i2),
    title: c.title,
    icon: c.icon || '📂',
    sites: c.sites || [],
    children: c.children || []
  })));
  // 将根下第二层作为顶层分类；根下直接书签归入“未分组”
  const flattened = [];
  if (root.sites && root.sites.length > 0) {
    flattened.push({
      id: generateCategoryId('未分组', 0),
      title: '未分组',
      icon: '📁',
      sites: root.sites,
      children: []
    });
  }
  flattened.push(...root.children);
  categories = flattened;

  // 如果某个标题既作为顶层又作为某顶层的子分类，合并到其子分类并从顶层移除
  const childTitleToLocation = new Map();
  categories.forEach((parent, pIdx) => {
    (parent.children || []).forEach((child, cIdx) => {
      if (!childTitleToLocation.has(child.title)) {
        childTitleToLocation.set(child.title, { pIdx, cIdx });
      }
    });
  });

  const categoriesAfterMerge = [];
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const loc = childTitleToLocation.get(cat.title);
    if (loc) {
      const parent = categories[loc.pIdx];
      const child = parent.children[loc.cIdx];
      // 合并站点（按URL去重）
      const seen = new Set((child.sites || []).map(s => s.url));
      (cat.sites || []).forEach(s => {
        if (!seen.has(s.url)) {
          child.sites.push(s);
          seen.add(s.url);
        }
      });
      // 不保留顶层重复项
      continue;
    }
    categoriesAfterMerge.push(cat);
  }
  categories = categoriesAfterMerge;

  // 统计所有层级的站点总数
  const totalSites = (() => {
    let count = 0;
    const stack = [...categories];
    let guard = 0;
    while (stack.length && guard < 100000) {
      guard += 1;
      const node = stack.pop();
      if (!node) continue;
      if (Array.isArray(node.sites)) count += node.sites.length;
      if (Array.isArray(node.children)) stack.push(...node.children);
    }
    return count;
  })();
  return { categories, totalSites };
}

/**
 * 生成分类ID（尽量语义化，回退到 bm-<n>）
 * @param {string} title - 分类名
 * @param {number} n - 序号
 */
function generateCategoryId(title, n) {
  const slug = title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `bm-${n}`;
}

/**
 * 解码HTML实体
 * @param {string} text - 文本
 * @returns {string}
 */
function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}


