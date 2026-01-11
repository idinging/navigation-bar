/**
 * 导航API处理器
 * 处理导航相关的API请求
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
 * 处理获取导航数据请求
 * GET /api/navigation
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleGetNavigation(request, env) {
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
    return createSuccessResponse(navigationData);
  } catch (error) {
    console.error('Get navigation error:', error);
    return createErrorResponse(
      '获取导航数据失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
