/**
 * 搜索API处理器
 * 处理网站搜索相关的API请求
 */

import { getNavigationDataWithFallback } from '../data/navigationData.js';
import { KVStorageManager } from '../utils/kvStorage.js';
import { 
  createSearchResponse, 
  createErrorResponse, 
  isMethodAllowed,
  getQueryParam,
  isValidParam,
  HTTP_STATUS 
} from '../utils/responseUtils.js';

/**
 * 处理搜索网站请求
 * GET /api/search?q=关键词
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleSearchSites(request, env) {
  // 验证请求方法
  if (!isMethodAllowed(request, 'GET')) {
    return createErrorResponse(
      '请求方法不支持，仅支持GET请求', 
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    // 获取搜索关键词
    const query = getQueryParam(request, 'q');
    
    // 验证搜索关键词
    if (!isValidParam(query)) {
      return createErrorResponse(
        '搜索关键词不能为空',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    const navigationData = await getNavigationDataWithFallback(kvManager);
    
    // 执行搜索
    const searchTerm = query.toLowerCase().trim();
    const allSites = navigationData.categories.flatMap(cat => {
      const topSites = (cat.sites || []).map(site => ({
        ...site,
        category: cat.title,
        categoryId: cat.id
      }));
      const subSites = (cat.children || []).flatMap(child =>
        (child.sites || []).map(site => ({
          ...site,
          category: `${cat.title} / ${child.title}`,
          categoryId: `${cat.id}/${child.id}`
        }))
      );
      return [...topSites, ...subSites];
    });
    
    const results = allSites.filter(site => 
      (site.title && site.title.toLowerCase().includes(searchTerm)) ||
      (site.description && site.description.toLowerCase().includes(searchTerm)) ||
      (site.category && site.category.toLowerCase().includes(searchTerm))
    );
    
    return createSearchResponse(results, query);
    
  } catch (error) {
    console.error('Search sites error:', error);
    return createErrorResponse(
      '搜索网站失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
