/**
 * 个人导航网站 Cloudflare Worker
 * 基于原EvanMi样式的个人导航站点
 * 
 * 主入口文件 - 负责请求路由和分发
 */

import { handleAPIRequest, isAPIRequest } from './routes/apiRouter.js';
import { handleStaticAssets, isStaticAssetRequest } from './utils/assetHandler.js';

/**
 * 主请求处理器
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量对象
 * @param {Object} ctx - 执行上下文对象
 * @returns {Promise<Response>} 响应对象
 */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  
  try {
    // API请求路由
    if (isAPIRequest(url)) {
      return await handleAPIRequest(request, env, ctx);
    }
    
    // 静态资源请求
    if (isStaticAssetRequest(url)) {
      return await handleStaticAssets(request, env);
    }
    
    // 默认返回主页
    return await handleStaticAssets(request, env);
    
  } catch (error) {
    console.error('Request handling error:', error);
    return new Response('Internal Server Error', { 
      status: 500,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
}

/**
 * Cloudflare Worker导出对象
 */
export default {
  fetch: handleRequest
};
