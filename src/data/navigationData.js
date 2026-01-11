/**
 * 导航数据配置模块
 * 负责提供网站导航的基础数据结构
 */

/**
 * 个人资料配置
 */
export const profileConfig = {
  name: "My Navigation",
  subtitle: "我的个人导航网站",
  avatar: "https://blog.iding.qzz.io/img/avatar.png",
  description: "收集整理常用网站，打造专属导航空间"
};

/**
 * 站点初始化默认字段
 * - favicon: 站点图标（可为 dataURL 或 URL），默认空
 * - faviconUpdatedAt: 上次刷新时间戳（ms），默认 0 表示未刷新
 */
const withSiteDefaults = (sites) => (Array.isArray(sites) ? sites.map(s => ({
  favicon: '',
  faviconUpdatedAt: 0,
  ...s
})) : []);

/**
 * 开发工具分类网站
 */
const devToolsSites = withSiteDefaults([
  {
    title: "GitHub",
    description: "代码托管平台",
    url: "https://github.com",
    icon: "🐙"
  },
  {
    title: "Stack Overflow",
    description: "程序员问答社区",
    url: "https://stackoverflow.com",
    icon: "🔧"
  },
  {
    title: "CodePen",
    description: "前端代码演示",
    url: "https://codepen.io",
    icon: "🎨"
  },
  {
    title: "MDN",
    description: "Web开发文档",
    url: "https://developer.mozilla.org",
    icon: "📚"
  }
]);

/**
 * 设计资源分类网站
 */
const designSites = withSiteDefaults([
  {
    title: "Figma",
    description: "在线设计工具",
    url: "https://figma.com",
    icon: "🎯"
  },
  {
    title: "Unsplash",
    description: "高质量免费图片",
    url: "https://unsplash.com",
    icon: "📸"
  },
  {
    title: "Dribbble",
    description: "设计师作品展示",
    url: "https://dribbble.com",
    icon: "🏀"
  },
  {
    title: "Behance",
    description: "创意作品平台",
    url: "https://behance.net",
    icon: "🎭"
  }
]);

/**
 * 效率工具分类网站
 */
const productivitySites = withSiteDefaults([
  {
    title: "Notion",
    description: "全能笔记工具",
    url: "https://notion.so",
    icon: "📝"
  },
  {
    title: "Todoist",
    description: "任务管理应用",
    url: "https://todoist.com",
    icon: "✅"
  },
  {
    title: "Calendly",
    description: "会议安排工具",
    url: "https://calendly.com",
    icon: "📅"
  },
  {
    title: "Slack",
    description: "团队沟通工具",
    url: "https://slack.com",
    icon: "💬"
  }
]);

/**
 * 学习资源分类网站
 */
const learningSites = withSiteDefaults([
  {
    title: "Coursera",
    description: "在线课程平台",
    url: "https://coursera.org",
    icon: "🎓"
  },
  {
    title: "YouTube",
    description: "视频学习平台",
    url: "https://youtube.com",
    icon: "📹"
  },
  {
    title: "Medium",
    description: "技术文章平台",
    url: "https://medium.com",
    icon: "📄"
  },
  {
    title: "掘金",
    description: "中文技术社区",
    url: "https://juejin.cn",
    icon: "💎"
  }
]);

/**
 * 导航分类配置
 */
export const navigationCategories = [
  // 开发工具：保留一个示例分类，便于演示
  {
    id: "dev-tools",
    title: "开发工具",
    icon: "💻",
    sites: devToolsSites,
    children: []
  },
  // 未分类：稳定ID，默认空站点集（固定放最后）
  {
    id: "uncategorized",
    title: "未分类",
    icon: "📁",
    sites: withSiteDefaults([]),
    children: []
  }
];

/**
 * 完整导航数据结构
 */
export const navigationData = {
  profile: profileConfig,
  categories: navigationCategories
};

/**
 * 获取所有网站列表（扁平化）
 */
export function getAllSites() {
  /**
   * 递归展开分类，生成带有分类路径信息的网站列表
   * @param {Array} categories - 分类数组
   * @param {Array<string>} pathTitles - 标题路径
   * @param {Array<string>} pathIds - ID路径
   * @returns {Array}
   */
  const flatten = (categories, pathTitles = [], pathIds = []) => {
    if (!Array.isArray(categories) || categories.length === 0) return [];
    let result = [];
    for (const cat of categories) {
      const titles = [...pathTitles, cat.title];
      const ids = [...pathIds, cat.id || ""];
      const sites = Array.isArray(cat.sites) ? cat.sites : [];
      result = result.concat(
        sites.map(site => ({
          ...site,
          category: titles.join(' / '),
          categoryId: ids.filter(Boolean).join('/')
        }))
      );
      const children = Array.isArray(cat.children) ? cat.children : [];
      if (children.length > 0) {
        result = result.concat(flatten(children, titles, ids));
      }
    }
    return result;
  };

  return flatten(navigationCategories);
}

/**
 * 获取统计信息
 */
export function getNavigationStats() {
  /**
   * 递归统计分类数量与站点数量
   * @param {Array} categories
   * @returns {{cat:number, sites:number}}
   */
  const count = (categories) => {
    if (!Array.isArray(categories) || categories.length === 0) {
      return { cat: 0, sites: 0 };
    }
    return categories.reduce((acc, cat) => {
      const selfSites = Array.isArray(cat.sites) ? cat.sites.length : 0;
      const children = Array.isArray(cat.children) ? cat.children : [];
      const childCount = count(children);
      return { cat: acc.cat + 1 + childCount.cat, sites: acc.sites + selfSites + childCount.sites };
    }, { cat: 0, sites: 0 });
  };

  const res = count(navigationCategories);
  
  return {
    totalCategories: res.cat,
    totalSites: res.sites,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * 根据关键词搜索网站
 * @param {string} query - 搜索关键词
 * @returns {Array} 搜索结果
 */
export function searchSites(query) {
  if (!query || typeof query !== 'string') {
    return [];
  }
  
  const searchTerm = query.toLowerCase().trim();
  const allSites = getAllSites();
  
  return allSites.filter(site => 
    site.title.toLowerCase().includes(searchTerm) ||
    site.description.toLowerCase().includes(searchTerm) ||
    site.category.toLowerCase().includes(searchTerm)
  );
}

/**
 * 获取数据源优先级的导航数据
 * 优先使用KV存储数据，如果不存在则使用默认数据
 * @param {KVStorageManager} kvManager - KV存储管理器
 * @returns {Promise<Object>} 导航数据
 */
export async function getNavigationDataWithFallback(kvManager) {
  if (!kvManager || !kvManager.isAvailable()) {
    throw new Error('KV storage is not available');
  }

  // 优先读取 KV，若为空则用默认数据初始化 KV 再返回
  const kvData = await kvManager.getNavigationData();
  if (kvData) {
    return kvData;
  }

  await kvManager.saveNavigationData(navigationData);
  const initialized = await kvManager.getNavigationData();
  return initialized || navigationData;
}
