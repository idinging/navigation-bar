/**
 * KV存储工具模块
 * 负责处理Cloudflare KV存储操作
 */

/**
 * KV存储键名常量
 */
export const KV_KEYS = {
  NAVIGATION_DATA: 'navigation_data',
  NAVIGATION_CONFIG: 'navigation_config',
  LAST_UPDATED: 'last_updated'
};

/**
 * 分层导航KV常量
 */
const NAV_PREFIX = 'nav:';
const ROOT_KEY = `${NAV_PREFIX}__root__`;
const SNAPSHOT_KEY = `${NAV_PREFIX}__snapshot__`;
const FAV_PREFIX = 'fav:'; // 站点favicon存储前缀，按host命名

/**
 * 对目录名进行编码，确保可作为KV键的一部分
 * @param {string} segment
 * @returns {string}
 */
function encodeSegment(segment) {
  return encodeURIComponent(String(segment || '').trim());
}

/**
 * 由路径段生成层级键名
 * @param {string[]} segments - 目录标题路径（从顶层到当前）
 * @returns {string}
 */
function buildKeyFromSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return ROOT_KEY;
  return `${NAV_PREFIX}${segments.map(encodeSegment).join('/')}`;
}

/**
 * 生成稳定的分类ID（基于路径，便于前端引用）
 * @param {string[]} segments
 * @returns {string}
 */
function generateCategoryIdFromPath(segments) {
  const slugify = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-\/]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$|\/$/g, '');
  return slugify(segments.join('/')) || 'root';
}

/**
 * KV存储管理器
 */
export class KVStorageManager {
  constructor(kvNamespace) {
    this.kv = kvNamespace;
    /**
     * 每请求级别的轻量缓存（仅存活于单次worker执行期间）
     * 用于减少同一请求内重复的 KV 读取
     * 结构：key -> { format: 'json'|'text', value: any }
     */
    this._cache = new Map();
  }

  /**
   * 检查KV是否可用
   * @returns {boolean} KV是否可用
   */
  isAvailable() {
    return this.kv !== undefined && this.kv !== null;
  }

  /**
   * 获取导航数据
   * @returns {Promise<Object|null>} 导航数据或null
   */
  async getNavigationData() {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const cacheKey = `${SNAPSHOT_KEY}::json`;
      if (this._cache.has(cacheKey)) {
        return this._cache.get(cacheKey);
      }
      const snapshot = await this.kv.get(SNAPSHOT_KEY, 'json');
      if (snapshot) this._cache.set(cacheKey, snapshot);
      if (snapshot && snapshot.categories) return snapshot;
      return null;
    } catch (error) {
      console.error('获取KV导航数据失败:', error);
      return null;
    }
  }

  /**
   * 保存导航数据
   * @param {Object} navigationData - 导航数据
   * @returns {Promise<boolean>} 是否保存成功
   */
  async saveNavigationData(navigationData) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      // 优先写入快照（单键写入）
      await this.kv.put(SNAPSHOT_KEY, JSON.stringify(navigationData || { profile: {}, categories: [] }));
      // 写后更新请求级缓存
      try { this._cache.set(`${SNAPSHOT_KEY}::json`, navigationData || { profile: {}, categories: [] }); } catch (_) {}

      // 更新时间
      await this.#touchLastUpdated();

      return true;
    } catch (error) {
      console.error('保存KV导航数据失败:', error);
      return false;
    }
  }

  /**
   * 删除指定前缀的所有KV键
   * @param {string} prefix
   */
  async #deleteAllWithPrefix(prefix) {
    let cursor = undefined;
    for (let guard = 0; guard < 100; guard++) {
      const listResult = await this.kv.list({ prefix, cursor });
      const keys = (listResult && Array.isArray(listResult.keys)) ? listResult.keys : [];
      if (keys.length > 0) {
        await Promise.all(keys.map(k => this.kv.delete(k.name)));
      }
      if (!listResult || listResult.list_complete) break;
      cursor = listResult.cursor;
    }
  }

  /**
   * 将整体导航数据保存为分层结构
   * @param {Object} navigationData - { profile, categories }
   * @returns {Promise<void>}
   */
  // 分层写入模式已废弃：系统仅使用快照（SNAPSHOT_KEY）

  /**
   * 读取分层结构并构建 categories 树
   * @param {string[]} topTitles - 顶层分类标题数组
   * @returns {Promise<Array>}
   */
  // 分层读取模式已废弃

  /**
   * 获取单个目录节点（仅当前层级的站点与子目录名）
   * @param {string[]} segments - 目录路径
   * @returns {Promise<{title:string, sites:Array, children:Array}>}
   */
  async getFolderNode(segments) {
    // 仅从快照中读取（带请求级缓存）
    const snapshot = await this.getNavigationData();
    if (snapshot && Array.isArray(snapshot.categories)) {
      const findNode = (cats, idx) => {
        if (idx >= segments.length) return null;
        const t = segments[idx];
        const hit = cats.find(c => c && c.title === t);
        if (!hit) return null;
        if (idx === segments.length - 1) return hit;
        return findNode(hit.children || [], idx + 1);
      };
      const target = segments.length === 0 ? { title: '__root__', sites: snapshot.sites || [], children: snapshot.categories } : findNode(snapshot.categories, 0);
      if (target) {
        return {
          title: target.title,
          sites: Array.isArray(target.sites) ? target.sites : [],
          children: Array.isArray(target.children) ? target.children : []
        };
      }
    }
    return { title: segments && segments.length ? segments[segments.length - 1] : '__root__', sites: [], children: [] };
  }

  /**
   * 覆盖写入单个目录节点
   * @param {string[]} segments
   * @param {{title:string, sites:Array, children:Array}} node
   */
  async putFolderNode(segments, node) {
    // 仅更新快照中的对应节点（单键写入）
    const snapshot = await this.getNavigationData();
    if (snapshot && Array.isArray(snapshot.categories)) {
      const updateNode = (cats, idx) => {
        const t = segments[idx];
        const hit = cats.find(c => c && c.title === t);
        if (!hit) return false;
        if (idx === segments.length - 1) {
          hit.sites = Array.isArray(node && node.sites) ? node.sites : [];
          // children/title 保持不变（避免结构破坏）
          return true;
        }
        return updateNode(hit.children || [], idx + 1);
      };
      const ok = segments.length === 0 ? false : updateNode(snapshot.categories, 0);
      if (ok) {
        await this.kv.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
        try { this._cache.set(`${SNAPSHOT_KEY}::json`, snapshot); } catch (_) {}
        await this.#touchLastUpdated();
        return;
      }
    }
    // 若无快照则忽略（初始化流程会保证存在快照）
  }

  /**
   * 批量覆盖写入多个目录节点（优先更新快照，单次写入）
   * 仅更新各节点的 sites 字段，保持 title/children 不变
   * 当快照不存在时回退为分别写入分层键
   * @param {Array<{segments: string[], node: {title?: string, sites: Array, children?: Array}}>} updates
   * @returns {Promise<void>}
   */
  async putFolderNodesBulk(updates) {
    if (!Array.isArray(updates) || updates.length === 0) return;
    // 去重：同一路径仅以最后一个为准
    const pathKey = (segs) => (Array.isArray(segs) ? segs.map(s => String(s || '').trim()).filter(Boolean).join('/') : '');
    const dedup = new Map();
    for (const u of updates) {
      const key = pathKey(u && u.segments);
      if (!key) continue;
      dedup.set(key, u);
    }

    // 合并到内存快照，一次写入
    const snapshot = await this.getNavigationData();
    if (snapshot && Array.isArray(snapshot.categories)) {
      const updateNode = (cats, segs, idx) => {
        if (!Array.isArray(cats) || idx >= segs.length) return false;
        const t = segs[idx];
        const hit = cats.find(c => c && c.title === t);
        if (!hit) return false;
        if (idx === segs.length - 1) {
          const src = dedup.get(pathKey(segs));
          const safeSites = Array.isArray(src && src.node && src.node.sites) ? src.node.sites : [];
          hit.sites = safeSites;
          return true;
        }
        return updateNode(hit.children || [], segs, idx + 1);
      };

      for (const [k, u] of dedup.entries()) {
        const segs = k.split('/').filter(Boolean);
        if (segs.length === 0) continue;
        updateNode(snapshot.categories, segs, 0);
      }

      await this.kv.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
      try { this._cache.set(`${SNAPSHOT_KEY}::json`, snapshot); } catch (_) {}
      await this.#touchLastUpdated();
      return;
    }
    // 若无快照则忽略（初始化流程会保证存在快照）
  }

  /**
   * 从旧结构迁移到分层结构（不会删除旧数据）
   * @returns {Promise<{migrated:boolean, categories:number}>}
   */
  // 旧结构迁移方法已移除，系统仅支持分层结构

  /**
   * 获取配置信息
   * @returns {Promise<Object|null>} 配置信息或null
   */
  async getConfig() {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const cacheKey = `${KV_KEYS.NAVIGATION_CONFIG}::json`;
      if (this._cache.has(cacheKey)) return this._cache.get(cacheKey) || {};
      const config = await this.kv.get(KV_KEYS.NAVIGATION_CONFIG, 'json');
      if (config) this._cache.set(cacheKey, config);
      return config || {};
    } catch (error) {
      console.error('获取KV配置失败:', error);
      return null;
    }
  }

  /**
   * 保存配置信息
   * @param {Object} config - 配置信息
   * @returns {Promise<boolean>} 是否保存成功
   */
  async saveConfig(config) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      await this.kv.put(KV_KEYS.NAVIGATION_CONFIG, JSON.stringify(config));
      try { this._cache.set(`${KV_KEYS.NAVIGATION_CONFIG}::json`, config || {}); } catch (_) {}
      return true;
    } catch (error) {
      console.error('保存KV配置失败:', error);
      return false;
    }
  }

  /**
   * 获取最后更新时间
   * @returns {Promise<string|null>} 最后更新时间或null
   */
  async getLastUpdated() {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const cacheKey = `${KV_KEYS.LAST_UPDATED}::text`;
      if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);
      const v = await this.kv.get(KV_KEYS.LAST_UPDATED);
      this._cache.set(cacheKey, v);
      return v;
    } catch (error) {
      console.error('获取最后更新时间失败:', error);
      return null;
    }
  }

  /**
   * 删除所有数据
   * @returns {Promise<boolean>} 是否删除成功
   */
  async clearAll() {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      // 删除分层结构与favicon的所有键
      await this.#deleteAllWithPrefix(NAV_PREFIX);
      await this.#deleteAllWithPrefix(FAV_PREFIX);
      await Promise.all([
        // 同时清理历史键位，避免旧版残留
        this.kv.delete(KV_KEYS.NAVIGATION_DATA),
        this.kv.delete(KV_KEYS.NAVIGATION_CONFIG),
        this.kv.delete(KV_KEYS.LAST_UPDATED)
      ]);
      try { this._cache.clear(); } catch (_) {}
      return true;
    } catch (error) {
      console.error('清除KV数据失败:', error);
      return false;
    }
  }

  /**
   * 获取存储状态信息
   * @returns {Promise<Object>} 存储状态信息
   */
  async getStorageInfo() {
    if (!this.isAvailable()) {
      return {
        available: false,
        hasData: false,
        lastUpdated: null
      };
    }

    try {
      // 仅通过列出前缀判断是否有数据，避免读操作触发任何写入
      const [listResult, lastUpdated] = await Promise.all([
        this.kv.list({ prefix: NAV_PREFIX }),
        this.getLastUpdated()
      ]);
      const hasData = !!(listResult && Array.isArray(listResult.keys) && listResult.keys.length > 0);

      let dataSize = 0;
      if (hasData) {
        const data = await this.getNavigationData();
        dataSize = data ? JSON.stringify(data).length : 0;
      }

      return {
        available: true,
        hasData,
        lastUpdated: lastUpdated,
        dataSize
      };
    } catch (error) {
      console.error('获取存储信息失败:', error);
      return {
        available: true,
        hasData: false,
        lastUpdated: null,
        error: error.message
      };
    }
  }

  /**
   * 读取已缓存的favicon
   * @param {string} host - 站点主机名，例如 example.com
   * @returns {Promise<{contentType:string, data:string}|null>} data为base64字符串
   */
  async getFavicon(host) {
    if (!this.isAvailable()) return null;
    const key = `${FAV_PREFIX}${encodeSegment(host || '')}`;
    try {
      const cacheKey = `${key}::json`;
      if (this._cache.has(cacheKey)) return this._cache.get(cacheKey) || null;
      const stored = await this.kv.get(key, 'json');
      if (!stored || !stored.data || !stored.contentType) return null;
      try { this._cache.set(cacheKey, stored); } catch (_) {}
      return stored;
    } catch (e) {
      console.warn('读取favicon失败:', e);
      return null;
    }
  }

  /**
   * 写入favicon
   * @param {string} host - 主机名
   * @param {string} contentType - MIME类型，如 image/png
   * @param {string} base64Data - Base64编码数据（不含data:头部）
   * @returns {Promise<boolean>}
   */
  async putFavicon(host, contentType, base64Data) {
    if (!this.isAvailable()) return false;
    const key = `${FAV_PREFIX}${encodeSegment(host || '')}`;
    try {
      // 先读取现有（优先使用请求级缓存），若内容一致则跳过写入
      let existing = null;
      const cacheKey = `${key}::json`;
      if (this._cache.has(cacheKey)) {
        existing = this._cache.get(cacheKey);
      } else {
        existing = await this.kv.get(key, 'json').catch(() => null);
      }
      if (existing && existing.data === base64Data && existing.contentType === contentType) {
        return true;
      }
      await this.kv.put(key, JSON.stringify({ contentType, data: base64Data, updatedAt: Date.now() }));
      try { this._cache.set(cacheKey, { contentType, data: base64Data, updatedAt: Date.now() }); } catch (_) {}
      return true;
    } catch (e) {
      console.error('写入favicon失败:', e);
      return false;
    }
  }

  /**
   * 刷新最后更新时间（导航数据发生变更时调用）
   * @returns {Promise<void>}
   */
  async #touchLastUpdated() {
    try {
      await this.kv.put(KV_KEYS.LAST_UPDATED, new Date().toISOString());
      try { this._cache.set(`${KV_KEYS.LAST_UPDATED}::text`, new Date().toISOString()); } catch (_) {}
    } catch (error) {
      console.warn('刷新最后更新时间失败:', error);
    }
  }
}
