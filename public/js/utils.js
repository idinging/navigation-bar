/**
 * 前端工具模块
 * 提供通用的工具函数
 */

/**
 * API请求工具
 */
export class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    this.adminToken = null;
    this.adminJWT = null;
  }

  setAdminToken(token) {
    this.adminToken = (token || '').trim() || null;
  }

  setAdminJWT(token) {
    this.adminJWT = (token || '').trim() || null;
  }

  #withAuth(headers = {}) {
    const h = { ...headers };
    if (this.adminToken) {
      h['Authorization'] = `Bearer ${this.adminToken}`;
    }
    if (this.adminJWT) {
      h['X-Admin-JWT'] = this.adminJWT;
    }
    return h;
  }

  /**
   * 发送GET请求
   * @param {string} url - 请求URL
   * @returns {Promise<any>} 响应数据
   */
  async get(url) {
    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        headers: this.#withAuth()
      });
      
      if (!response.ok) {
        // 尝试解析错误内容
        let text = '';
        try { text = await response.text(); } catch(_) {}
        const err = new Error(`HTTP ${response.status}: ${response.statusText}${text?` - ${text}`:''}`);
        err.status = response.status;
        throw err;
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || '请求失败');
      }
      
      return data.data;
    } catch (error) {
      console.error('API请求失败:', error);
      throw error;
    }
  }

  /**
   * 发送POST请求
   * @param {string} url - 请求URL
   * @param {any} data - 请求数据
   * @returns {Promise<any>} 响应数据
   */
  async post(url, data) {
    try {
      const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
      const response = await fetch(`${this.baseUrl}${url}`, {
        method: 'POST',
        headers: isFormData ? this.#withAuth() : this.#withAuth({ 'Content-Type': 'application/json' }),
        body: isFormData ? data : JSON.stringify(data)
      });
      
      if (!response.ok) {
        let text = '';
        try { text = await response.text(); } catch(_) {}
        const err = new Error(`HTTP ${response.status}: ${response.statusText}${text?` - ${text}`:''}`);
        err.status = response.status;
        throw err;
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '请求失败');
      }
      
      return result.data;
    } catch (error) {
      console.error('API请求失败:', error);
      throw error;
    }
  }

  /**
   * 发送PUT请求
   * @param {string} url - 请求URL
   * @param {any} data - 请求数据
   * @returns {Promise<any>} 响应数据
   */
  async put(url, data) {
    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        method: 'PUT',
        headers: this.#withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        let text = '';
        try { text = await response.text(); } catch(_) {}
        const err = new Error(`HTTP ${response.status}: ${response.statusText}${text?` - ${text}`:''}`);
        err.status = response.status;
        throw err;
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '请求失败');
      }
      
      return result.data;
    } catch (error) {
      console.error('API请求失败:', error);
      throw error;
    }
  }

  /**
   * 发送PATCH请求
   * @param {string} url - 请求URL
   * @param {any} data - 请求数据
   * @returns {Promise<any>} 响应数据
   */
  async patch(url, data) {
    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        method: 'PATCH',
        headers: this.#withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        let text = '';
        try { text = await response.text(); } catch(_) {}
        const err = new Error(`HTTP ${response.status}: ${response.statusText}${text?` - ${text}`:''}`);
        err.status = response.status;
        throw err;
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '请求失败');
      }

      return result.data;
    } catch (error) {
      console.error('API请求失败:', error);
      throw error;
    }
  }

  /**
   * 发送DELETE请求
   * @param {string} url - 请求URL
   * @returns {Promise<any>} 响应数据
   */
  async delete(url, data) {
    try {
      const hasBody = data !== undefined;
      const response = await fetch(`${this.baseUrl}${url}`, {
        method: 'DELETE',
        headers: hasBody ? this.#withAuth({ 'Content-Type': 'application/json' }) : this.#withAuth(),
        body: hasBody ? JSON.stringify(data) : undefined
      });
      
      if (!response.ok) {
        let text = '';
        try { text = await response.text(); } catch(_) {}
        const err = new Error(`HTTP ${response.status}: ${response.statusText}${text?` - ${text}`:''}`);
        err.status = response.status;
        throw err;
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '请求失败');
      }
      
      return result.data;
    } catch (error) {
      console.error('API请求失败:', error);
      throw error;
    }
  }
}

/**
 * 主题管理工具
 */
export class ThemeManager {
  constructor() {
    this.isDark = localStorage.getItem('theme') === 'dark';
    this.init();
  }

  init() {
    // 强制同步主题状态
    this.syncTheme();
  }

  toggle() {
    this.isDark = !this.isDark;
    this.syncTheme();
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
  }

  syncTheme() {
    if (this.isDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }
}

/**
 * 搜索引擎管理器
 */
export class SearchEngineManager {
  constructor() {
    this.engines = {
      local: {
        name: '本站搜索',
        icon: '🔍',
        search: null // 将由外部设置
      },
      google: {
        name: 'Google搜索',
        icon: 'google',
        url: 'https://www.google.com/search?q='
      },
      baidu: {
        name: '百度搜索', 
        icon: 'baidu',
        url: 'https://www.baidu.com/s?wd='
      },
      bing: {
        name: '必应搜索',
        icon: 'bing', 
        url: 'https://www.bing.com/search?q='
      },
      sogou: {
        name: '搜狗搜索',
        icon: 'sogou',
        url: 'https://www.sogou.com/web?query='
      }
    };
    this.currentEngine = 'local';
    this.buttons = new Map();
  }

  /**
   * 初始化搜索引擎选择器
   */
  init() {
    const engineButtons = document.querySelectorAll('.search-engine-btn');
    
    engineButtons.forEach(button => {
      const engine = button.dataset.engine;
      this.buttons.set(engine, button);
      
      button.addEventListener('click', () => {
        this.switchEngine(engine);
      });
    });
  }

  /**
   * 切换搜索引擎
   * @param {string} engine - 搜索引擎标识
   */
  switchEngine(engine) {
    if (!this.engines[engine]) return;
    
    // 更新当前引擎
    this.currentEngine = engine;
    
    // 更新按钮状态
    this.buttons.forEach((button, engineKey) => {
      if (engineKey === engine) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
    
    // 更新搜索框提示文字
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      const engineName = this.engines[engine].name;
      if (engine === 'local') {
        searchInput.placeholder = '搜索网站、描述或标签...';
      } else {
        searchInput.placeholder = `使用${engineName}搜索...`;
      }
      
      // 如果搜索框有内容，直接执行搜索
      const query = searchInput.value.trim();
      if (query) {
        this.search(query);
      }
    }
  }

  /**
   * 执行搜索
   * @param {string} query - 搜索关键词
   */
  search(query) {
    if (!query.trim()) return;
    
    const engine = this.engines[this.currentEngine];
    
    if (this.currentEngine === 'local') {
      // 本站搜索
      if (engine.search) {
        engine.search(query);
      }
    } else {
      // 外部搜索引擎
      const searchUrl = engine.url + encodeURIComponent(query);
      window.open(searchUrl, '_blank');
    }
  }

  /**
   * 设置本站搜索处理函数
   * @param {Function} searchFunction - 本站搜索函数
   */
  setLocalSearch(searchFunction) {
    this.engines.local.search = searchFunction;
  }

  /**
   * 获取当前搜索引擎
   * @returns {string} 当前搜索引擎标识
   */
  getCurrentEngine() {
    return this.currentEngine;
  }
}

/**
 * 搜索工具
 */
export class SearchManager {
  constructor(onSearch) {
    this.onSearch = onSearch;
    this.currentQuery = '';
    this.searchTimeout = null;
    this.engineManager = new SearchEngineManager();
    
    // 设置本站搜索处理函数
    this.engineManager.setLocalSearch((query) => {
      this.performLocalSearch(query);
    });
  }

  /**
   * 初始化搜索管理器
   */
  init() {
    this.engineManager.init();
  }

  /**
   * 绑定搜索输入框事件
   * @param {HTMLElement} inputElement - 搜索输入框元素
   */
  bindSearchInput(inputElement) {
    inputElement.addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      const query = e.target.value;
      
      // 如果是本站搜索，延迟执行
      if (this.engineManager.getCurrentEngine() === 'local') {
        this.searchTimeout = setTimeout(() => {
          this.performLocalSearch(query);
        }, 300);
      }
    });

    inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        inputElement.value = '';
        this.currentQuery = '';
        if (this.engineManager.getCurrentEngine() === 'local') {
          this.onSearch('');
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const query = inputElement.value.trim();
        this.engineManager.search(query);
      }
    });
  }

  /**
   * 执行本站搜索
   * @param {string} query - 搜索关键词
   */
  performLocalSearch(query) {
    this.currentQuery = query.trim();
    this.onSearch(this.currentQuery);
  }

  /**
   * 执行搜索
   * @param {string} query - 搜索关键词
   */
  performSearch(query) {
    this.engineManager.search(query);
  }

  /**
   * 高亮搜索关键词
   * @param {string} text - 要高亮的文本
   * @returns {string} 高亮后的HTML
   */
  highlightText(text) {
    if (!this.currentQuery) return text;
    
    const regex = new RegExp(`(${this.currentQuery})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
  }
}

/**
 * DOM操作工具
 */
export class DomUtils {
  /**
   * 创建HTML元素
   * @param {string} tag - 标签名
   * @param {Object} attributes - 属性对象
   * @param {string} innerHTML - 内部HTML
   * @returns {HTMLElement} 创建的元素
   */
  static createElement(tag, attributes = {}, innerHTML = '') {
    const element = document.createElement(tag);
    
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else {
        element.setAttribute(key, value);
      }
    });
    
    if (innerHTML) {
      element.innerHTML = innerHTML;
    }
    
    return element;
  }

  /**
   * 显示加载状态
   * @param {HTMLElement} container - 容器元素
   * @param {string} message - 加载消息
   */
  static showLoading(container, message = '正在加载...') {
    container.innerHTML = `<div class="loading">${message}</div>`;
  }

  /**
   * 显示错误信息
   * @param {HTMLElement} container - 容器元素
   * @param {string} message - 错误消息
   */
  static showError(container, message = '加载失败，请重试') {
    container.innerHTML = `<div class="error">${message}</div>`;
  }

  /**
   * 显示空状态
   * @param {HTMLElement} container - 容器元素
   * @param {string} message - 空状态消息
   */
  static showEmpty(container, message = '暂无数据') {
    container.innerHTML = `<div class="no-results">${message}</div>`;
  }
}

/**
 * 通知工具
 */
export class NotificationManager {
  constructor() {
    this.templateHTML = null;
    this.styleInjected = false;
    this.container = null;
    this.createContainer();
    // 预加载toast模板与样式
    this.ensureTemplateLoaded().catch(e => console.error('加载toast模板失败:', e));
  }

  /**
   * 创建toast容器（左上角）
   */
  createContainer() {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = DomUtils.createElement('div', { className: 'toast-container' });
      document.body.appendChild(container);
    }
    this.container = container;
  }

  /**
   * 确保已加载 toast 模板与样式
   */
  async ensureTemplateLoaded() {
    if (this.templateHTML && this.styleInjected) return;
    try {
      const res = await fetch('toast.html', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const temp = document.createElement('div');
      temp.innerHTML = html;

      const styleEl = temp.querySelector('#toast-style');
      if (styleEl && !document.getElementById('toast-style')) {
        document.head.appendChild(styleEl.cloneNode(true));
      }

      const itemEl = temp.querySelector('.toast-item');
      this.templateHTML = itemEl ? itemEl.outerHTML : '<div class="toast-item {{type}}"><span class="toast-message">{{message}}</span></div>';
      this.styleInjected = true;
    } catch (e) {
      // 失败时兜底最小样式与模板，保证不阻塞功能
      if (!this.templateHTML) {
        this.templateHTML = '<div class="toast-item {{type}}"><span class="toast-message">{{message}}</span></div>';
      }
      if (!document.getElementById('toast-style')) {
        const style = document.createElement('style');
        style.id = 'toast-style';
        style.textContent = `
.toast-container{position:fixed;top:24px;left:24px;z-index:10001;display:flex;flex-direction:column;gap:16px;max-width:420px;pointer-events:none}
.toast-item{background:rgba(255,255,255,.95);color:#374151;border-radius:12px;padding:16px 20px;min-width:320px;box-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 10px 10px -5px rgba(0,0,0,.04);transform:translateX(-100%);animation:slideInLeft .4s cubic-bezier(0,0,.2,1) forwards;position:relative;overflow:hidden;font-weight:500;font-size:.875rem;line-height:1.5}
@keyframes slideInLeft{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideOutLeft{from{transform:translateX(0);opacity:1}to{transform:translateX(-100%);opacity:0}}
.toast-message{display:block;padding-right:32px;font-weight:500}
.toast-item.success{background:rgba(236,253,245,.95);color:#047857}
.toast-item.error{background:rgba(254,242,242,.95);color:#dc2626}
.toast-item.warning{background:rgba(255,251,235,.95);color:#d97706}
.toast-item.info{background:rgba(240,249,255,.95);color:#0891b2}
`;
        document.head.appendChild(style);
      }
      this.styleInjected = true;
    }
  }

  /**
   * 显示toast
   * @param {string} message - 消息文本
   * @param {('success'|'error'|'warning'|'info'|'loading')} type - 类型
   * @param {number} duration - 显示时长(ms); 0表示不自动关闭
   */
  async show(message, type = 'info', duration = 3000) {
    await this.ensureTemplateLoaded();
    this.createContainer();

    const html = this.templateHTML
      .replace('{{type}}', this.normalizeType(type))
      .replace('{{message}}', this.escapeHtml(String(message)));

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    const toast = wrapper.firstElementChild;
    // 允许点击关闭
    toast.style.pointerEvents = 'auto';
    toast.addEventListener('click', () => this.hide(toast));

    this.container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => this.hide(toast), duration);
    }
  }

  /**
   * 隐藏toast
   * @param {HTMLElement} el - toast元素
   */
  hide(el) {
    if (!el || !el.parentNode) return;
    const isRight = this.container && this.container.classList && this.container.classList.contains('top-right');
    el.style.animation = isRight ? 'slideOutRight 0.3s ease-in forwards' : 'slideOutLeft 0.3s ease-in forwards';
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 320);
  }

  /**
   * 成功通知
   * @param {string} message - 消息
   */
  success(message) {
    this.show(message, 'success');
  }

  /**
   * 错误通知
   * @param {string} message - 消息
   */
  error(message) {
    this.show(message, 'error');
  }

  /**
   * 警告通知
   * @param {string} message - 消息
   */
  warning(message) {
    this.show(message, 'warning');
  }

  /**
   * 信息通知
   * @param {string} message - 消息
   */
  info(message) {
    this.show(message, 'info');
  }

  /**
   * 加载中通知
   * @param {string} message - 消息
   * @param {number} duration - 显示时长(默认不自动关闭)
   */
  loading(message, duration = 0) {
    this.show(message, 'loading', duration);
  }

  /**
   * 规范化类型
   * @param {string} type
   */
  normalizeType(type) {
    if (type === 'warn') return 'warning';
    return ['success', 'error', 'warning', 'info', 'loading'].includes(type) ? type : 'info';
  }

  /**
   * 转义HTML
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, (m) => map[m]);
  }
}

/**
 * 操作守卫：为按钮点击提供“加载中禁用、过渡动画、防多击、统一提示”
 */
export class ActionGuard {
  /**
   * 绑定按钮点击处理器
   * @param {HTMLElement} button - 目标按钮
   * @param {Function} handler - 异步处理函数
   * @param {{loadingText?:string, successTip?:string, errorTip?:string}} options
   */
  static bind(button, handler, options = {}) {
    if (!button || typeof handler !== 'function') return;
    const loadingText = options.loadingText || '处理中...';
    const successTip = options.successTip || '';
    const errorTip = options.errorTip || '';
    const notifier = new NotificationManager();

    const disableBtn = () => {
      button.dataset._origText = button.dataset._origText || button.textContent;
      button.disabled = true;
      button.classList.add('btn-loading');
      if (button.querySelector('.spinner')) return;
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      spinner.style.marginRight = '6px';
      spinner.innerHTML = '⏳';
      button.prepend(spinner);
      button.textContent = `${loadingText}`;
      button.prepend(spinner);
    };
    const enableBtn = () => {
      button.disabled = false;
      button.classList.remove('btn-loading');
      const sp = button.querySelector('.spinner');
      if (sp) sp.remove();
      if (button.dataset._origText) button.textContent = button.dataset._origText;
    };
    const onClick = async (e) => {
      if (button.disabled) return;
      disableBtn();
      try {
        await handler(e);
        if (successTip) notifier.success(successTip);
      } catch (err) {
        console.error(err);
        notifier.error(errorTip || (err && err.message) || '操作失败');
      } finally {
        enableBtn();
      }
    };
    button.addEventListener('click', onClick);
  }
}
