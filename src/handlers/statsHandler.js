/**
 * 统计API处理器
 * 处理网站统计信息相关的API请求
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
 * 处理获取统计信息请求
 * GET /api/stats
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleGetStats(request, env) {
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

    // 递归统计分类数量（包含所有层级）
    const countCategoriesRecursive = (node) => {
      let count = 1; // 计入当前分类
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          count += countCategoriesRecursive(child);
        }
      }
      return count;
    };

    // 递归统计网站数量（包含所有层级）
    const countSitesRecursive = (node) => {
      let count = Array.isArray(node.sites) ? node.sites.length : 0;
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          count += countSitesRecursive(child);
        }
      }
      return count;
    };

    const totalCategories = Array.isArray(navigationData.categories)
      ? navigationData.categories.reduce((sum, cat) => sum + countCategoriesRecursive(cat), 0)
      : 0;

    const totalSites = Array.isArray(navigationData.categories)
      ? navigationData.categories.reduce((sum, cat) => sum + countSitesRecursive(cat), 0)
      : 0;
    
    // 获取最后更新时间
    let lastUpdated = new Date().toISOString();
    if (kvManager.isAvailable()) {
      const kvLastUpdated = await kvManager.getLastUpdated();
      if (kvLastUpdated) {
        lastUpdated = kvLastUpdated;
      }
    }
    
    const stats = {
      totalCategories,
      totalSites,
      lastUpdated
    };
    
    return createSuccessResponse(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    return createErrorResponse(
      '获取统计信息失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
