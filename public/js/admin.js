/**
 * 管理后台主模块
 * 负责管理后台的所有功能
 */

import { ApiClient, ThemeManager, NotificationManager, ActionGuard } from './utils.js';
import { BackgroundAnimator } from './background.js';

/**
 * 管理后台应用类
 */
class AdminApp {
  constructor() {
    this.apiClient = new ApiClient();
    this.themeManager = new ThemeManager();
    this.notificationManager = new NotificationManager();
    this.backgroundAnimator = null;
    this.adminData = null;
    this.currentTab = 'categories';
    this.faviconVersion = 0; // 用于强制刷新 /api/favicon 的版本参数
    
    // 模态框相关
    this.modal = document.getElementById('modal-overlay');
    this.modalTitle = document.getElementById('modal-title');
    this.modalBody = document.getElementById('modal-body');
    this.modalConfirm = document.getElementById('modal-confirm');
    this.modalCancel = document.getElementById('modal-cancel');
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
      
      // 管理认证（JWT 优先）
      await this.ensureAdminAuth();

      // 加载数据
      await this.loadAdminData();
      
      // 初始化Hash导航
      this.initHashNavigation();
      
    } catch (error) {
      console.error('管理后台初始化失败:', error);
      this.notificationManager.error('管理后台初始化失败');
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

    // 标签页切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTab(e.target.dataset.tab); // 这里会自动更新hash
      });
    });

    // 同步数据按钮
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
      ActionGuard.bind(syncBtn, () => this.syncData(), { loadingText: '同步中...', successTip: '同步完成', errorTip: '同步失败' });
    }

    // 排序顶层分类
    const sortTopBtn = document.getElementById('sort-categories');
    if (sortTopBtn) {
      ActionGuard.bind(sortTopBtn, () => this.showSortTopCategoriesModal(), { loadingText: '打开中...' });
    }

    // 添加分类按钮
    const addCategoryBtns = document.querySelectorAll('#add-category-btn, #add-category');
    addCategoryBtns.forEach(btn => {
      ActionGuard.bind(btn, () => this.showAddCategoryModal(), { loadingText: '打开中...' });
    });

    // 添加网站与批量操作按钮
    const addSiteBtn = document.getElementById('add-site');
    if (addSiteBtn) {
      ActionGuard.bind(addSiteBtn, () => this.showAddSiteModal(), { loadingText: '打开中...' });
    }
    const refreshAllSitesBtn = document.getElementById('refresh-all-fav-sites');
    if (refreshAllSitesBtn) {
      ActionGuard.bind(refreshAllSitesBtn, () => this.showRefreshAllFavConfirm(), { loadingText: '打开中...' });
    }
    const bulkDeleteBtn = document.getElementById('bulk-delete');
    if (bulkDeleteBtn) {
      ActionGuard.bind(bulkDeleteBtn, () => this.handleBulkDelete(), { loadingText: '准备中...' });
    }
    const bulkMoveBtn = document.getElementById('bulk-move');
    if (bulkMoveBtn) {
      ActionGuard.bind(bulkMoveBtn, () => this.showBulkMoveModal(), { loadingText: '准备中...' });
    }
    const bulkEditBtn = document.getElementById('bulk-edit');
    if (bulkEditBtn) {
      ActionGuard.bind(bulkEditBtn, () => this.showBulkEditModal(), { loadingText: '准备中...' });
    }

    // 模态框事件
    this.bindModalEvents();

    // 设置页面事件
    this.bindSettingsEvents();

    // 搜索过滤事件
    this.bindSearchEvents();
  }

  /**
   * 绑定模态框事件
   */
  bindModalEvents() {
    // 关闭模态框
    const closeModal = () => this.hideModal();
    
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    this.modalCancel.addEventListener('click', closeModal);
    
    // 点击遮罩关闭
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        closeModal();
      }
    });

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('show')) {
        closeModal();
      }
    });
  }

  /**
   * 绑定设置页面事件
   */
  bindSettingsEvents() {
    // 导出数据
    const exportBtn = document.getElementById('export-data');
    if (exportBtn) {
      ActionGuard.bind(exportBtn, () => this.exportData(), { loadingText: '导出中...', successTip: '导出完成', errorTip: '导出失败' });
    }

    // 导入数据
    const importBtn = document.getElementById('import-data');
    if (importBtn) {
      ActionGuard.bind(importBtn, () => this.showImportDataModal(), { loadingText: '打开中...' });
    }

    // 重置数据
    const resetBtn = document.getElementById('reset-data');
    if (resetBtn) {
      ActionGuard.bind(resetBtn, () => this.showResetDataModal(), { loadingText: '打开中...' });
    }

    // 清除缓存
    const clearCacheBtn = document.getElementById('clear-cache');
    if (clearCacheBtn) {
      ActionGuard.bind(clearCacheBtn, () => this.clearCache(), { loadingText: '清理中...', successTip: '已清理缓存', errorTip: '清理失败' });
    }

    // 刷新数据
    const refreshBtn = document.getElementById('refresh-data');
    if (refreshBtn) {
      ActionGuard.bind(refreshBtn, () => this.loadAdminData(), { loadingText: '刷新中...' });
    }

    // 刷新全部 favicon（超过7天的自动刷新）
    const refreshAllFavBtn = document.getElementById('refresh-all-fav');
    if (refreshAllFavBtn) {
      ActionGuard.bind(refreshAllFavBtn, () => this.showRefreshAllFavConfirm(), { loadingText: '打开中...' });
    }

    // 导入Chrome书签
    const importBookmarksBtn = document.getElementById('import-bookmarks-btn');
    if (importBookmarksBtn) {
      ActionGuard.bind(importBookmarksBtn, () => this.importBookmarks(), { loadingText: '导入中...' });
    }
    
    // 文件上传区域事件
    this.initFileUpload();
  }

  /**
   * 显示刷新全部 favicon 的二级确认
   */
  showRefreshAllFavConfirm() {
    const bodyHtml = `
      <div class="warning-message">
        <div class="warning-icon">⚠️</div>
        <div class="warning-content">
          <h4>刷新全部网站图标（favicon）</h4>
          <p>该操作将尝试为所有站点重新抓取图标并写入缓存，</p>
          <p>在站点较多时会产生较高的写入量与网络请求。</p>
          <ul class="warning-list">
            <li>🔄 强制刷新所有站点图标缓存</li>
            <li>🕒 过程可能较长，请耐心等待</li>
          </ul>
          <p class="warning-advice">💡 建议在必要时执行，避免频繁触发</p>
        </div>
      </div>
    `;
    this.showModal('刷新全部图标', bodyHtml, async () => {
      await this.apiClient.post('/api/admin/sites/favicon/refresh', { force: true });
      // 提升版本号以破坏浏览器缓存，然后刷新数据
      this.faviconVersion++;
      this.hideModal();
      await this.loadAdminData();
    }, { busyText: '正在刷新全部图标...', loadingText: '执行中...' });
  }
  
  /**
   * 初始化文件上传功能
   */
  initFileUpload() {
    const fileInput = document.getElementById('import-bookmarks-file');
    const uploadArea = document.getElementById('file-upload-area');
    const fileUploadBtn = uploadArea?.querySelector('.file-upload-btn');
    const fileSelectedInfo = document.getElementById('file-selected-info');
    const fileRemoveBtn = document.getElementById('file-remove-btn');
    const importBtn = document.getElementById('import-bookmarks-btn');
    
    if (!fileInput || !uploadArea) return;
    
    // 点击上传区域选择文件
    uploadArea.addEventListener('click', (e) => {
      if (e.target === fileUploadBtn) {
        fileInput.click();
      }
    });
    
    // 文件选择改变事件
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.showSelectedFile(file);
      }
    });
    
    // 拖拽事件
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type === 'text/html' || file.name.endsWith('.html') || file.name.endsWith('.htm')) {
          fileInput.files = files;
          this.showSelectedFile(file);
        } else {
          this.notificationManager.error('请选择HTML格式的书签文件');
        }
      }
    });
    
    // 移除文件按钮
    if (fileRemoveBtn) {
      fileRemoveBtn.addEventListener('click', () => {
        this.clearSelectedFile();
      });
    }
  }
  
  /**
   * 显示选中的文件信息
   */
  showSelectedFile(file) {
    const uploadArea = document.getElementById('file-upload-area');
    const fileSelectedInfo = document.getElementById('file-selected-info');
    const fileNameEl = document.getElementById('selected-file-name');
    const fileSizeEl = document.getElementById('selected-file-size');
    const importBtn = document.getElementById('import-bookmarks-btn');
    
    if (fileSelectedInfo && fileNameEl && fileSizeEl) {
      // 隐藏上传区域，显示文件信息
      uploadArea.style.display = 'none';
      fileSelectedInfo.style.display = 'block';
      
      // 设置文件信息
      fileNameEl.textContent = file.name;
      fileSizeEl.textContent = this.formatFileSize(file.size);
      
      // 启用导入按钮
      if (importBtn) {
        importBtn.disabled = false;
      }
    }
  }
  
  /**
   * 清除选中的文件
   */
  clearSelectedFile() {
    const fileInput = document.getElementById('import-bookmarks-file');
    const uploadArea = document.getElementById('file-upload-area');
    const fileSelectedInfo = document.getElementById('file-selected-info');
    const importBtn = document.getElementById('import-bookmarks-btn');
    
    // 清除文件输入
    if (fileInput) {
      fileInput.value = '';
    }
    
    // 显示上传区域，隐藏文件信息
    if (uploadArea) {
      uploadArea.style.display = 'block';
    }
    if (fileSelectedInfo) {
      fileSelectedInfo.style.display = 'none';
    }
    
    // 禁用导入按钮
    if (importBtn) {
      importBtn.disabled = true;
    }
  }
  
  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 确保已通过管理员认证
   */
  async ensureAdminAuth() {
    // 优先读取当前会话的缓存（仅会话有效）
    // 优先读取 JWT
    let token = null;
    try {
      token = sessionStorage.getItem('admin_jwt');
    } catch (_) {}

    if (!token) {
      // 未登录，跳转登录页
      window.location.href = '/admin-login.html';
      throw new Error('未登录');
    }
    this.apiClient.setAdminJWT(token);

    // 试探请求：校验密码是否正确
    try {
      await this.apiClient.get('/api/admin/data');
    } catch (e) {
      if (e && e.status === 401) {
        try { sessionStorage.removeItem('admin_jwt'); } catch (_) {}
        this.apiClient.setAdminJWT(null);
        window.location.replace('/admin-login.html');
        return;
      }
      throw e;
    }
  }

  /**
   * 绑定搜索事件
   */
  bindSearchEvents() {
    const searchInput = document.getElementById('admin-search');
    const categoryFilter = document.getElementById('category-filter');

    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.renderSites();
        }, 300);
      });
    }

    if (categoryFilter) {
      categoryFilter.addEventListener('change', () => this.renderSites());
    }
  }

  /**
   * 加载管理数据
   */
  async loadAdminData() {
    try {
      this.showLoading();
      
      const data = await this.apiClient.get('/api/admin/data');
      this.adminData = data;
      
      this.updateStats(data);
      this.renderCurrentTab();
      
      this.notificationManager.success('数据加载成功');
    } catch (error) {
      console.error('加载管理数据失败:', error);
      this.notificationManager.error('加载数据失败：' + error.message);
    }
  }

  /**
   * 更新统计信息
   */
  updateStats(data) {
    const totalSitesEl = document.getElementById('admin-total-sites');
    const totalCategoriesEl = document.getElementById('admin-total-categories');
    const dataSourceEl = document.getElementById('data-source');

    if (totalSitesEl) {
      const countRecursive = (node) => {
        let n = Array.isArray(node.sites) ? node.sites.length : 0;
        if (Array.isArray(node.children)) {
          for (const ch of node.children) n += countRecursive(ch);
        }
        return n;
      };
      const totalSites = data.data.categories.reduce((sum, cat) => sum + countRecursive(cat), 0);
      totalSitesEl.textContent = totalSites;
    }

    if (totalCategoriesEl) {
      const countCategories = (node) => {
        let n = 1;
        if (Array.isArray(node.children)) {
          for (const ch of node.children) n += countCategories(ch);
        }
        return n;
      };
      const totalCategories = Array.isArray(data && data.data && data.data.categories)
        ? data.data.categories.reduce((sum, cat) => sum + countCategories(cat), 0)
        : 0;
      totalCategoriesEl.textContent = totalCategories;
    }

    if (dataSourceEl) {
      const sourceText = data.dataSource === 'kv' ? 'KV存储' : '默认数据';
      dataSourceEl.textContent = sourceText;
    }
  }

  /**
   * 显示加载状态
   */
  showLoading() {
    document.getElementById('admin-total-sites').textContent = '-';
    document.getElementById('admin-total-categories').textContent = '-';
    document.getElementById('data-source').textContent = '-';
  }

  /**
   * 初始化Hash导航
   */
  initHashNavigation() {
    // 监听hash变化事件
    window.addEventListener('hashchange', () => {
      this.handleHashChange();
    });

    // 初始化时处理当前hash
    this.handleHashChange();
  }

  /**
   * 处理Hash变化
   */
  handleHashChange() {
    const hash = window.location.hash.slice(1); // 移除#号
    const validTabs = ['categories', 'sites', 'settings'];
    
    // 如果hash是有效的标签页名称，切换到对应标签页
    if (validTabs.includes(hash)) {
      this.switchTab(hash, false); // 不更新URL，避免循环
    } else {
      // 如果没有hash或hash无效，默认显示分类管理并设置hash
      this.switchTab('categories', true);
    }
  }

  /**
   * 切换标签页
   */
  switchTab(tabName, updateHash = true) {
    // 更新按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    const targetBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (targetBtn) {
      targetBtn.classList.add('active');
    }

    // 显示对应内容
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    const targetContent = document.getElementById(`tab-${tabName}`);
    if (targetContent) {
      targetContent.classList.add('active');
    }

    this.currentTab = tabName;

    // 更新URL hash（避免在处理hash变化时重复更新）
    if (updateHash && window.location.hash !== `#${tabName}`) {
      window.location.hash = tabName;
    }

    this.renderCurrentTab();
  }

  /**
   * 渲染当前标签页
   */
  renderCurrentTab() {
    if (!this.adminData) return;

    switch (this.currentTab) {
      case 'categories':
        this.renderCategories();
        break;
      case 'sites':
        this.renderSites();
        break;
      case 'settings':
        this.renderSettings();
        break;
    }
  }

  /**
   * 渲染分类管理
   */
  renderCategories() {
    const container = document.getElementById('categories-container');
    const categories = this.adminData.data.categories;

    if (!categories || categories.length === 0) {
      container.innerHTML = '<div class="no-results">暂无分类数据</div>';
      return;
    }

    // 分类图标渲染：支持 Emoji 或图片URL
    const hasImgIcon = (v) => (/^https?:\/\//i.test(v || '') || /^data:image\//i.test(v || ''));
    const renderIcon = (icon) => (icon
      ? (hasImgIcon(icon) ? `<img src="${icon}" alt="icon"/>` : icon)
      : '📁');

    // 顶层分类以卡片网格展示
    // 递归收集二/三级（及更深层）子分类，卡片下方仅以路径徽章标识
    const collectSubcategories = (node, indexPath, titlePath, out) => {
      if (!node || !Array.isArray(node.children)) return;
      node.children.forEach((child, idx) => {
        const childIndexPath = [...indexPath, idx];
        const childTitlePath = [...titlePath, child.title];
        out.push({ node: child, indexPath: childIndexPath, titlePath: childTitlePath });
        collectSubcategories(child, childIndexPath, childTitlePath, out);
      });
    };

    const renderSubCategoryGrid = (topIndex, root) => {
      const items = [];
      collectSubcategories(root, [topIndex], [root.title], items);
      if (items.length === 0) return '';
      return `
        <div class="subcategory-grid">
          ${items.map(({ node: ch, indexPath, titlePath }) => {
            const indexStr = indexPath.join('/');
            const breadcrumb = titlePath.join(' / ');
            return `
              <div class=\"subcategory-card\">\n                <div class=\"subcategory-header\">\n                  <div class=\"category-icon\">${renderIcon(ch.icon)}</div>\n                  <div class=\"subcategory-title\">${ch.title}</div>\n                </div>\n                <div class=\"subcategory-breadcrumb badge badge-muted\">${breadcrumb}</div>\n                <div class=\"subcategory-actions\" style=\"position:absolute; top:8px; right:8px;\">\n                  <button class=\"btn btn-sm\" onclick=\"adminApp.editCategoryByIndex('${indexStr}')\">编辑</button>\n                  <button class=\"btn btn-sm\" onclick=\"adminApp.sortSitesByIndex('${indexStr}')\">排序网站</button>\n                  <button class=\"btn btn-sm\" onclick=\"adminApp.sortChildrenByIndex('${indexStr}')\">排序子分类</button>\n                  <button class=\"btn btn-sm btn-danger\" onclick=\"adminApp.deleteCategoryByIndex('${indexStr}')\">删除</button>\n                </div>\n              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    // 将分类分组：有子分类的和没有子分类的
    const categoriesWithChildren = [];
    const categoriesWithoutChildren = [];

    categories.forEach((cat, i) => {
      const hasChildren = cat.children && cat.children.length > 0;
      const categoryData = { ...cat, index: i };
      
      if (hasChildren) {
        categoriesWithChildren.push(categoryData);
      } else {
        categoriesWithoutChildren.push(categoryData);
      }
    });

    const html = `
      <div class="categories-layout">
        ${categoriesWithoutChildren.length > 0 ? `
          <div class="simple-categories-grid">
            ${categoriesWithoutChildren.map(cat => `
              <div class="simple-category-card">
                <div class="category-icon">${renderIcon(cat.icon)}</div>
                <div class="category-title">${cat.title}</div>
                <div class="category-meta">0 个子分类</div>
                <div class="simple-category-actions">
                  <button class="btn btn-sm" onclick="adminApp.editCategoryByIndex('${cat.index}')">编辑</button>
                  <button class="btn btn-sm" onclick="adminApp.showAddSubcategoryModal('${cat.index}')">添加子分类</button>
                  <button class="btn btn-sm" onclick="adminApp.sortSitesByIndex('${cat.index}')">排序网站</button>
                  <button class="btn btn-sm btn-danger" onclick="adminApp.deleteCategoryByIndex('${cat.index}')">删除</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        ${categoriesWithChildren.length > 0 ? `
          <div class="complex-categories-container">
            ${categoriesWithChildren.map(cat => `
              <div class="category-card">
                <div class="category-icon">${renderIcon(cat.icon)}</div>
                <div class="category-title">${cat.title}</div>
                <div class="category-meta">${cat.children.length} 个子分类</div>
                <div class="top-category-actions" style="position:absolute; top:10px; right:10px;">
                  <button class="btn btn-sm" onclick="adminApp.editCategoryByIndex('${cat.index}')">编辑</button>
                  <button class="btn btn-sm" onclick="adminApp.showAddSubcategoryModal('${cat.index}')">添加子分类</button>
                  <button class="btn btn-sm" onclick="adminApp.sortSitesByIndex('${cat.index}')">排序网站</button>
                  <button class="btn btn-sm" onclick="adminApp.sortChildrenByIndex('${cat.index}')">排序子分类</button>
                  <button class="btn btn-sm btn-danger" onclick="adminApp.deleteCategoryByIndex('${cat.index}')">删除</button>
                </div>
                ${renderSubCategoryGrid(cat.index, cat)}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
    container.innerHTML = html;
  }

  /**
   * 根据路径查找分类节点和父节点
   * @param {number[]} indexPath
   * @returns {{ parent: any, node: any, index: number }|null}
   */
  _findCategoryWithParentByIndex(indexPath) {
    if (!this.adminData || !this.adminData.data || !Array.isArray(indexPath) || indexPath.length === 0) return null;
    if (!Array.isArray(this.adminData.data.categories)) return null;
    let parent = { children: this.adminData.data.categories };
    let node = null;
    for (let i = 0; i < indexPath.length; i++) {
      const idx = indexPath[i];
      const arr = parent.children;
      if (!Array.isArray(arr) || idx < 0 || idx >= arr.length) return null;
      node = arr[idx];
      if (i < indexPath.length - 1) {
        parent = node;
      } else {
        return { parent, node, index: idx };
      }
    }
    return null;
  }

  /**
   * 显示排序顶层分类的模态框
   */
  showSortTopCategoriesModal() {
    if (!this.adminData || !Array.isArray(this.adminData.data?.categories)) {
      this.notificationManager.error('暂无分类可排序');
      return;
    }
    const categories = this.adminData.data.categories;
    let order = categories.map(c => c.id);

    const renderList = () => {
      const html = `
        <div class="sort-list">
          ${order.map((id, idx) => {
            const cat = categories.find(c => c.id === id) || { title: id };
            return `
              <div class="sort-item" draggable="true" data-idx="${idx}" data-id="${String(id).replace(/\"/g,'&quot;')}">
                <div class="sort-left">
                  <span class="sort-drag">☰</span>
                  <span class="sort-title">${cat.title}</span>
                </div>
                <div class="sort-actions">
                  <button class="btn btn-sm" data-act="up" data-idx="${idx}">上移</button>
                  <button class="btn btn-sm" data-act="down" data-idx="${idx}">下移</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      this.modalBody.innerHTML = html;
      const container = this.modalBody.querySelector('.sort-list');
      // 点击事件支持上/下移
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (Number.isNaN(idx)) return;
        if (act === 'up' && idx > 0) {
          [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
          renderList();
        }
        if (act === 'down' && idx < order.length - 1) {
          [order[idx + 1], order[idx]] = [order[idx], order[idx + 1]];
          renderList();
        }
      });
      // 拖拽排序
      let dragIndex = -1;
      container.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.sort-item');
        if (!item) return;
        dragIndex = parseInt(item.getAttribute('data-idx'), 10);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });
      container.addEventListener('dragend', (e) => {
        const item = e.target.closest('.sort-item');
        if (item) item.classList.remove('dragging');
      });
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      container.addEventListener('drop', (e) => {
        e.preventDefault();
        const item = e.target.closest('.sort-item');
        let targetIdx = item ? parseInt(item.getAttribute('data-idx'), 10) : order.length - 1;
        if (Number.isNaN(targetIdx) || dragIndex === -1) return;
        if (targetIdx === dragIndex) return;
        const moved = order.splice(dragIndex, 1)[0];
        order.splice(targetIdx, 0, moved);
        renderList();
      });
    };

    const body = `<div class="form-group"><div class="form-help">调整顶层分类顺序，保存后前台首页生效</div></div>`;
    this.showModal('排序顶层分类', body, async () => {
      const idToCat = new Map(categories.map(c => [c.id, c]));
      const newCats = order.map(id => idToCat.get(id)).filter(Boolean);
      categories.forEach(c => { if (!order.includes(c.id)) newCats.push(c); });
      this.adminData.data.categories = newCats;
      await this.apiClient.post('/api/admin/data', { data: this.adminData.data });
      this.hideModal();
      this.notificationManager.success('分类排序已保存');
      await this.loadAdminData();
    });
    renderList();
  }

  /**
   * 入口方法：按索引路径排序该分类的直接子分类
   * @param {string} indexStr 形如 "0/2/1"
   */
  sortChildrenByIndex(indexStr) {
    this.showSortChildrenModal(indexStr);
  }

  /**
   * 排序任意层级分类的直接子分类
   */
  showSortChildrenModal(indexStr) {
    const path = (indexStr || '').split('/').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    const found = this._findCategoryWithParentByIndex(path);
    if (!found) {
      this.notificationManager.error('未找到目标分类');
      return;
    }
    let { node } = found;
    // 若该节点只有一个子分类，自动下沉到首个拥有2个以上子分类的层级，便于用户排序
    let descendGuard = 0;
    while (node && Array.isArray(node.children) && node.children.length === 1 && descendGuard < 5) {
      node = node.children[0];
      descendGuard++;
    }
    const children = Array.isArray(node && node.children) ? node.children : [];
    if (children.length <= 1) {
      this.notificationManager.warning('该分类子分类数量不足，无需排序');
      return;
    }

    let order = children.map(c => c.id || c.title);

    const renderList = () => {
      const html = `
        <div class="sort-list">
          ${order.map((id, idx) => {
            const cat = children.find(c => (c.id || c.title) === id) || { title: id };
            return `
              <div class="sort-item" draggable="true" data-idx="${idx}" data-id="${String(id).replace(/\"/g,'&quot;')}">
                <div class="sort-left">
                  <span class="sort-drag">☰</span>
                  <span class="sort-title">${cat.title}</span>
                </div>
                <div class="sort-actions">
                  <button class="btn btn-sm" data-act="up" data-idx="${idx}">上移</button>
                  <button class="btn btn-sm" data-act="down" data-idx="${idx}">下移</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      this.modalBody.innerHTML = html;
      const container = this.modalBody.querySelector('.sort-list');
      // 点击上/下移
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (Number.isNaN(idx)) return;
        if (act === 'up' && idx > 0) {
          [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
          renderList();
        }
        if (act === 'down' && idx < order.length - 1) {
          [order[idx + 1], order[idx]] = [order[idx], order[idx + 1]];
          renderList();
        }
      });
      // 拖拽排序
      let dragIndex = -1;
      container.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.sort-item');
        if (!item) return;
        dragIndex = parseInt(item.getAttribute('data-idx'), 10);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });
      container.addEventListener('dragend', (e) => {
        const item = e.target.closest('.sort-item');
        if (item) item.classList.remove('dragging');
      });
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      container.addEventListener('drop', (e) => {
        e.preventDefault();
        const item = e.target.closest('.sort-item');
        let targetIdx = item ? parseInt(item.getAttribute('data-idx'), 10) : order.length - 1;
        if (Number.isNaN(targetIdx) || dragIndex === -1) return;
        if (targetIdx === dragIndex) return;
        const moved = order.splice(dragIndex, 1)[0];
        order.splice(targetIdx, 0, moved);
        renderList();
      });
    };

    const body = `<div class="form-group"><div class="form-help">调整 <strong>${node.title}</strong> 的子分类顺序</div></div>`;
    this.showModal('排序子分类', body, async () => {
      const idToChild = new Map(children.map(c => [c.id || c.title, c]));
      const newChildren = order.map(id => idToChild.get(id)).filter(Boolean);
      children.forEach(c => { const key = c.id || c.title; if (!order.includes(key)) newChildren.push(c); });
      node.children = newChildren;
      await this.apiClient.post('/api/admin/data', { data: this.adminData.data });
      this.hideModal();
      this.notificationManager.success('子分类排序已保存');
      await this.loadAdminData();
    });
    renderList();
  }

  /**
   * 排序任意层级分类下的网站（仅当前层级sites）
   * @param {string} indexStr 形如 "0/2/1"
   */
  sortSitesByIndex(indexStr) {
    this.showSortSitesModal(indexStr);
  }

  /**
   * 显示排序网站的模态框
   * @param {string} indexStr
   */
  showSortSitesModal(indexStr) {
    const path = (indexStr || '').split('/').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    const found = this._findCategoryWithParentByIndex(path);
    if (!found) {
      this.notificationManager.error('未找到目标分类');
      return;
    }
    const { node } = found;
    const sites = Array.isArray(node.sites) ? node.sites : [];
    if (sites.length <= 1) {
      this.notificationManager.warning('该分类网站数量不足，无需排序');
      return;
    }

    const siteKey = (s) => `${s.title || ''}||${s.url || ''}`;
    let order = sites.map(siteKey);

    const renderList = () => {
      const html = `
        <div class="sort-list">
          ${order.map((key, idx) => {
            const site = sites.find(s => siteKey(s) === key) || { title: key, url: '' };
            const safeTitle = (site.title || '').replace(/\"/g, '&quot;');
            const safeUrl = (site.url || '').replace(/\"/g, '&quot;');
            return `
              <div class="sort-item has-sub" draggable="true" data-idx="${idx}" data-id="${key.replace(/\"/g,'&quot;')}">
                <div class="sort-main">
                  <div class="sort-left">
                    <span class="sort-drag">☰</span>
                    <span class="sort-title">${safeTitle}</span>
                  </div>
                  <div class="sort-actions">
                    <button class="btn btn-sm" data-act="up" data-idx="${idx}">上移</button>
                    <button class="btn btn-sm" data-act="down" data-idx="${idx}">下移</button>
                  </div>
                </div>
                <div class="sort-sub">${safeUrl}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      this.modalBody.innerHTML = html;
      const container = this.modalBody.querySelector('.sort-list');
      // 点击上/下移
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        if (Number.isNaN(idx)) return;
        if (act === 'up' && idx > 0) {
          [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
          renderList();
        }
        if (act === 'down' && idx < order.length - 1) {
          [order[idx + 1], order[idx]] = [order[idx], order[idx + 1]];
          renderList();
        }
      });
      // 拖拽排序
      let dragIndex = -1;
      container.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.sort-item');
        if (!item) return;
        dragIndex = parseInt(item.getAttribute('data-idx'), 10);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });
      container.addEventListener('dragend', (e) => {
        const item = e.target.closest('.sort-item');
        if (item) item.classList.remove('dragging');
      });
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      container.addEventListener('drop', (e) => {
        e.preventDefault();
        const item = e.target.closest('.sort-item');
        let targetIdx = item ? parseInt(item.getAttribute('data-idx'), 10) : order.length - 1;
        if (Number.isNaN(targetIdx) || dragIndex === -1) return;
        if (targetIdx === dragIndex) return;
        const moved = order.splice(dragIndex, 1)[0];
        order.splice(targetIdx, 0, moved);
        renderList();
      });
    };

    const body = `<div class="form-group"><div class="form-help">调整 <strong>${node.title}</strong> 的网站顺序（仅当前层级）</div></div>`;
    this.showModal('排序网站', body, async () => {
      const keyToSite = new Map(sites.map(s => [siteKey(s), s]));
      const newSites = order.map(k => keyToSite.get(k)).filter(Boolean);
      sites.forEach(s => { const k = siteKey(s); if (!order.includes(k)) newSites.push(s); });
      node.sites = newSites;
      await this.apiClient.post('/api/admin/data', { data: this.adminData.data });
      this.hideModal();
      this.notificationManager.success('网站排序已保存');
      await this.loadAdminData();
    });
    renderList();
  }

  /**
   * 从“网站管理”入口：选择一个目录后进入排序网站
   * @param {string} rootKey - 顶层分类的 id 或 title
   */
  openSortSitesSelector(rootKey) {
    if (!this.adminData || !this.adminData.data || !Array.isArray(this.adminData.data.categories)) {
      this.notificationManager.error('暂无数据');
      return;
    }
    const pickRoot = (key) => this.adminData.data.categories.find(c => (c.id || c.title) === key || c.title === key);
    const root = pickRoot(rootKey);
    if (!root) {
      this.notificationManager.error('未找到分类');
      return;
    }
    const paths = [];
    const dfs = (node, titles) => {
      paths.push([...titles]);
      if (Array.isArray(node.children)) node.children.forEach(ch => dfs(ch, [...titles, ch.title]));
    };
    dfs(root, [root.title]);
    const options = paths.map(p => `<option value="${p.join('/').replace(/\"/g,'&quot;')}">${p.join(' / ')}</option>`).join('');
    const body = `
      <div class="form-group">
        <label class="form-label">选择要排序的网站目录</label>
        <select id="sort-sites-path" class="form-select">${options}</select>
        <div class="form-help">包含顶层分类与其所有子文件夹</div>
      </div>
    `;
    this.showModal('选择目录进行排序', body, async () => {
      const sel = document.getElementById('sort-sites-path');
      const val = (sel && sel.value || '').trim();
      if (!val) {
        this.notificationManager.error('请选择目录');
        return;
      }
      this.sortSitesByTitlePath(val.split('/').map(s => s.trim()).filter(Boolean));
    });
  }

  /**
   * 通过标题路径进入网站排序
   * @param {string[]} titlePath
   */
  sortSitesByTitlePath(titlePath) {
    const idxPath = this._findIndexPathByTitlePath(Array.isArray(titlePath) ? titlePath : []);
    if (!idxPath) {
      this.notificationManager.error('未找到目标目录');
      return;
    }
    this.showSortSitesModal(idxPath.join('/'));
  }

  /**
   * 将标题路径解析为索引路径
   * @param {string[]} titles
   * @returns {number[]|null}
   */
  _findIndexPathByTitlePath(titles) {
    if (!this.adminData || !this.adminData.data || !Array.isArray(this.adminData.data.categories)) return null;
    if (!Array.isArray(titles) || titles.length === 0) return null;
    const rootIdx = this.adminData.data.categories.findIndex(c => c && (c.title === titles[0] || (c.id || c.title) === titles[0]));
    if (rootIdx < 0) return null;
    const path = [rootIdx];
    let node = this.adminData.data.categories[rootIdx];
    for (let i = 1; i < titles.length; i++) {
      if (!Array.isArray(node.children)) return null;
      const idx = node.children.findIndex(ch => ch && ch.title === titles[i]);
      if (idx < 0) return null;
      path.push(idx);
      node = node.children[idx];
    }
    return path;
  }

  /**
   * 按路径编辑分类：支持任意层级
   * @param {string} pathStr - '父/子/孙'
   */
  editCategoryByIndex(indexStr) {
    const path = (indexStr || '').split('/').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    const found = this._findCategoryWithParentByIndex(path);
    if (!found) {
      this.notificationManager.error('未找到目标分类');
      return;
    }
    const { node } = found;
    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">📍</span>
          分类路径
        </label>
        <input type="text" class="form-input" value="索引路径: ${path.join(' / ')}" disabled>
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">📝</span>
          分类名称
        </label>
        <input type="text" id="edit-cat-title" class="form-input" value="${node.title}">
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">🎨</span>
          分类图标
        </label>
        <input type="text" id="edit-cat-icon" class="form-input" value="${node.icon || '📁'}">
        <div class="form-help">💡 支持 Emoji 或图片URL（http/https 或 data:image）</div>
      </div>
    `;
    this.showModal('编辑分类', bodyHtml, async () => {
      const title = (document.getElementById('edit-cat-title').value || '').trim();
      const icon = (document.getElementById('edit-cat-icon').value || '').trim();
      if (!title) {
        this.notificationManager.error('分类名称不能为空');
        return;
      }
      try {
        node.title = title;
        node.icon = icon || '📁';
        // 直接提交完整数据
        await this.apiClient.post('/api/admin/data', { data: this.adminData.data });
        this.hideModal();
        this.notificationManager.success('分类更新成功');
        await this.loadAdminData();
      } catch (e) {
        console.error(e);
        this.notificationManager.error('分类更新失败：' + e.message);
      }
    });
  }

  /**
   * 按路径删除分类：删除整个子树
   * @param {string} pathStr - '父/子/孙'
   */
  deleteCategoryByIndex(indexStr) {
    const path = (indexStr || '').split('/').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    const found = this._findCategoryWithParentByIndex(path);
    if (!found) {
      this.notificationManager.error('未找到目标分类');
      return;
    }
    const { parent, node, index } = found;
    const totalChildren = Array.isArray(node.children) ? node.children.length : 0;
    const siteCountRecursive = (n) => {
      let cnt = Array.isArray(n.sites) ? n.sites.length : 0;
      if (Array.isArray(n.children)) n.children.forEach(ch => cnt += siteCountRecursive(ch));
      return cnt;
    };
    const totalSites = siteCountRecursive(node);

    const bodyHtml = `
      <p>确定要删除分类 "<strong>${node.title}</strong>" 吗？</p>
      <p>该分类包含 <strong>${totalChildren}</strong> 个子分类，<strong>${totalSites}</strong> 个网站。</p>
      <p><strong>此操作不可恢复！</strong></p>
    `;
    this.showModal('删除分类', bodyHtml, async () => {
      try {
        // 顶层删除时 parent.children 指向 categories；非顶层为子数组
        if (Array.isArray(parent.children)) {
          parent.children.splice(index, 1);
        }
        await this.apiClient.post('/api/admin/data', { data: this.adminData.data });
        this.hideModal();
        this.notificationManager.success('分类删除成功');
        await this.loadAdminData();
      } catch (e) {
        console.error(e);
        this.notificationManager.error('分类删除失败：' + e.message);
      }
    });
  }

  /**
   * 渲染网站管理
   */
  renderSites() {
    const container = document.getElementById('sites-container');
    const categoryFilter = document.getElementById('category-filter');
    
    // 更新分类过滤器
    this.updateCategoryFilter();
    
    const categories = this.adminData.data.categories || [];
    // 当前筛选条件
    const searchInput = document.getElementById('admin-search');
    const query = (searchInput && searchInput.value || '').toLowerCase().trim();
    const selectedCategoryId = categoryFilter ? (categoryFilter.value || '') : '';
    
    if (categories.length === 0) {
      container.innerHTML = '<div class="no-results">暂无网站数据</div>';
      return;
    }

    // 收集某顶层分类下的所有网站，扁平化（保留路径用于徽章显示）
    const collectSites = (node, pathTitles, out, pathIds = []) => {
      if (Array.isArray(node.sites)) {
        node.sites.forEach(site => out.push({ site, pathTitles: [...pathTitles], pathIds: [...pathIds] }));
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(ch => collectSites(ch, [...pathTitles, ch.title], out, [...pathIds, (ch.id || ch.title)]));
      }
    };

    // 图标工具：支持 Emoji 或图片URL
    const hasImgIcon = (v) => (/^https?:\/\//i.test(v || '') || /^data:image\//i.test(v || ''));
    const renderCatIcon = (icon) => (icon ? (hasImgIcon(icon) ? `<img src="${icon}" alt="icon"/>` : icon) : '📁');

    const renderSiteCard = (site, pathTitles, pathIds) => {
      // 优先使用稳定的 id 路径（若存在），否则使用标题路径
      const pathForAction = Array.isArray(pathIds) && pathIds.length
        ? pathIds
        : pathTitles;
      const safePath = pathForAction.join('/').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g, "&#39;").replace(/</g,'&lt;').replace(/>/g,'&gt;');
      // 优先级：图片URL > 站点字段 favicon > 文本icon
      let iconHtml = '🌐';
      const favSrc = site.favicon || '';
      if (hasImgIcon(site.icon)) {
        iconHtml = `<img src="${site.icon}" alt="icon" onerror="this.style.display='none';this.parentNode.innerHTML='${site.icon || '🌐'}'"/>`;
      } else if (favSrc) {
        iconHtml = `<img src="${favSrc}" alt="icon" onerror="this.style.display='none';this.parentNode.innerHTML='${site.icon || '🌐'}'"/>`;
      } else if (site.icon) {
        iconHtml = site.icon;
      }
      const rawDesc = site.description || '';
      const descTitle = String(rawDesc)
        .replace(/&/g, '&amp;')
        .replace(/\"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `
        <div class="site-item">
          <div class="card-actions">
            <button class="btn btn-sm btn-icon" title="编辑" data-act="edit-site" data-path="${safePath}" data-title="${String(site.title).replace(/&/g,'&amp;').replace(/\"/g,'&quot;').replace(/'/g, "&#39;").replace(/</g,'&lt;').replace(/>/g,'&gt;')}">✏️</button>
            <button class="btn btn-sm btn-icon btn-danger" title="删除" data-act="delete-site" data-path="${safePath}" data-title="${String(site.title).replace(/&/g,'&amp;').replace(/\"/g,'&quot;').replace(/'/g, "&#39;").replace(/</g,'&lt;').replace(/>/g,'&gt;')}">🗑️</button>
            <button class="btn btn-sm btn-icon" title="刷新图标" data-act="refresh-fav" data-url="${site.url.replace(/'/g, "&#39;")}">🔄</button>
          </div>
          <div class="site-header">
            <div class="site-avatar">${iconHtml}</div>
            <div class="site-info">
              <div class="site-title">${site.title}</div>
              <div class="site-url">${site.url}</div>
            </div>
          </div>
          <div class="site-description" title="${descTitle}">${site.description || ''}</div>
          <div class="site-category badge badge-muted">${pathTitles.join(' / ')}</div>
        </div>
      `;
    };

    const matchSite = (site, pathTitles) => {
      if (!query) return true;
      const t = (site.title || '').toLowerCase();
      const u = (site.url || '').toLowerCase();
      const d = (site.description || '').toLowerCase();
      const p = (pathTitles || []).join(' / ').toLowerCase();
      return t.includes(query) || u.includes(query) || d.includes(query) || p.includes(query);
    };

    const catsToRender = selectedCategoryId
      ? categories.filter(c => c.id === selectedCategoryId)
      : categories;

    const html = catsToRender.map(cat => {
      const bucket = [];
      collectSites(cat, [cat.title], bucket, [cat.id || cat.title]);
      const filtered = bucket.filter(({ site, pathTitles }) => matchSite(site, pathTitles));
      if (filtered.length === 0) return '';
      const cards = filtered.map(({ site, pathTitles, pathIds }) => renderSiteCard(site, pathTitles, pathIds)).join('');
      return `
        <div class="category-item">
          <div class="category-header">
            <div class="category-info">
              <div class="category-icon">${renderCatIcon(cat.icon)}</div>
              <div>
                <div class="category-title">${cat.title}</div>
                <div class="category-meta">${filtered.length} 个网站</div>
              </div>
            </div>
            <div class="category-actions">
              <button class="btn btn-sm" onclick="adminApp.openSortSitesSelector('${(cat.id || cat.title).replace(/"/g,'&quot;')}')">排序网站</button>
            </div>
          </div>
          <div class="category-sites">${cards}</div>
        </div>
      `;
    }).filter(Boolean).join('');

    container.innerHTML = html || '<div class="no-results">暂无网站数据</div>';
    this.enableLassoSelection(container);

    // 事件委托：确保在任何环境下按钮可点击
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (!act) return;
      e.stopPropagation();
      if (act === 'edit-site') {
        this.editSiteByPath(btn.getAttribute('data-path') || '', btn.getAttribute('data-title') || '');
      } else if (act === 'delete-site') {
        this.deleteSiteByPath(btn.getAttribute('data-path') || '', btn.getAttribute('data-title') || '');
      } else if (act === 'refresh-fav') {
        const u = btn.getAttribute('data-url') || '';
        if (u) this.refreshFavicons([u]);
      }
    });
  }

  /**
   * 通过标题路径查找分类节点
   */
  _findCategoryNodeByPath(pathTitles) {
    if (!this.adminData || !this.adminData.data || !Array.isArray(pathTitles) || pathTitles.length === 0) return null;
    const isPathById = (arr) => {
      const rootKey = arr[0];
      const inTitles = this.adminData.data.categories.some(c => c && c.title === rootKey);
      const inIds = this.adminData.data.categories.some(c => c && (c.id || c.title) === rootKey);
      // 若root同时在title与id中均存在，则按id优先（更稳定）
      return inIds && !inTitles ? true : inIds;
    };
    const byId = isPathById(pathTitles);
    const findChild = (children, key) => children.find(c => (byId ? (c.id || c.title) : c.title) === key);
    let current = findChild(this.adminData.data.categories, pathTitles[0]);
    if (!current) return null;
    for (let i = 1; i < pathTitles.length; i++) {
      const key = pathTitles[i];
      if (!Array.isArray(current.children)) return null;
      const next = findChild(current.children, key);
      if (!next) return null;
      current = next;
    }
    return current;
  }

  /**
   * 将任意路径（由 id 或 title 组成）解析为“标题路径”
   * @param {string[]} anyPath
   * @returns {string[]|null}
   */
  _resolveTitlePath(anyPath) {
    if (!this.adminData || !this.adminData.data || !Array.isArray(anyPath) || anyPath.length === 0) return null;
    const categories = this.adminData.data.categories || [];
    const pickChild = (children, key) => children.find(c => c && ((c.id && c.id === key) || c.title === key));
    const titles = [];
    let current = pickChild(categories, anyPath[0]);
    if (!current) return null;
    titles.push(current.title);
    for (let i = 1; i < anyPath.length; i++) {
      if (!Array.isArray(current.children)) return null;
      const next = pickChild(current.children, anyPath[i]);
      if (!next) return null;
      titles.push(next.title);
      current = next;
    }
    return titles;
  }

  /**
   * 基于路径的单项编辑
   */
  editSiteByPath(pathStr, siteTitle) {
    const anyPath = (pathStr || '').split('/').map(s => this._decodeHtmlEntities(String(s).trim())).filter(Boolean);
    const titlePath = this._resolveTitlePath(anyPath) || anyPath;
    const node = this._findCategoryNodeByPath(titlePath);
    if (!node) {
      this.notificationManager.error('未找到目标分类');
      return;
    }
    const realTitle = this._decodeHtmlEntities(siteTitle);
    const site = (node.sites || []).find(s => s.title === realTitle);
    if (!site) {
      this.notificationManager.error('未找到网站');
      return;
    }

    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">分类路径</label>
        <input type="text" class="form-input" value="${titlePath.join(' / ')}" disabled>
      </div>
      <div class="form-group">
        <label class="form-label">网站名称</label>
        <input type="text" id="edit-site-title" class="form-input" value="${site.title}">
      </div>
      <div class="form-group">
        <label class="form-label">网站URL</label>
        <input type="url" id="edit-site-url" class="form-input" value="${site.url}">
      </div>
      <div class="form-group">
        <label class="form-label">网站描述</label>
        <textarea id="edit-site-description" class="form-textarea">${site.description || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">网站图标</label>
        <input type="text" id="edit-site-icon" class="form-input" value="${site.icon || ''}" placeholder="🖼️ 支持 Emoji 或图片链接">
        <div class="form-help">优先显示 图片URL ＞ favicon ＞ 文本icon（加载失败时自动显示emoji后备）</div>
        <div class="icon-preview" style="margin-top:8px;display:flex;gap:12px;align-items:center;">
          <div>当前预览：</div>
          <div id="edit-icon-preview" style="font-size:22px;">${site.icon || '🌐'}</div>
          <div>Favicon：</div>
          <img id="edit-favicon-preview" alt="favicon" style="width:22px;height:22px;border-radius:4px;object-fit:contain;${site.favicon ? '' : 'display:none;'}" ${site.favicon ? `src="${site.favicon}"` : ''} />
        </div>
      </div>
    `;

    this.showModal('编辑网站', bodyHtml, async () => {
      const title = document.getElementById('edit-site-title').value.trim();
      const url = document.getElementById('edit-site-url').value.trim();
      const description = document.getElementById('edit-site-description').value.trim();
      const icon = document.getElementById('edit-site-icon').value.trim();
      if (!title || !url) {
        this.notificationManager.error('请填写名称与URL');
        return;
      }
      try {
        await this.apiClient.put('/api/admin/sites', {
          mode: 'update',
          items: [{ path: titlePath.join('/'), title: siteTitle, update: { title, url, description, icon } }]
        });
        this.hideModal();
        this.notificationManager.success('网站更新成功');
        await this.loadAdminData();
      } catch (e) {
        console.error(e);
        this.notificationManager.error('网站更新失败：' + e.message);
      }
    });

    // 预览绑定：遵循 图片URL > favicon > 文本icon
    const iconInput = document.getElementById('edit-site-icon');
    const urlInput = document.getElementById('edit-site-url');
    const iconPreview = document.getElementById('edit-icon-preview');
    const favPreview = document.getElementById('edit-favicon-preview');
    const hasImg = (v) => /^https?:\/\//i.test(v || '') || /^data:image\//i.test(v || '');
    
    // favicon 加载失败时的处理
    const handleFaviconError = () => {
      favPreview.style.display = 'none';
      const icon = (iconInput && iconInput.value || '').trim();
      iconPreview.textContent = icon || '🌐';
    };
    
    const refreshPreview = () => {
      const icon = (iconInput && iconInput.value || '').trim();
      const url = (urlInput && urlInput.value || '').trim();
      if (hasImg(icon)) {
        iconPreview.innerHTML = `<img src="${icon}" alt="icon" onerror="this.parentNode.textContent='❌'"/>`;
        favPreview.style.display = 'none';
        return;
      }
      // 非图片icon：优先favicon（字段或按host）
      let favSrc = site.favicon || '';
      if (!favSrc && url) {
        try {
          const host = new URL(url).hostname;
          favSrc = `/api/favicon/${encodeURIComponent(host)}?v=${this.faviconVersion}`;
        } catch(_) {}
      }
      if (favSrc) {
        favPreview.style.display = 'inline-block';
        favPreview.onerror = handleFaviconError;
        // 若为 data:image 则直接使用，否则带上版本参数
        favPreview.src = /^data:image\//i.test(favSrc) ? favSrc : `${favSrc}`;
        iconPreview.textContent = icon || '🌐';
        return;
      }
      favPreview.style.display = 'none';
      iconPreview.textContent = icon || '🌐';
    };
    iconInput && iconInput.addEventListener('input', refreshPreview);
    urlInput && urlInput.addEventListener('input', refreshPreview);
    setTimeout(refreshPreview, 0);
  }

  /**
   * 基于路径的单项删除
   */
  async deleteSiteByPath(pathStr, siteTitle) {
    const anyPath = (pathStr || '').split('/').map(s => this._decodeHtmlEntities(String(s).trim())).filter(Boolean);
    const titlePath = this._resolveTitlePath(anyPath) || anyPath;
    const bodyHtml = `
      <p>确定要删除网站 "<strong>${this._decodeHtmlEntities(siteTitle)}</strong>" 吗？</p>
      <p>分类路径：${titlePath.join(' / ')}</p>
    `;
    this.showModal('删除网站', bodyHtml, async () => {
      try {
        await this.apiClient.delete('/api/admin/sites', { items: [{ path: titlePath.join('/'), titles: [this._decodeHtmlEntities(siteTitle)] }] });
        this.hideModal();
        this.notificationManager.success('网站删除成功');
        await this.loadAdminData();
      } catch (e) {
        console.error(e);
        this.notificationManager.error('网站删除失败：' + e.message);
      }
    });
  }

  /**
   * 解码常用HTML实体（与render中嵌入onclick参数时的转义对应）
   */
  _decodeHtmlEntities(str) {
    if (!str) return '';
    return String(str)
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  /**
   * 启用鼠标框选多选
   */
  enableLassoSelection(container) {
    const selectable = Array.from(container.querySelectorAll('.site-item'));
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let lasso = null;
    const selected = new Set();

    const getRect = (el) => el.getBoundingClientRect();
    const normalizeRect = (x1, y1, x2, y2) => {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      return { left, top, width, height, right: left + width, bottom: top + height };
    };
    const intersects = (r1, r2) => !(r2.left > r1.right || r2.right < r1.left || r2.top > r1.bottom || r2.bottom < r1.top);

    const onMouseDown = (e) => {
      // 仅左键、且不点在按钮上
      if (e.button !== 0) return;
      if (e.target.closest('.site-actions') || e.target.closest('.card-actions')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      lasso = document.createElement('div');
      lasso.className = 'lasso-selection';
      document.body.appendChild(lasso);
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging || !lasso) return;
      const rect = normalizeRect(startX, startY, e.clientX, e.clientY);
      lasso.style.left = `${rect.left}px`;
      lasso.style.top = `${rect.top}px`;
      lasso.style.width = `${rect.width}px`;
      lasso.style.height = `${rect.height}px`;

      const viewportRects = selectable.map(el => ({ el, rect: getRect(el) }));
      viewportRects.forEach(({ el, rect }) => {
        if (intersects(rect, rect)) {}
      });
      // 计算选中
      viewportRects.forEach(({ el, rect }) => {
        const lRect = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });

      const selectionRect = { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
      selectable.forEach(el => {
        const r = getRect(el);
        const itemRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        const hit = intersects(selectionRect, itemRect);
        if (hit) {
          el.classList.add('selected');
          selected.add(el);
        } else if (!e.shiftKey) {
          el.classList.remove('selected');
          selected.delete(el);
        }
      });
    };

    const onMouseUp = () => {
      if (lasso && lasso.parentNode) lasso.parentNode.removeChild(lasso);
      lasso = null;
      isDragging = false;
    };

    // 点击单个切换选中
    selectable.forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.site-actions') || e.target.closest('.card-actions')) return;
        if (el.classList.contains('selected')) {
          el.classList.remove('selected');
          selected.delete(el);
        } else {
          el.classList.add('selected');
          selected.add(el);
        }
      });
    });

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // 保存引用以供批量操作读取
    this._getSelectedSiteItems = () => Array.from(selected);
  }

  /**
   * 收集所有分类的标题路径（用于目标选择）
   * @returns {string[][]}
   */
  _collectAllCategoryPaths() {
    const results = [];
    if (!this.adminData || !this.adminData.data || !Array.isArray(this.adminData.data.categories)) {
      return results;
    }
    const traverse = (node, path) => {
      results.push([...path]);
      if (Array.isArray(node.children)) {
        node.children.forEach(child => traverse(child, [...path, child.title]));
      }
    };
    this.adminData.data.categories.forEach(cat => traverse(cat, [cat.title]));
    return results;
  }

  /**
   * 读取当前被选中的站点，解析出路径与标题
   */
  _collectSelectedSites() {
    const items = (this._getSelectedSiteItems ? this._getSelectedSiteItems() : []);
    const results = [];
    items.forEach(el => {
      // 自顶层或子分类块内，找到其所属分类路径
      const subTitleEl = el.querySelector('.site-category');
      if (subTitleEl) {
        const text = subTitleEl.textContent || '';
        const parts = text.split('/').map(s => s.trim()).filter(Boolean);
        const categoryPath = parts;
        const title = (el.querySelector('.site-title') || {}).textContent || '';
        results.push({ path: categoryPath, title });
      } else {
        // 顶层：向上找到最近的 .category-item 的标题
        const catEl = el.closest('.category-item');
        const catTitle = catEl ? (catEl.querySelector('.category-title') || {}).textContent : '';
        const title = (el.querySelector('.site-title') || {}).textContent || '';
        if (catTitle && title) results.push({ path: [catTitle], title });
      }
    });
    return results;
  }

  async handleBulkDelete() {
    const items = this._collectSelectedSites();
    if (items.length === 0) {
      this.notificationManager.warning('请先框选或点击选择网站');
      return;
    }
    try {
      await this.apiClient.delete('/api/admin/sites', { items: items.reduce((acc, cur) => {
        const key = cur.path.join('/');
        const found = acc.find(x => x.path === key);
        if (found) {
          found.titles.push(cur.title);
        } else {
          acc.push({ path: key, titles: [cur.title] });
        }
        return acc;
      }, []) });
      this.notificationManager.success('批量删除成功');
      await this.loadAdminData();
    } catch (e) {
      console.error(e);
      this.notificationManager.error('批量删除失败：' + e.message);
    }
  }

  showBulkMoveModal() {
    const items = this._collectSelectedSites();
    if (items.length === 0) {
      this.notificationManager.warning('请先框选或点击选择网站');
      return;
    }
    const paths = this._collectAllCategoryPaths();
    const options = paths.map(p => `<option value="${p.join('/')}" title="${p.join(' / ')}">${p.join(' / ')}</option>`).join('');
    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">选择目标分类</label>
        <select id="bulk-target-select" class="form-select">
          <option value="" selected>请选择目标分类</option>
          ${options}
        </select>
      </div>
    `;
    this.showModal('批量移动', bodyHtml, () => this.confirmBulkMove(items));
  }

  async confirmBulkMove(items) {
    const select = document.getElementById('bulk-target-select');
    const target = (select && select.value || '').trim();
    if (!target) {
      this.notificationManager.error('请选择目标分类');
      return;
    }
    try {
      await this.apiClient.patch('/api/admin/sites', {
        items: items.reduce((acc, cur) => {
          const key = cur.path.join('/');
          const found = acc.find(x => x.path === key);
          if (found) {
            found.titles.push(cur.title);
          } else {
            acc.push({ path: key, titles: [cur.title] });
          }
          return acc;
        }, []),
        target
      });
      this.hideModal();
      this.notificationManager.success('批量移动成功');
      await this.loadAdminData();
    } catch (e) {
      console.error(e);
      this.notificationManager.error('批量移动失败：' + e.message);
    }
  }

  /** 手动刷新一批站点的favicon */
  async refreshFavicons(urls) {
    if (!Array.isArray(urls) || urls.length === 0) return;
    try {
      await this.apiClient.post('/api/admin/sites/favicon/refresh', { urls });
      this.notificationManager.success('刷新任务已提交');
      // 提升版本号以破坏浏览器缓存，然后刷新数据
      this.faviconVersion++;
      await this.loadAdminData();
    } catch (e) {
      console.error(e);
      this.notificationManager.error('刷新失败：' + e.message);
    }
  }

  showBulkEditModal() {
    const items = this._collectSelectedSites();
    if (items.length === 0) {
      this.notificationManager.warning('请先框选或点击选择网站');
      return;
    }
    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">要更新的字段（可选其一或多个）</label>
        <input type="text" id="bulk-edit-title" class="form-input" placeholder="新标题(可选)"/>
        <input type="text" id="bulk-edit-icon" class="form-input" placeholder="新图标(可选)" style="margin-top:8px;"/>
      </div>
    `;
    this.showModal('批量编辑', bodyHtml, () => this.confirmBulkEdit(items));
  }

  async confirmBulkEdit(items) {
    const titleInput = document.getElementById('bulk-edit-title');
    const iconInput = document.getElementById('bulk-edit-icon');
    const newTitle = (titleInput && titleInput.value || '').trim();
    const newIcon = (iconInput && iconInput.value || '').trim();
    if (!newTitle && !newIcon) {
      this.notificationManager.error('请至少填写一个要更新的字段');
      return;
    }
    try {
      const batchItems = items.map((it, idx) => ({
        path: it.path.join('/'),
        title: it.title,
        update: {
          ...(newTitle ? { title: `${newTitle}${items.length > 1 ? `-${idx+1}` : ''}` } : {}),
          ...(newIcon ? { icon: newIcon } : {})
        }
      }));
      await this.apiClient.put('/api/admin/sites', { mode: 'update', items: batchItems });
      this.hideModal();
      this.notificationManager.success('批量编辑成功');
      await this.loadAdminData();
    } catch (e) {
      console.error(e);
      this.notificationManager.error('批量编辑失败：' + e.message);
    }
  }

  /**
   * 渲染设置页面
   */
  renderSettings() {
    // 设置页面主要是静态内容；系统强制使用KV，不再提供开关
  }

  /**
   * 获取所有网站
   */
  getAllSites() {
    if (!this.adminData || !this.adminData.data.categories) {
      return [];
    }

    return this.adminData.data.categories.flatMap(category => {
      const topSites = (category.sites || []).map(site => ({
        ...site,
        category: category.title,
        categoryId: category.id
      }));
      const subSites = (category.children || []).flatMap(child =>
        (child.sites || []).map(site => ({
          ...site,
          category: `${category.title} / ${child.title}`,
          categoryId: `${category.id}/${child.id}`
        }))
      );
      return [...topSites, ...subSites];
    });
  }

  /**
   * 更新分类过滤器
   */
  updateCategoryFilter() {
    const categoryFilter = document.getElementById('category-filter');
    if (!categoryFilter || !this.adminData) return;
    // 记录当前选择，更新后还原
    const prev = categoryFilter.value;
    const options = [
      '<option value="">所有分类</option>',
      ...this.adminData.data.categories.map(cat => 
        `<option value="${cat.id}">${cat.title}</option>`
      )
    ];
    categoryFilter.innerHTML = options.join('');
    if (prev && Array.from(categoryFilter.options).some(o => o.value === prev)) {
      categoryFilter.value = prev;
    }
  }

  /**
   * 过滤网站
   */
  filterSites() { this.renderSites(); }

  /**
   * 渲染过滤后的网站
   */
  renderFilteredSites() {}

  /**
   * 显示模态框
   */
  showModal(title, bodyHtml, onConfirm, options = {}) {
    this.modalTitle.textContent = title;
    this.modalBody.innerHTML = bodyHtml;
    this.modal.classList.add('show');
    
    // 清除之前的事件监听器：克隆替换按钮，移除所有累积的 addEventListener
    if (this.modalConfirm && this.modalConfirm.parentNode) {
      const freshBtn = this.modalConfirm.cloneNode(true);
      this.modalConfirm.parentNode.replaceChild(freshBtn, this.modalConfirm);
      this.modalConfirm = freshBtn;
      // 每次展示时重置按钮状态，避免上次关闭时仍为“处理中...”
      this._resetModalConfirm();
    }

    // 绑定确认事件（带加载守卫）
    ActionGuard.bind(this.modalConfirm, async () => {
      const overlay = document.getElementById('busy-overlay');
      const textEl = document.getElementById('busy-text');
      if (overlay) {
        overlay.classList.add('show');
        if (textEl) textEl.textContent = options.busyText || '正在处理...';
      }
      try {
        if (typeof onConfirm === 'function') {
          await onConfirm();
        }
      } finally {
        if (overlay) overlay.classList.remove('show');
      }
    }, { loadingText: options.loadingText || '处理中...', successTip: options.successTip || '', errorTip: options.errorTip || '' });
  }

  /**
   * 隐藏模态框
   */
  hideModal() {
    this.modal.classList.remove('show');
    // 关闭时同步清理确认按钮与全局忙碌遮罩
    this._resetModalConfirm && this._resetModalConfirm();
    const overlay = document.getElementById('busy-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  /**
   * 重置模态框确认按钮状态
   */
  _resetModalConfirm() {
    if (!this.modalConfirm) return;
    this.modalConfirm.disabled = false;
    this.modalConfirm.classList.remove('btn-loading');
    const sp = this.modalConfirm.querySelector('.spinner');
    if (sp) sp.remove();
    // 恢复原始文本
    this.modalConfirm.textContent = this.modalConfirm.dataset._origText || '确认';
    try { delete this.modalConfirm.dataset._origText; } catch (_) {}
  }

  /**
   * 显示添加分类模态框
   */
  showAddCategoryModal() {
    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">🔑</span>
          分类ID
        </label>
        <input type="text" id="category-id" class="form-input" placeholder="例如：custom-tools">
        <div class="form-help">💡 只能包含字母、数字和短横线</div>
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">📝</span>
          分类名称
        </label>
        <input type="text" id="category-title" class="form-input" placeholder="例如：自定义工具">
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">🎨</span>
          分类图标
        </label>
        <input type="text" id="category-icon" class="form-input" placeholder="🖼️ 支持 Emoji 或图片链接">
        <div class="form-help">💡 支持 Emoji 或图片URL（http/https 或 data:image）</div>
      </div>
    `;

    this.showModal('添加分类', bodyHtml, () => this.addCategory(), { loadingText: '添加中...' });
  }

  /**
   * 顶层：为指定索引路径的分类添加子分类
   * @param {string} indexStr 形如 "0/2"
   */
  showAddSubcategoryModal(indexStr) {
    const path = (indexStr || '').split('/').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    const found = this._findCategoryWithParentByIndex(path);
    if (!found) {
      this.notificationManager.error('未找到目标分类');
      return;
    }
    const { node } = found;

    const bodyHtml = `
      <div class="form-group">
        <label class="form-label"><span class="form-label-icon">📝</span> 子分类名称</label>
        <input type="text" id="subcat-title" class="form-input" placeholder="例如：前端"/>
      </div>
      <div class="form-group">
        <label class="form-label"><span class="form-label-icon">🎨</span> 子分类图标</label>
        <input type="text" id="subcat-icon" class="form-input" placeholder="🖼️ 支持 Emoji 或图片链接"/>
        <div class="form-help">💡 支持 Emoji 或图片URL（http/https 或 data:image）</div>
      </div>
    `;

    this.showModal('添加子分类', bodyHtml, async () => {
      const title = (document.getElementById('subcat-title').value || '').trim();
      const icon = (document.getElementById('subcat-icon').value || '').trim();
      if (!title) {
        this.notificationManager.error('子分类名称不能为空');
        return;
      }
      try {
        if (!Array.isArray(node.children)) node.children = [];
        node.children.push({ title, icon: icon || '📁', sites: [], children: [] });
        await this.apiClient.post('/api/admin/data', { data: this.adminData.data });
        this.hideModal();
        this.notificationManager.success('子分类添加成功');
        await this.loadAdminData();
      } catch (e) {
        console.error(e);
        this.notificationManager.error('子分类添加失败：' + e.message);
      }
    }, { loadingText: '添加中...' });
  }

  /**
   * 添加分类
   */
  async addCategory() {
    const id = document.getElementById('category-id').value.trim();
    const title = document.getElementById('category-title').value.trim();
    const icon = document.getElementById('category-icon').value.trim();

    if (!id || !title || !icon) {
      this.notificationManager.error('请填写所有必填字段');
      return;
    }

    // 验证ID格式
    if (!/^[a-z0-9-]+$/.test(id)) {
      this.notificationManager.error('分类ID只能包含小写字母、数字和短横线');
      return;
    }

    try {
      await this.apiClient.post('/api/admin/categories', {
        id,
        title,
        icon,
        sites: []
      });

      this.hideModal();
      this.notificationManager.success('分类添加成功');
      await this.loadAdminData();
    } catch (error) {
      console.error('添加分类失败:', error);
      this.notificationManager.error('添加分类失败：' + error.message);
    }
  }

  /**
   * 编辑分类
   */
  editCategory(categoryId) {
    const category = this.adminData.data.categories.find(cat => cat.id === categoryId);
    if (!category) return;

    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">分类ID</label>
        <input type="text" class="form-input" value="${category.id}" disabled>
        <div class="form-help">分类ID不可修改</div>
      </div>
      <div class="form-group">
        <label class="form-label">分类名称</label>
        <input type="text" id="edit-category-title" class="form-input" value="${category.title}">
      </div>
      <div class="form-group">
        <label class="form-label">分类图标</label>
        <input type="text" id="edit-category-icon" class="form-input" value="${category.icon}">
      </div>
    `;

    this.showModal('编辑分类', bodyHtml, () => {
      this.updateCategory(categoryId);
    });
  }

  /**
   * 更新分类
   */
  async updateCategory(categoryId) {
    const title = document.getElementById('edit-category-title').value.trim();
    const icon = document.getElementById('edit-category-icon').value.trim();

    if (!title || !icon) {
      this.notificationManager.error('请填写所有必填字段');
      return;
    }

    try {
      await this.apiClient.put(`/api/admin/categories/${categoryId}`, {
        title,
        icon
      });

      this.hideModal();
      this.notificationManager.success('分类更新成功');
      await this.loadAdminData();
    } catch (error) {
      console.error('更新分类失败:', error);
      this.notificationManager.error('更新分类失败：' + error.message);
    }
  }

  /**
   * 删除分类
   */
  deleteCategory(categoryId) {
    const category = this.adminData.data.categories.find(cat => cat.id === categoryId);
    if (!category) return;

    const bodyHtml = `
      <p>确定要删除分类 "<strong>${category.title}</strong>" 吗？</p>
      <p>该分类下的 <strong>${category.sites.length}</strong> 个网站也将被删除。</p>
      <p><strong>此操作不可恢复！</strong></p>
    `;

    this.showModal('删除分类', bodyHtml, () => {
      this.confirmDeleteCategory(categoryId);
    });
  }

  /**
   * 确认删除分类
   */
  async confirmDeleteCategory(categoryId) {
    try {
      await this.apiClient.delete(`/api/admin/categories/${categoryId}`);

      this.hideModal();
      this.notificationManager.success('分类删除成功');
      await this.loadAdminData();
    } catch (error) {
      console.error('删除分类失败:', error);
      this.notificationManager.error('删除分类失败：' + error.message);
    }
  }

  /**
   * 同步数据
   */
  async syncData() {
    try {
      if (!this.adminData) {
        this.notificationManager.error('没有数据可同步');
        return;
      }

      await this.apiClient.post('/api/admin/data', {
        data: this.adminData.data
      });

      this.notificationManager.success('数据同步成功');
      await this.loadAdminData();
    } catch (error) {
      console.error('同步数据失败:', error);
      this.notificationManager.error('同步数据失败：' + error.message);
    }
  }

  /**
   * 导出数据
   */
  exportData() {
    if (!this.adminData) {
      this.notificationManager.error('没有数据可导出');
      return;
    }

    const dataStr = JSON.stringify(this.adminData.data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `navigation-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.notificationManager.success('数据导出成功');
  }

  /**
   * 显示重置数据模态框
   */
  showResetDataModal() {
    const bodyHtml = `
      <div class="warning-message">
        <div class="warning-icon">⚠️</div>
        <div class="warning-content">
          <h4>确定要重置所有数据吗？</h4>
          <p>这将执行以下操作：</p>
          <ul class="warning-list">
            <li>🗑️ 删除所有自定义分类和网站</li>
            <li>🔄 恢复为系统默认配置</li>
            <li>❌ <strong>此操作不可恢复！</strong></li>
          </ul>
          <p class="warning-advice">💡 <strong>建议：</strong>在重置前先导出数据备份</p>
        </div>
      </div>
    `;

    this.showModal('重置数据', bodyHtml, () => {
      this.resetData();
    });
  }

  /**
   * 重置数据
   */
  async resetData() {
    // 二次防抖：防止重复触发
    // 二次防抖：防止重复触发
    if (this._isResetting) return;
    this._isResetting = true;
    try {
      await this.apiClient.delete('/api/admin/data');
      this.hideModal();
      this.notificationManager.success('数据重置成功');
      await this.loadAdminData();
    } catch (error) {
      console.error('重置数据失败:', error);
      this.notificationManager.error('重置数据失败：' + error.message);
    } finally {
      this._isResetting = false;
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    localStorage.clear();
    sessionStorage.clear();
    this.notificationManager.success('缓存清除成功');
  }

  /**
   * 确保"未分类"分类存在
   */
  async ensureUncategorizedCategory() {
    let uncategorized = this.adminData.data.categories.find(cat => (cat && (cat.id === 'uncategorized' || cat.title === '未分类')));

    if (!uncategorized) {
      // 创建稳定的未分类
      const newCategory = {
        id: 'uncategorized',
        title: '未分类',
        icon: '📁',
        sites: [],
        children: []
      };
      this.adminData.data.categories.push(newCategory);
      try {
        await this.apiClient.post('/api/admin/data', { data: this.adminData.data });
      } catch (error) {
        console.error('创建未分类失败:', error);
        this.adminData.data.categories.shift();
        throw new Error('创建未分类分类失败');
      }
      return newCategory.id;
    }

    // 补全缺失字段，确保路径及渲染一致
    let changed = false;
    if (uncategorized.id !== 'uncategorized') { uncategorized.id = 'uncategorized'; changed = true; }
    if (!('icon' in uncategorized)) { uncategorized.icon = '📁'; changed = true; }
    if (!Array.isArray(uncategorized.children)) { uncategorized.children = []; changed = true; }
    if (!Array.isArray(uncategorized.sites)) { uncategorized.sites = []; changed = true; }
    if (changed) {
      try {
        await this.apiClient.post('/api/admin/data', { data: this.adminData.data });
      } catch (e) {
        console.error('修复未分类字段失败:', e);
      }
    }
    return uncategorized.id;
  }

  /**
   * 显示添加网站模态框
   */
  async showAddSiteModal() {
    // 确保有"未分类"选项
    try {
      const uncategorizedId = await this.ensureUncategorizedCategory();
      
      // 递归收集全部分类（含子分类）为扁平路径
      const collectAllPaths = () => {
        const res = [];
        const walk = (node, idSegs, titleSegs) => {
          const label = titleSegs.join(' / ');
          // 使用“标题路径”作为值，后端批量接口与KV定位均基于 title 匹配
          res.push({ path: titleSegs.join('/'), label });
          if (Array.isArray(node.children)) {
            node.children.forEach(ch => walk(ch, [...idSegs, ch.id || ''], [...titleSegs, ch.title]));
          }
        };
        (this.adminData.data.categories || []).forEach(cat => walk(cat, [cat.id || ''], [cat.title]));
        return res;
      };
      const allPaths = collectAllPaths();
      const uncTitle = (this.adminData.data.categories.find(c => c && c.id === uncategorizedId) || {}).title || '未分类';
      const categoriesOptions = allPaths.map(p => 
        `<option value="${p.path}" ${p.path === uncTitle ? 'selected' : ''}>${p.label}</option>`
      ).join('');

    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">📁</span>
          所属分类 <span class="form-optional">(选填)</span>
        </label>
        <select id="site-category-id" class="form-select">
          ${categoriesOptions}
        </select>
        <div class="form-help">💡 若不选择将自动归类到"未分类"</div>
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">🏷️</span>
          网站名称 <span class="form-required">*</span>
        </label>
        <input type="text" id="site-title" class="form-input" placeholder="例如：GitHub" required>
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">🔗</span>
          网站URL <span class="form-required">*</span>
        </label>
        <input type="url" id="site-url" class="form-input" placeholder="https://github.com" required>
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">📄</span>
          网站描述 <span class="form-optional">(选填)</span>
        </label>
        <textarea id="site-description" class="form-textarea" placeholder="简要描述网站功能"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">🎨</span>
          网站图标 <span class="form-optional">(选填)</span>
        </label>
        <input type="text" id="site-icon" class="form-input" placeholder="🖼️ 支持 Emoji 或图片链接" value="">
        <div class="form-help">💡 支持Emoji或图片URL，若留空将自动抓取 favicon（加载失败时自动显示emoji后备）</div>
        <div class="icon-preview" style="margin-top:8px;display:flex;gap:12px;align-items:center;">
          <div>图标预览：</div>
          <div id="add-icon-preview" style="font-size:22px;">🌐</div>
          <div>Favicon：</div>
          <img id="add-favicon-preview" alt="favicon" style="width:22px;height:22px;border-radius:4px;object-fit:contain;display:none;"/>
        </div>
      </div>
      
    `;

    this.showModal('添加网站', bodyHtml, () => this.addSite(), { loadingText: '添加中...' });
    // 绑定预览：icon输入或url输入变化时刷新预览
    const iconInput = document.getElementById('site-icon');
    const urlInput = document.getElementById('site-url');
    const iconPreview = document.getElementById('add-icon-preview');
    const favPreview = document.getElementById('add-favicon-preview');
    
    // favicon 加载失败时的处理
    const handleFaviconError = () => {
      favPreview.style.display = 'none';
      const icon = (iconInput.value || '').trim();
      iconPreview.textContent = icon || '🌐';
    };
    
    const refreshPreview = () => {
      const icon = (iconInput.value || '').trim();
      const url = (urlInput.value || '').trim();
      const isImg = /^https?:\/\//i.test(icon) || /^data:image\//i.test(icon);
      if (isImg) {
        iconPreview.innerHTML = `<img src="${icon}" alt="icon" style="width:22px;height:22px;border-radius:4px;object-fit:contain;" onerror="this.parentNode.textContent='❌'"/>`;
        favPreview.style.display = 'none';
      } else {
        iconPreview.textContent = icon || '🌐';
        favPreview.style.display = 'none';
        if (!icon && url) {
          try {
            const host = new URL(url).hostname;
            favPreview.onerror = handleFaviconError;
            favPreview.src = `/api/favicon/${encodeURIComponent(host)}?v=${this.faviconVersion}`;
            favPreview.style.display = 'inline-block';
          } catch (_) {}
        }
      }
    };
    iconInput.addEventListener('input', refreshPreview);
    urlInput.addEventListener('input', refreshPreview);
    setTimeout(refreshPreview, 0);
    
    } catch (error) {
      console.error('初始化添加网站模态框失败:', error);
      this.notificationManager.error('初始化失败：' + error.message);
    }
  }

  /**
   * 绑定标签输入功能
   */
  bindTagInput(inputId, containerId) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(containerId);
    let tags = [];

    if (!input || !container) return;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = input.value.trim();
        if (value && !tags.includes(value)) {
          tags.push(value);
          this.renderTags(container, tags, (tagToRemove) => {
            tags = tags.filter(tag => tag !== tagToRemove);
            this.renderTags(container, tags, arguments.callee);
          });
          input.value = '';
        }
      }
    });

    // 存储标签数据到容器上，以便获取
    container.getTags = () => tags;
  }

  /**
   * 渲染标签
   */
  renderTags(container, tags, onRemove) {
    container.innerHTML = tags.map(tag => `
      <span class="form-tag">
        ${tag}
        <button type="button" class="form-tag-remove" onclick="(${onRemove.toString()})('${tag}')">&times;</button>
      </span>
    `).join('');
  }

  /**
   * 添加网站
   */
  async addSite() {
    let categoryPathStr = document.getElementById('site-category-id').value;
    const title = document.getElementById('site-title').value.trim();
    const url = document.getElementById('site-url').value.trim();
    const description = document.getElementById('site-description').value.trim();
    const icon = document.getElementById('site-icon').value.trim();
    
    // 只验证必填字段：网站名称和URL
    if (!title || !url) {
      this.notificationManager.error('请填写网站名称和URL地址');
      return;
    }

    // 验证URL格式
    try {
      new URL(url);
    } catch {
      this.notificationManager.error('请输入有效的URL地址');
      return;
    }

    // 解析选择的路径：可能是 id 路径或 title 路径
    let categoryPath = (categoryPathStr || '').split('/').map(s => s.trim()).filter(Boolean);
    if (!categoryPath || categoryPath.length === 0) {
      const uncId = await this.ensureUncategorizedCategory();
      categoryPath = [uncId];
    }

    // 确保所有字段都有值，为空时提供默认值
    const finalDescription = description || `${title}网站`; // 如果描述为空，使用默认描述
    const finalIcon = icon || ''; // 图标可以为空，后端会自动抓取

    try {
      // 优先使用批量接口支持任意层级路径
      await this.apiClient.put('/api/admin/sites', {
        mode: 'add',
        items: [{ path: categoryPath, site: { title, url, description: finalDescription, icon: finalIcon } }]
      });

      this.hideModal();
      this.notificationManager.success('网站添加成功');
      await this.loadAdminData();
    } catch (error) {
      console.error('添加网站失败:', error);
      this.notificationManager.error('添加网站失败：' + error.message);
    }
  }

  /**
   * 编辑网站
   */
  editSite(categoryId, siteTitle) {
    const category = this.adminData.data.categories.find(cat => cat.id === categoryId);
    if (!category) return;

    const site = category.sites.find(s => s.title === siteTitle);
    if (!site) return;

    const categoriesOptions = this.adminData.data.categories.map(cat => 
      `<option value="${cat.id}" ${cat.id === categoryId ? 'selected' : ''}>${cat.title}</option>`
    ).join('');

    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">📁</span>
          所属分类 <span class="form-optional">(选填)</span>
        </label>
        <select id="edit-site-category-id" class="form-select">
          ${categoriesOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">🏷️</span>
          网站名称 <span class="form-required">*</span>
        </label>
        <input type="text" id="edit-site-title" class="form-input" value="${site.title}" required>
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">🔗</span>
          网站URL <span class="form-required">*</span>
        </label>
        <input type="url" id="edit-site-url" class="form-input" value="${site.url}" required>
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">📄</span>
          网站描述 <span class="form-optional">(选填)</span>
        </label>
        <textarea id="edit-site-description" class="form-textarea">${site.description || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">🎨</span>
          网站图标 <span class="form-optional">(选填)</span>
        </label>
        <input type="text" id="edit-site-icon" class="form-input" value="${site.icon || ''}" placeholder="🖼️ 支持 Emoji 或图片链接">
        <div class="form-help">💡 支持Emoji或图片URL，若留空将自动抓取 favicon</div>
        <div class="icon-preview" style="margin-top:8px;display:flex;gap:12px;align-items:center;">
          <div>图标预览：</div>
          <div id="edit-icon-preview" style="font-size:22px;">${site.icon || '🌐'}</div>
          <div>Favicon：</div>
          <img id="edit-favicon-preview" alt="favicon" style="width:22px;height:22px;border-radius:4px;object-fit:contain;${site.favicon ? '' : 'display:none;'}" ${site.favicon ? `src="${site.favicon}"` : ''} />
        </div>
      </div>
      
    `;

    this.showModal('编辑网站', bodyHtml, () => {
      this.updateSite(categoryId, siteTitle);
    });
    // 预览绑定
    const iconInput = document.getElementById('edit-site-icon');
    const urlInput = document.getElementById('edit-site-url');
    const iconPreview = document.getElementById('edit-icon-preview');
    const favPreview = document.getElementById('edit-favicon-preview');
    const refreshPreview = () => {
      const icon = (iconInput.value || '').trim();
      const url = (urlInput.value || '').trim();
      const isImg = /^https?:\/\//i.test(icon) || /^data:image\//i.test(icon);
      if (isImg) {
        iconPreview.textContent = '';
        favPreview.src = icon;
        favPreview.style.display = 'inline-block';
      } else {
        iconPreview.textContent = icon || '🌐';
        if (url) {
          try {
            const host = new URL(url).hostname;
            favPreview.src = `/api/favicon/${encodeURIComponent(host)}?v=${this.faviconVersion}`;
            favPreview.style.display = 'inline-block';
          } catch (_) {
            favPreview.style.display = 'none';
          }
        } else {
          favPreview.style.display = 'none';
        }
      }
    };
    iconInput.addEventListener('input', refreshPreview);
    urlInput.addEventListener('input', refreshPreview);
    setTimeout(refreshPreview, 0);
  }

  /**
   * 更新网站
   */
  async updateSite(originalCategoryId, originalSiteTitle) {
    let newCategoryId = document.getElementById('edit-site-category-id').value;
    const title = document.getElementById('edit-site-title').value.trim();
    const url = document.getElementById('edit-site-url').value.trim();
    const description = document.getElementById('edit-site-description').value.trim();
    const icon = document.getElementById('edit-site-icon').value.trim();
    
    // 只验证必填字段：网站名称和URL
    if (!title || !url) {
      this.notificationManager.error('请填写网站名称和URL地址');
      return;
    }

    // 如果没有选择分类，使用"未分类"
    if (!newCategoryId) {
      newCategoryId = await this.ensureUncategorizedCategory();
    }

    try {
      // 验证URL格式
      new URL(url);
    } catch {
      this.notificationManager.error('请输入有效的URL地址');
      return;
    }

    // 确保所有字段都有值，为空时提供默认值
    const finalDescription = description || `${title}网站`; // 如果描述为空，使用默认描述
    const finalIcon = icon || ''; // 图标可以为空

    try {
      // 如果分类改变了，需要移动网站
      if (newCategoryId !== originalCategoryId) {
        // 先移动到新分类
        await this.apiClient.patch(`/api/admin/sites/${originalCategoryId}/${encodeURIComponent(originalSiteTitle)}/move`, {
          targetCategoryId: newCategoryId
        });
        
        // 然后更新网站信息
        await this.apiClient.put(`/api/admin/sites/${newCategoryId}/${encodeURIComponent(originalSiteTitle)}`, {
          title,
          url,
          description: finalDescription,
          icon: finalIcon
        });
      } else {
        // 直接更新网站信息
        await this.apiClient.put(`/api/admin/sites/${originalCategoryId}/${encodeURIComponent(originalSiteTitle)}`, {
          title,
          url,
          description: finalDescription,
          icon: finalIcon
        });
      }

      this.hideModal();
      this.notificationManager.success('网站更新成功');
      await this.loadAdminData();
    } catch (error) {
      console.error('更新网站失败:', error);
      this.notificationManager.error('更新网站失败：' + error.message);
    }
  }

  /**
   * 删除网站
   */
  deleteSite(categoryId, siteTitle) {
    const category = this.adminData.data.categories.find(cat => cat.id === categoryId);
    if (!category) return;

    const site = category.sites.find(s => s.title === siteTitle);
    if (!site) return;

    const bodyHtml = `
      <p>确定要删除网站 "<strong>${site.title}</strong>" 吗？</p>
      <p>URL: <a href="${site.url}" target="_blank">${site.url}</a></p>
      <p><strong>此操作不可恢复！</strong></p>
    `;

    this.showModal('删除网站', bodyHtml, () => {
      this.confirmDeleteSite(categoryId, siteTitle);
    });
  }

  /**
   * 确认删除网站
   */
  async confirmDeleteSite(categoryId, siteTitle) {
    try {
      await this.apiClient.delete(`/api/admin/sites/${categoryId}/${encodeURIComponent(siteTitle)}`);

      this.hideModal();
      this.notificationManager.success('网站删除成功');
      await this.loadAdminData();
    } catch (error) {
      console.error('删除网站失败:', error);
      this.notificationManager.error('删除网站失败：' + error.message);
    }
  }

  /**
   * 显示导入数据模态框
   */
  showImportDataModal() {
    const bodyHtml = `
      <div class="form-group">
        <label class="form-label">
          <span class="form-label-icon">📥</span>
          导入JSON数据
        </label>
        <textarea id="import-data-textarea" class="form-textarea" rows="10" placeholder="粘贴导航数据的JSON内容...&#13;&#10;&#13;&#10;支持格式：&#13;&#10;{&#13;&#10;  &quot;categories&quot;: [...],&#13;&#10;  &quot;sites&quot;: [...]&#13;&#10;}"></textarea>
        <div class="form-help">💡 请粘贴有效的导航数据JSON格式</div>
      </div>
      
      <div class="import-mode-section">
        <label class="option-label">
          <span class="form-label-icon">⚙️</span>
          导入模式
        </label>
        <div class="radio-group-inline">
          <label class="radio-option-inline">
            <input type="radio" name="import-data-mode" value="merge" id="import-mode-merge-data" checked>
            <span class="radio-custom-inline"></span>
            <div class="radio-content-inline">
              <div class="radio-title-inline">合并模式</div>
              <div class="radio-description-inline">将数据添加到现有内容</div>
            </div>
          </label>
          <label class="radio-option-inline">
            <input type="radio" name="import-data-mode" value="replace" id="import-mode-replace-data">
            <span class="radio-custom-inline"></span>
            <div class="radio-content-inline">
              <div class="radio-title-inline">替换模式</div>
              <div class="radio-description-inline">完全替换现有数据</div>
            </div>
          </label>
        </div>
      </div>
    `;

    this.showModal('导入数据', bodyHtml, () => {
      this.importData();
    });
  }

  /**
   * 导入数据
   */
  async importData() {
    const textarea = document.getElementById('import-data-textarea');
    const modeRadio = document.querySelector('input[name="import-data-mode"]:checked');
    
    const jsonData = textarea.value.trim();
    const shouldMerge = modeRadio ? modeRadio.value === 'merge' : true; // 默认合并

    if (!jsonData) {
      this.notificationManager.error('请输入JSON数据');
      return;
    }

    try {
      const importedData = JSON.parse(jsonData);
      
      // 验证数据格式
      if (!importedData.categories || !Array.isArray(importedData.categories)) {
        this.notificationManager.error('数据格式错误：缺少categories字段');
        return;
      }

      let finalData;
      if (shouldMerge && this.adminData) {
        // 合并数据
        finalData = {
          ...this.adminData.data,
          categories: [...this.adminData.data.categories, ...importedData.categories]
        };
      } else {
        // 替换数据
        finalData = importedData;
      }

      await this.apiClient.post('/api/admin/data', {
        data: finalData
      });

      this.hideModal();
      this.notificationManager.success('数据导入成功');
      await this.loadAdminData();
    } catch (error) {
      console.error('导入数据失败:', error);
      if (error instanceof SyntaxError) {
        this.notificationManager.error('JSON数据格式错误');
      } else {
        this.notificationManager.error('导入数据失败：' + error.message);
      }
    }
  }

  /**
   * 导入Chrome书签HTML
   */
  async importBookmarks() {
    const fileInput = document.getElementById('import-bookmarks-file');
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      this.notificationManager.error('请选择书签HTML文件');
      return;
    }

    const file = fileInput.files[0];
    
    // 获取导入模式
    const mergeMode = document.querySelector('input[name="import-mode"]:checked');
    const mode = mergeMode ? mergeMode.value : 'merge';

    const formData = new FormData();
    formData.append('file', file);

    try {
      await this.apiClient.post(`/api/admin/import/bookmarks?mode=${mode}`, formData);
      this.notificationManager.success('书签导入成功');
      await this.loadAdminData();
    } catch (error) {
      console.error('导入书签失败:', error);
      this.notificationManager.error('导入书签失败：' + error.message);
    }
  }
}

// 全局变量，便于调试和扩展
window.adminApp = null;

// 应用启动
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 仅使用 KV：清理本地存储（保留主题）
    try {
      const theme = localStorage.getItem('theme');
      const adminJwt = sessionStorage.getItem('admin_jwt');
      localStorage.clear();
      sessionStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      if (adminJwt) sessionStorage.setItem('admin_jwt', adminJwt);
    } catch (_) {}

    window.adminApp = new AdminApp();
    await window.adminApp.init();
  } catch (error) {
    console.error('管理后台启动失败:', error);
  }
});

// 导出主应用类
export default AdminApp;
