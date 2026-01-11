/**
 * 管理API处理器
 * 处理管理后台相关的API请求
 */

import { navigationData } from '../data/navigationData.js';
import { KVStorageManager } from '../utils/kvStorage.js';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  isMethodAllowed,
  HTTP_STATUS 
} from '../utils/responseUtils.js';

/**
 * 处理获取管理数据请求
 * GET /api/admin/data
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleGetAdminData(request, env) {
  if (!isMethodAllowed(request, 'GET')) {
    return createErrorResponse(
      '请求方法不支持，仅支持GET请求', 
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    if (!kvManager.isAvailable()) {
      return createErrorResponse(
        'KV存储不可用，请检查配置',
        HTTP_STATUS.SERVICE_UNAVAILABLE
      );
    }

    // 统一通过 KV 获取；若 KV 为空则自动初始化为默认数据
    let currentData = await kvManager.getNavigationData();
    if (!currentData) {
      await kvManager.saveNavigationData(navigationData);
      currentData = await kvManager.getNavigationData();
    }

    const storageInfo = await kvManager.getStorageInfo();

    return createSuccessResponse({
      data: currentData,
      dataSource: 'kv',
      storageInfo: storageInfo
    });
  } catch (error) {
    console.error('获取管理数据失败:', error);
    return createErrorResponse(
      '获取管理数据失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * 处理保存导航数据请求
 * POST /api/admin/data
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleSaveAdminData(request, env) {
  if (!isMethodAllowed(request, 'POST')) {
    return createErrorResponse(
      '请求方法不支持，仅支持POST请求', 
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    const body = await request.json();
    
    if (!body || !body.data) {
      return createErrorResponse(
        '请求数据格式错误',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    
    if (!kvManager.isAvailable()) {
      return createErrorResponse(
        'KV存储不可用，请检查配置',
        HTTP_STATUS.SERVICE_UNAVAILABLE
      );
    }

    // 读取当前快照
    let currentData = await kvManager.getNavigationData();
    if (!currentData) {
      // 首次初始化仍然使用整树一次写入（单键），写入次数最少
      const success = await kvManager.saveNavigationData(body.data);
      if (success) {
        return createSuccessResponse({
          message: '数据保存成功',
          timestamp: new Date().toISOString()
        });
      }
      return createErrorResponse('数据保存失败', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const incoming = body.data || {};
    // 确保未分类存在且字段完整
    const ensureUncategorized = (cats) => {
      if (!Array.isArray(cats)) return;
      let unc = cats.find(c => c && (c.id === 'uncategorized' || c.title === '未分类'));
      if (!unc) {
        unc = { id: 'uncategorized', title: '未分类', icon: '📁', sites: [], children: [] };
        // 默认追加到最后
        cats.push(unc);
      } else {
        if (!unc.id) unc.id = 'uncategorized';
        if (!unc.title) unc.title = '未分类';
        if (!('icon' in unc)) unc.icon = '📁';
        if (!Array.isArray(unc.sites)) unc.sites = [];
        if (!Array.isArray(unc.children)) unc.children = [];
      }
      // 保证未分类始终在最后
      const idx = cats.findIndex(c => c && (c.id === 'uncategorized' || c.title === '未分类'));
      if (idx >= 0 && idx !== cats.length - 1) {
        const [u] = cats.splice(idx, 1);
        cats.push(u);
      }
    };
    ensureUncategorized(incoming.categories);

    // 判断结构是否变化（比较 title/children/id，且保留原有顺序，顺序变化也视为结构变化）
    const isSameStructure = (aCats, bCats) => {
      const norm = (cats) => {
        if (!Array.isArray(cats)) return [];
        // 不进行排序，保持输入顺序，以便检测到顺序变化
        return cats.map(c => ({
          id: c.id || '',
          title: c.title || '',
          children: norm(c.children)
        }));
      };
      const sa = JSON.stringify(norm(aCats));
      const sb = JSON.stringify(norm(bCats));
      return sa === sb;
    };

    const same = isSameStructure(currentData.categories, incoming.categories);
    if (!same) {
      // 结构发生变化（新增/删除/重命名/层级变动），回退整树一次写入
      const success = await kvManager.saveNavigationData(incoming);
      if (success) {
        return createSuccessResponse({
          message: '数据保存成功',
          timestamp: new Date().toISOString(),
          mode: 'snapshot'
        });
      }
      return createErrorResponse('数据保存失败', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    // 补充：如果结构一致，但分类元数据（如 icon）发生变化，执行整树一次写入
    const isSameMeta = (aCats, bCats) => {
      const norm = (cats) => {
        if (!Array.isArray(cats)) return [];
        return cats.map(c => ({
          id: c.id || '',
          title: c.title || '',
          icon: c.icon || '',
          // 仅比较元数据，不比较 sites 顺序
          children: norm(c.children)
        }));
      };
      return JSON.stringify(norm(aCats)) === JSON.stringify(norm(bCats));
    };

    const metaSame = isSameMeta(currentData.categories, incoming.categories);
    if (!metaSame) {
      const success = await kvManager.saveNavigationData(incoming);
      if (success) {
        return createSuccessResponse({
          message: '数据保存成功',
          timestamp: new Date().toISOString(),
          mode: 'snapshot-meta'
        });
      }
      return createErrorResponse('数据保存失败', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    // 结构一致且元数据一致：仅对发生变化的目录节点提交 sites 的聚合写入
    const updates = [];
    const segments = [];

    const walk = (currCats, nextCats) => {
      const byId = new Map((currCats || []).map(c => [c.id || c.title, c]));
      for (const nc of (nextCats || [])) {
        const key = nc.id || nc.title;
        const cc = byId.get(key);
        if (!cc) continue; // 理论上结构一致时不会发生
        // 深入之前推入当前段（使用 title 路径）
        segments.push(nc.title);
        const safeSitesA = Array.isArray(cc.sites) ? cc.sites : [];
        const safeSitesB = Array.isArray(nc.sites) ? nc.sites : [];
        const sa = JSON.stringify(safeSitesA);
        const sb = JSON.stringify(safeSitesB);
        if (sa !== sb) {
          updates.push({ segments: [...segments], node: { sites: safeSitesB } });
        }
        // 递归子分类
        walk(cc.children || [], nc.children || []);
        // 回退一层
        segments.pop();
      }
    };

    walk(currentData.categories, incoming.categories);

    if (updates.length === 0) {
      return createSuccessResponse({
        message: '无变化，已跳过写入',
        timestamp: new Date().toISOString(),
        mode: 'noop'
      });
    }

    await kvManager.putFolderNodesBulk(updates);
    return createSuccessResponse({
      message: '数据保存成功',
      timestamp: new Date().toISOString(),
      mode: 'bulk-sites'
    });
  } catch (error) {
    console.error('保存管理数据失败:', error);
    return createErrorResponse(
      '保存管理数据失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * 处理重置数据请求
 * DELETE /api/admin/data
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleResetAdminData(request, env) {
  if (!isMethodAllowed(request, 'DELETE')) {
    return createErrorResponse(
      '请求方法不支持，仅支持DELETE请求', 
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    
    if (!kvManager.isAvailable()) {
      return createErrorResponse(
        'KV存储不可用，请检查配置',
        HTTP_STATUS.SERVICE_UNAVAILABLE
      );
    }

    const success = await kvManager.clearAll();
    
    if (success) {
      return createSuccessResponse({
        message: '数据重置成功，已恢复为默认数据',
        timestamp: new Date().toISOString()
      });
    } else {
      return createErrorResponse(
        '数据重置失败',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  } catch (error) {
    console.error('重置管理数据失败:', error);
    return createErrorResponse(
      '重置管理数据失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * 处理添加分类请求
 * POST /api/admin/categories
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleAddCategory(request, env) {
  if (!isMethodAllowed(request, 'POST')) {
    return createErrorResponse(
      '请求方法不支持，仅支持POST请求', 
      HTTP_STATUS.METHOD_NOT_ALLOWED
    );
  }

  try {
    const body = await request.json();
    
    if (!body || !body.id || !body.title || !body.icon) {
      return createErrorResponse(
        '分类信息不完整，需要提供id、title和icon',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const kvManager = new KVStorageManager(env.NAVIGATION_KV);
    
    // 获取当前数据
    let currentData = await kvManager.getNavigationData();
    if (!currentData) {
      currentData = navigationData;
    }

    // 检查分类ID是否已存在
    const existingCategory = currentData.categories.find(cat => cat.id === body.id);
    if (existingCategory) {
      return createErrorResponse(
        '分类ID已存在，请使用不同的ID',
        HTTP_STATUS.CONFLICT
      );
    }

    // 添加新分类：结构变化，直接快照一次写入
    const newCategory = {
      id: body.id,
      title: body.title,
      icon: body.icon,
      sites: body.sites || []
    };
    // 插入到“未分类”之前：若存在未分类，则在其前一位插入；否则追加到末尾
    const uncIndex = currentData.categories.findIndex(c => c && (c.id === 'uncategorized' || c.title === '未分类'));
    if (uncIndex >= 0) {
      currentData.categories.splice(uncIndex, 0, newCategory);
    } else {
      currentData.categories.push(newCategory);
    }
    if (kvManager.isAvailable()) {
      await kvManager.saveNavigationData(currentData);
    }

    return createSuccessResponse({
      message: '分类添加成功',
      category: newCategory
    });
  } catch (error) {
    console.error('添加分类失败:', error);
    return createErrorResponse(
      '添加分类失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * 处理更新分类请求
 * PUT /api/admin/categories/:id
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @param {string} categoryId - 分类ID
 * @returns {Promise<Response>} 响应对象
 */
export async function handleUpdateCategory(request, env, categoryId) {
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
      currentData = navigationData;
    }

    // 查找要更新的分类
    const categoryIndex = currentData.categories.findIndex(cat => cat.id === categoryId);
    if (categoryIndex === -1) {
      return createErrorResponse(
        '分类不存在',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 更新分类：若仅 sites 变更则局部写，否则快照写
    const prevCategory = currentData.categories[categoryIndex];
    const updatedCategory = {
      ...prevCategory,
      ...body,
      id: categoryId // 确保ID不被修改
    };

    const sameTitle = (prevCategory.title === updatedCategory.title);
    const sameIcon = (prevCategory.icon === updatedCategory.icon);
    const safePrevSites = Array.isArray(prevCategory.sites) ? prevCategory.sites : [];
    const safeNewSites = Array.isArray(updatedCategory.sites) ? updatedCategory.sites : [];
    const sameSites = JSON.stringify(safePrevSites) === JSON.stringify(safeNewSites);

    if (sameTitle && sameIcon && !sameSites) {
      // 仅 sites 变更，局部聚合写入
      await kvManager.putFolderNodesBulk([{ segments: [updatedCategory.title], node: { sites: safeNewSites } }]);
    } else {
      // 结构或元数据变更，回退快照写入
      currentData.categories[categoryIndex] = updatedCategory;
      if (kvManager.isAvailable()) {
        await kvManager.saveNavigationData(currentData);
      }
    }

    return createSuccessResponse({
      message: '分类更新成功',
      category: updatedCategory
    });
  } catch (error) {
    console.error('更新分类失败:', error);
    return createErrorResponse(
      '更新分类失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * 处理删除分类请求
 * DELETE /api/admin/categories/:id
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境对象
 * @param {string} categoryId - 分类ID
 * @returns {Promise<Response>} 响应对象
 */
export async function handleDeleteCategory(request, env, categoryId) {
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
      currentData = navigationData;
    }

    // 查找要删除的分类
    const categoryIndex = currentData.categories.findIndex(cat => cat.id === categoryId);
    if (categoryIndex === -1) {
      return createErrorResponse(
        '分类不存在',
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 删除分类：结构变化，直接快照一次写入
    const deletedCategory = currentData.categories.splice(categoryIndex, 1)[0];
    if (kvManager.isAvailable()) {
      await kvManager.saveNavigationData(currentData);
    }

    return createSuccessResponse({
      message: '分类删除成功',
      category: deletedCategory
    });
  } catch (error) {
    console.error('删除分类失败:', error);
    return createErrorResponse(
      '删除分类失败', 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
