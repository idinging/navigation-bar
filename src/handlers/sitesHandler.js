/**
 * 网站API处理器
 * 处理网站列表相关的API请求
 */

import { getNavigationDataWithFallback } from '../data/navigationData.js';
import { KVStorageManager } from '../utils/kvStorage.js';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  isMethodAllowed,
  HTTP_STATUS 
} from '../utils/responseUtils.js';

/**
 * 处理获取所有网站请求
 * GET /api/sites
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleGetAllSites(request, env) {
  // 验证请求方法
  if (!isMethodAllowed(request, 'GET')) {
    return createErrorResponse(
      '请求方法不支持，仅支持GET请求', 
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    const navigationData = await getNavigationDataWithFallback(kvManager);
    
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
    
    return createSuccessResponse(allSites);
  } catch (error) {
    console.error('Get all sites error:', error);
    return createErrorResponse(
      '获取网站列表失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
