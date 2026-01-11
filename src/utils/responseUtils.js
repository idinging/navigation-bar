/**
 * 响应工具模块
 * 提供统一的HTTP响应处理和CORS配置
 */

/**
 * CORS配置常量
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
};

/**
 * HTTP状态码常量
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

/**
 * 创建成功响应
 * @param {*} data - 响应数据
 * @param {Object} additionalHeaders - 额外的响应头
 * @returns {Response} 响应对象
 */
export function createSuccessResponse(data, additionalHeaders = {}) {
  return new Response(JSON.stringify({
    success: true,
    data: data
  }), {
    status: HTTP_STATUS.OK,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...additionalHeaders
    }
  });
}

/**
 * 创建错误响应
 * @param {string} error - 错误信息
 * @param {number} status - HTTP状态码
 * @param {Object} additionalHeaders - 额外的响应头
 * @returns {Response} 响应对象
 */
export function createErrorResponse(error, status = HTTP_STATUS.BAD_REQUEST, additionalHeaders = {}) {
  return new Response(JSON.stringify({
    success: false,
    error: error
  }), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...additionalHeaders
    }
  });
}

/**
 * 处理OPTIONS预检请求
 * @returns {Response} 预检响应
 */
export function handleOptionsRequest() {
  return new Response(null, { 
    headers: CORS_HEADERS 
  });
}

/**
 * 创建搜索响应（包含查询信息）
 * @param {Array} results - 搜索结果
 * @param {string} query - 搜索关键词
 * @returns {Response} 响应对象
 */
export function createSearchResponse(results, query) {
  return new Response(JSON.stringify({
    success: true,
    data: results,
    query: query,
    total: results.length
  }), {
    status: HTTP_STATUS.OK,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

/**
 * 验证请求方法
 * @param {Request} request - 请求对象
 * @param {string|Array} allowedMethods - 允许的方法
 * @returns {boolean} 是否为允许的方法
 */
export function isMethodAllowed(request, allowedMethods) {
  const methods = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods];
  return methods.includes(request.method);
}

/**
 * 获取查询参数
 * @param {Request} request - 请求对象
 * @param {string} paramName - 参数名
 * @returns {string|null} 参数值
 */
export function getQueryParam(request, paramName) {
  const url = new URL(request.url);
  return url.searchParams.get(paramName);
}

/**
 * 验证查询参数是否存在且非空
 * @param {string} value - 参数值
 * @returns {boolean} 是否有效
 */
export function isValidParam(value) {
  return value !== null && value !== undefined && value.trim() !== '';
}
