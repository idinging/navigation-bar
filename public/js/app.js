/**
 * 主应用模块
 * 负责应用的初始化和整体逻辑
 */

import { ApiClient, ThemeManager, SearchManager, NotificationManager } from './utils.js';
import { NavigationRenderer, StatsManager } from './navigation.js';
import { BackgroundAnimator } from './background.js';

/**
 * 主应用类
 */
class NavigationApp {
  constructor() {
    this.apiClient = new ApiClient();
    this.themeManager = new ThemeManager();
    this.notificationManager = new NotificationManager();
    this.statsManager = new StatsManager();
    this.backgroundAnimator = null;
    this.navigationData = null;
    
    // 初始化搜索管理器
    this.searchManager = new SearchManager((query) => {
      this.handleSearch(query);
    });
    
    // 初始化导航渲染器
    this.navigationRenderer = new NavigationRenderer(
      document.getElementById('content-container'),
      this.searchManager
    );
  }

  /**
   * 初始化应用
   */
  async init() {
    try {
      // 初始化背景动画
      this.initBackgroundAnimation();
      
      // 绑定事件
      this.bindEvents();
      
      // 加载数据
      await this.loadData();

      // 按 hash 初始化导航
      this.initHashRouter();
      
    } catch (error) {
      console.error('应用初始化失败:', error);
      this.notificationManager.error('应用初始化失败');
    }
  }

  /**
   * 初始化背景动画
   */
  initBackgroundAnimation() {
    try {
      this.backgroundAnimator = new BackgroundAnimator();
    } catch (error) {
      console.error('背景动画初始化失败:', error);
    }
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 主题切换
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        this.themeManager.toggle();
      });
    }

    // 搜索功能
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      this.searchManager.init();
      this.searchManager.bindSearchInput(searchInput);
    }

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K 聚焦搜索框
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (searchInput) {
          searchInput.focus();
        }
      }
    });
  }

  /**
   * 加载数据
   */
  async loadData() {
    try {
      // 显示加载状态
      this.statsManager.showLoading();
      this.navigationRenderer.container.innerHTML = '<div class="loading">正在加载导航数据...</div>';

      // 并行加载导航数据和统计信息
      const [navigationData, statsData] = await Promise.all([
        this.apiClient.get('/api/navigation'),
        this.apiClient.get('/api/stats')
      ]);

      // 保存数据
      this.navigationData = navigationData;

      // 更新UI
      this.statsManager.updateStats(statsData);
      this.navigationRenderer.renderCategories(navigationData.categories);

      // 数据加载后再应用 hash 导航
      this.applyHashIfPresent();

    } catch (error) {
      console.error('加载数据失败:', error);
      this.navigationRenderer.container.innerHTML = 
        '<div class="error">加载失败，请刷新页面重试</div>';
      this.notificationManager.error('加载数据失败');
    }
  }

  /**
   * 初始化 hash 路由
   * 支持格式：#nav=Top[/Child[/Grand]]
   */
  initHashRouter() {
    window.addEventListener('hashchange', () => this.applyHashIfPresent());
    // 首次进入时也尝试应用
    this.applyHashIfPresent();
  }

  /**
   * 解析并应用当前 hash
   */
  applyHashIfPresent() {
    try {
      const hash = (window.location.hash || '').replace(/^#/, '');
      if (!hash || !hash.startsWith('nav=')) return;
      const payload = hash.slice(4);
      if (!payload) return;
      const parts = payload.split('/').map(s => decodeURIComponent(s)).filter(Boolean);
      if (parts.length === 0) return;
      // 当分类已渲染
      if (Array.isArray(this.navigationRenderer.categories) && this.navigationRenderer.categories.length > 0) {
        this.navigationRenderer.navigateToPath(parts);
      }
    } catch (_) {}
  }

  /**
   * 处理搜索
   * @param {string} query - 搜索关键词
   */
  async handleSearch(query) {
    if (!query) {
      // 显示所有分类
      if (this.navigationData) {
        this.navigationRenderer.renderCategories(this.navigationData.categories);
      }
      return;
    }

    try {
      // 调用搜索API
      const searchResponse = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const searchData = await searchResponse.json();

      if (searchData.success) {
        this.navigationRenderer.renderSearchResults(searchData.data, query);
      } else {
        console.error('搜索失败:', searchData.error);
        this.notificationManager.error('搜索失败');
      }
    } catch (error) {
      console.error('搜索请求失败:', error);
      this.notificationManager.error('搜索请求失败');
    }
  }

  /**
   * 重新加载数据
   */
  async reload() {
    await this.loadData();
    this.notificationManager.success('数据已刷新');
  }
}

// 全局变量，便于调试和扩展
window.navigationApp = null;

// 应用启动
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 开发/生产均仅使用 KV：清理本地存储避免混淆（保留主题）
    try {
      const theme = localStorage.getItem('theme');
      localStorage.clear();
      sessionStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
    } catch (_) {}

    window.navigationApp = new NavigationApp();
    await window.navigationApp.init();
  } catch (error) {
    console.error('应用启动失败:', error);
  }
});

// 导出主应用类
export default NavigationApp;
