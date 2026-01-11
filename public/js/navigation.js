/**
 * 导航渲染模块
 * 负责导航内容的显示和交互
 */

import { DomUtils } from './utils.js';

/**
 * 导航渲染器
 */
export class NavigationRenderer {
  constructor(container, searchManager) {
    this.container = container;
    this.searchManager = searchManager;
    this.categories = [];
    this.currentPath = [];
    this.currentCategory = null;
    // 分页状态：按 section 容器(id: sites-idx) 记录
    this._pagingState = {};
  }

  /**
   * 渲染导航分类
   * @param {Array} categories - 分类数据
   */
  renderCategories(categories) {
    // 过滤掉没有任何站点（自身与所有后代都为空）的分类
    const hasAnySites = (node) => {
      if (!node) return false;
      if (Array.isArray(node.sites) && node.sites.length > 0) return true;
      if (Array.isArray(node.children) && node.children.length > 0) {
        for (const ch of node.children) {
          if (hasAnySites(ch)) return true;
        }
      }
      return false;
    };
    const visibleCategories = Array.isArray(categories)
      ? categories.filter(cat => hasAnySites(cat))
      : [];

    if (!visibleCategories || visibleCategories.length === 0) {
      DomUtils.showEmpty(this.container, '暂无导航数据');
      return;
    }

    // 缓存数据并重置路径
    this.categories = visibleCategories;
    this.currentPath = [];

    // 首页：每个分类直接展示内容；在标题行展示当前文件夹与返回按钮
    const hasImgIcon = (v) => (/^https?:\/\//i.test(v || '') || /^data:image\//i.test(v || ''));
    const renderIcon = (icon) => (icon ? (hasImgIcon(icon) ? `<img src="${icon}" alt=""/>` : icon) : '📁');
    const sectionsHtml = visibleCategories.map((cat, idx) => {
      const sitesId = `sites-${idx}`;
      const chips = '';
      return `
        <section class="section fade-in">
          <h2 class="section-title" data-sec="${idx}">
            <span class="section-icon">${renderIcon(cat.icon)}</span><span>${cat.title}</span>
            <div class="level-center" id="level-center-${idx}"></div>
            <a href="#" class="btn back-button btn-back" id="back-btn-${idx}" style="display:none">返回上一级</a>
          </h2>
          ${chips}
          <div id="${sitesId}"></div>
        </section>
      `;
    }).join('');

    this.container.innerHTML = sectionsHtml;
    this.bindChipsForSections();
    // 默认展示每个分类的“全部”内容（无需手动点击）
    visibleCategories.forEach((_, idx) => this.updateSectionSites(idx, -1));
  }

  /**
   * 渲染搜索结果
   * @param {Array} results - 搜索结果
   * @param {string} query - 搜索关键词
   */
  renderSearchResults(results, query) {
    if (results.length === 0) {
      DomUtils.showEmpty(this.container, `未找到包含 "${query}" 的网站`);
      return;
    }

    const html = `
      <section class="section fade-in">
        <h2 class="section-title">
          <span>🔍</span>
          <span>搜索结果 (${results.length})</span>
        </h2>
        <div class="cards-grid">
          ${results.map(site => this.renderSiteCard(site)).join('')}
        </div>
      </section>
    `;

    this.container.innerHTML = html;
  }

  bindRootEvents() {
    this.container.querySelectorAll('.category-card').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = Number(el.getAttribute('data-cat-index'));
        const cat = this.categories[idx];
        this.openCategory(cat);
      });
    });
  }

  bindChipsForSections() {
    const chips = this.container.querySelectorAll('.chips .chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const secIndex = Number(chip.getAttribute('data-sec-index'));
        const childIndex = Number(chip.getAttribute('data-child-index'));
        // 激活态
        const group = chip.parentElement;
        group.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
        chip.classList.add('chip-active');
        this.updateSectionSites(secIndex, childIndex);
        // 更新hash：#nav=Top[/Child]
        try {
          const cat = this.categories[secIndex];
          if (cat) {
            let parts = [cat.title];
            if (childIndex >= 0 && Array.isArray(cat.children) && cat.children[childIndex]) {
              parts.push(cat.children[childIndex].title);
            }
            const encoded = parts.map(p => encodeURIComponent(String(p)) ).join('/');
            if (encoded) window.location.hash = `nav=${encoded}`;
          }
        } catch (_) {}
      });
    });
  }

  updateSectionSites(sectionIndex, childIndex) {
    const category = this.categories[sectionIndex];
    const sitesId = `sites-${sectionIndex}`;
    const container = this.container.querySelector(`#${sitesId}`);
    const backBtn = this.container.querySelector(`#back-btn-${sectionIndex}`);
    const levelCenter = this.container.querySelector(`#level-center-${sectionIndex}`);
    if (!container || !category) return;
    let sites = [];
    let folderItems = [];
    if (childIndex === -1) {
      // 选中“全部”：如果无直辖站点则聚合所有后代站点
      // 同时把直接子文件夹渲染成“文件夹卡片”
      const hasAnySites = (node) => {
        if (!node) return false;
        if (Array.isArray(node.sites) && node.sites.length > 0) return true;
        if (Array.isArray(node.children) && node.children.length > 0) {
          return node.children.some(ch => hasAnySites(ch));
        }
        return false;
      };
      if (Array.isArray(category.children) && category.children.length) {
        folderItems = category.children
          .filter(c => hasAnySites(c))
          .map((c, i) => this.renderFolderCard(c.title, c.icon, {
            level: 'child', secIndex: sectionIndex, childIndex: i
          }));
      }
      // 仅展示“当前分类”的直辖网站，不再递归聚合
      sites = Array.isArray(category.sites) ? category.sites : [];
      if (backBtn) backBtn.style.display = 'none';
      if (levelCenter) levelCenter.textContent = '';
    } else if (category.children && category.children[childIndex]) {
      const child = category.children[childIndex];
      // 不再渲染chips
      // 把孙级文件夹渲染成“文件夹卡片”
      const hasAnySites = (node) => {
        if (!node) return false;
        if (Array.isArray(node.sites) && node.sites.length > 0) return true;
        if (Array.isArray(node.children) && node.children.length > 0) {
          return node.children.some(ch => hasAnySites(ch));
        }
        return false;
      };
      if (Array.isArray(child.children) && child.children.length) {
        folderItems = child.children
          .filter(g => hasAnySites(g))
          .map((g, gi) => this.renderFolderCard(g.title, g.icon, {
            level: 'grand', secIndex: sectionIndex, childIndex, grandIndex: gi
          }));
      }
      // 仅展示该子分类的直辖网站，不再递归聚合
      sites = Array.isArray(child.sites) ? child.sites : [];
      if (backBtn) {
        backBtn.style.display = 'inline-flex';
        backBtn.onclick = (e) => {
          e.preventDefault();
          // 从子级返回到根
          this.updateSectionSites(sectionIndex, -1);
          try {
            const parts = [category.title];
            const encoded = parts.map(p => encodeURIComponent(String(p))).join('/');
            window.location.hash = `nav=${encoded}`;
          } catch (_) {}
        };
      }
      // 在子级下，父级为当前分类名
      if (levelCenter) levelCenter.textContent = category.title;
    }
    const siteItems = sites.map(site => this.renderSiteCard(site));

    // 所有层级统一分页：顶层/子层均使用 7 + 加载更多（每次+8）
    const combined = [...siteItems, ...folderItems];
    const stateKey = childIndex === -1 ? `${sitesId}::-1` : `${sitesId}::${childIndex}`;
    // 仅当合计数量 > 8 时启用分页，否则直接渲染全部（不显示“加载更多”）
    if (combined.length > 8) {
      this.renderPagedCards(container, stateKey, combined);
    } else {
      container.innerHTML = `<div class="cards-grid">${combined.join('')}</div>`;
    }
    this.bindFolderCardClicks(container);
  }

  /**
   * 在容器内按“7 + 加载更多(每次+8)”分页渲染卡片
   * @param {HTMLElement} container
   * @param {string} stateKey - 唯一键(通常为 sites-id)
   * @param {string[]} itemsHtml - 单个卡片的 HTML 字符串数组
   */
  renderPagedCards(container, stateKey, itemsHtml) {
    const PAGE_FIRST = 7; // 首屏展示数量
    const PAGE_STEP = 8;  // 每次加载数量

    const total = Array.isArray(itemsHtml) ? itemsHtml.length : 0;
    if (total === 0) {
      container.innerHTML = '<div class="no-results">暂无网站</div>';
      return;
    }

    // 仅当总数大于8时才显示“加载更多”；否则直接显示全部
    if (total <= 8) {
      container.innerHTML = `<div class="cards-grid">${itemsHtml.join('')}</div>`;
      return;
    }

    // 初始化或更新状态
    const st = this._pagingState[stateKey] || { shown: Math.min(total, PAGE_FIRST) };
    if (!this._pagingState[stateKey]) this._pagingState[stateKey] = st;
    // 若总数减少，修正 shown
    st.shown = Math.min(st.shown, total);

    const needMore = st.shown < total;
    const visible = itemsHtml.slice(0, st.shown).join('');
    const moreCard = needMore ? this.renderLoadMoreCard(stateKey) : '';
    container.innerHTML = `<div class="cards-grid">${visible}${moreCard}</div>`;
    // 绑定文件夹点击
    this.bindFolderCardClicks(container);

    if (needMore) {
      const btn = container.querySelector(`.load-more-card[data-key="${stateKey}"]`);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          st.shown = Math.min(total, st.shown + PAGE_STEP);
          // 重新渲染
          const needMore2 = st.shown < total;
          const visible2 = itemsHtml.slice(0, st.shown).join('');
          const more2 = needMore2 ? this.renderLoadMoreCard(stateKey) : '';
          container.innerHTML = `<div class="cards-grid">${visible2}${more2}</div>`;
          this.bindFolderCardClicks(container);
          this.renderPagedCards(container, stateKey, itemsHtml);
        });
      }
    }
  }

  /**
   * 加载更多按钮卡片
   */
  renderLoadMoreCard(key) {
    return `
      <a href="#" class="card load-more-card" data-key="${key}">
        <div class="card-header">
          <div class="card-icon">➕</div>
          <div class="card-title">加载更多</div>
        </div>
      </a>
    `;
  }

  /**
   * 为当前容器内的“文件夹卡片”绑定点击行为
   */
  bindFolderCardClicks(container) {
    container.querySelectorAll('.folder-card').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const level = el.getAttribute('data-level');
        const sec = Number(el.getAttribute('data-sec-index'));
        const ci = Number(el.getAttribute('data-child-index'));
        if (level === 'child') {
          const chips = this.container.querySelector(`#chips-${sec}`);
          if (chips) {
            chips.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
            const target = chips.querySelector(`.chip[data-sec-index="${sec}"][data-child-index="${ci}"]`);
            if (target) target.classList.add('chip-active');
          }
          this.updateSectionSites(sec, ci);
          try {
            const cat = this.categories[sec];
            const child = cat && Array.isArray(cat.children) ? cat.children[ci] : null;
            const parts = [cat && cat.title, child && child.title].filter(Boolean);
            const encoded = parts.map(p => encodeURIComponent(String(p))).join('/');
            if (encoded) window.location.hash = `nav=${encoded}`;
          } catch (_) {}
        } else if (level === 'grand') {
          const gi = Number(el.getAttribute('data-grand-index'));
          this.updateGrandchildSites(sec, ci, gi);
          const subchips = this.container.querySelector(`#subchips-${sec}`);
          if (subchips) {
            subchips.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
            const btn = subchips.querySelector(`.chip[data-sec-index="${sec}"][data-child-index="${ci}"][data-grand-index="${gi}"]`);
            if (btn) btn.classList.add('chip-active');
          }
          try {
            const cat = this.categories[sec];
            const child = cat && Array.isArray(cat.children) ? cat.children[ci] : null;
            const grand = child && Array.isArray(child.children) ? child.children[gi] : null;
            const parts = [cat && cat.title, child && child.title, grand && grand.title].filter(Boolean);
            const encoded = parts.map(p => encodeURIComponent(String(p))).join('/');
            if (encoded) window.location.hash = `nav=${encoded}`;
          } catch (_) {}
        }
      });
    });
  }

  updateGrandchildSites(sectionIndex, childIndex, grandIndex) {
    const category = this.categories[sectionIndex];
    const sitesId = `sites-${sectionIndex}`;
    const container = this.container.querySelector(`#${sitesId}`);
    const backBtn = this.container.querySelector(`#back-btn-${sectionIndex}`);
    const levelCenter = this.container.querySelector(`#level-center-${sectionIndex}`);
    if (!container || !category) return;
    const child = category.children && category.children[childIndex];
    if (!child) return;
    let sites = [];
    if (grandIndex === -1) {
      sites = Array.isArray(child.sites) ? child.sites : [];
    } else if (child.children && child.children[grandIndex]) {
      const grand = child.children[grandIndex];
      sites = Array.isArray(grand.sites) ? grand.sites : [];
    }
    const cardsHtml = sites.map(site => this.renderSiteCard(site)).join('');
    container.innerHTML = cardsHtml ? `<div class="cards-grid">${cardsHtml}</div>` : '<div class="no-results">暂无网站</div>';

    // 更新头部：当前层级为子级或孙级，显示返回按钮
    if (backBtn) {
      backBtn.style.display = 'inline-flex';
      backBtn.onclick = (e) => {
        e.preventDefault();
        // 从孙级返回到子级（显示该子级及其所有后代）
        this.updateSectionSites(sectionIndex, childIndex);
        try {
          const category = this.categories[sectionIndex];
          const child = category && Array.isArray(category.children) ? category.children[childIndex] : null;
          const parts = [category && category.title, child && child.title].filter(Boolean);
          const encoded = parts.map(p => encodeURIComponent(String(p))).join('/');
          if (encoded) window.location.hash = `nav=${encoded}`;
        } catch (_) {}
      };
    }
    // 中间显示父文件夹：在孙级或子级场景，父级为当前子文件夹名
    if (levelCenter) levelCenter.textContent = child.title;
  }

  /**
   * 根据路径导航（titles数组）
   * @param {string[]} pathTitles [Top, Child?, Grand?]
   */
  navigateToPath(pathTitles) {
    if (!Array.isArray(pathTitles) || pathTitles.length === 0) return;
    const topTitle = pathTitles[0];
    const secIndex = this.categories.findIndex(c => c && c.title === topTitle);
    if (secIndex < 0) return;
    if (pathTitles.length === 1) {
      this.updateSectionSites(secIndex, -1);
      const titleEl = this.container.querySelector(`.section-title[data-sec="${secIndex}"]`);
      if (titleEl) try { titleEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(_) {}
      return;
    }
    const category = this.categories[secIndex];
    const childTitle = pathTitles[1];
    const childIndex = Array.isArray(category && category.children)
      ? category.children.findIndex(ch => ch && ch.title === childTitle)
      : -1;
    if (childIndex < 0) {
      this.updateSectionSites(secIndex, -1);
      return;
    }
    if (pathTitles.length === 2) {
      this.updateSectionSites(secIndex, childIndex);
      const titleEl = this.container.querySelector(`.section-title[data-sec="${secIndex}"]`);
      if (titleEl) try { titleEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(_) {}
      return;
    }
    const grandTitle = pathTitles[2];
    const child = category.children[childIndex];
    const grandIndex = Array.isArray(child && child.children)
      ? child.children.findIndex(g => g && g.title === grandTitle)
      : -1;
    if (grandIndex >= 0) {
      this.updateGrandchildSites(secIndex, childIndex, grandIndex);
      const titleEl = this.container.querySelector(`.section-title[data-sec="${secIndex}"]`);
      if (titleEl) try { titleEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(_) {}
    } else {
      this.updateSectionSites(secIndex, childIndex);
    }
  }

  openCategory(category) {
    this.currentPath = [category.title];
    this.currentCategory = category;
    const hasAnySites = (node) => {
      if (!node) return false;
      if (Array.isArray(node.sites) && node.sites.length > 0) return true;
      if (Array.isArray(node.children) && node.children.length > 0) {
        return node.children.some(ch => hasAnySites(ch));
      }
      return false;
    };
    const visibleChildren = Array.isArray(category.children)
      ? category.children.filter(ch => hasAnySites(ch))
      : [];
    const hasChildren = visibleChildren.length > 0;

    // 当前分类下的网站
    const siteCards = (category.sites || []).map(site => this.renderSiteCard(site)).join('');

    // 子分类卡片
    const subcategoryCards = hasChildren
      ? visibleChildren.map((child, cidx) => {
          const count = (child.sites && child.sites.length) || 0;
          return `
            <a href="#" class="card subcategory-card" data-child-index="${cidx}">
              <div class="card-header">
                <div class="card-icon">📁</div>
                <div class="card-title">${child.title}</div>
              </div>
              <div class="card-description">${count} 个网站</div>
            </a>
          `;
        }).join('')
      : '';

    // 子分类标签（chips）
    const chips = hasChildren
      ? `
        <div class="chips" id="subcategory-chips">
          <button class="chip chip-active" data-chip-index="-1">全部</button>
          ${visibleChildren.map((c, i) => `<button class="chip" data-chip-index="${i}">${c.title}</button>`).join('')}
        </div>
      `
      : '';

    const hasImgIcon = (v) => (/^https?:\/\//i.test(v || '') || /^data:image\//i.test(v || ''));
    const renderIcon = (icon) => (icon ? (hasImgIcon(icon) ? `<img src="${icon}" alt=""/>` : icon) : '📁');
    const html = `
      <section class="section fade-in">
        <h2 class="section-title"><span class="section-icon">${renderIcon(category.icon)}</span><span>${category.title}</span></h2>
        ${chips}
        <div id="category-sites">
          ${siteCards ? `<div class="cards-grid">${siteCards}</div>` : ''}
        </div>
        ${hasChildren ? `<div class="subcategory"><div class="cards-grid">${subcategoryCards}</div></div>` : ''}
      </section>
    `;
    this.container.innerHTML = html;
    if (hasChildren) {
      this.container.querySelectorAll('.subcategory-card').forEach((el, idx) => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          this.openSubcategory(category, visibleChildren[idx]);
        });
      });
      // 绑定chips筛选
      const chipsEl = this.container.querySelector('#subcategory-chips');
      if (chipsEl) {
        chipsEl.querySelectorAll('.chip').forEach(chip => {
          chip.addEventListener('click', () => {
            chipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
            chip.classList.add('chip-active');
            const idx = Number(chip.getAttribute('data-chip-index'));
            this.renderCategorySitesByChip(idx);
          });
        });
      }
    }
  }

  renderCategorySitesByChip(childIndex) {
    const container = this.container.querySelector('#category-sites');
    if (!container || !this.currentCategory) return;
    let sites = [];
    if (childIndex === -1) {
      sites = (this.currentCategory.sites && this.currentCategory.sites.length)
        ? this.currentCategory.sites
        : this.collectSitesRecursive({ children: this.currentCategory.children || [], sites: [] });
    } else if (this.currentCategory.children && this.currentCategory.children[childIndex]) {
      const child = this.currentCategory.children[childIndex];
      sites = (child.sites && child.sites.length) ? child.sites : this.collectSitesRecursive(child);
    }
    const cardsHtml = sites.map(site => this.renderSiteCard(site)).join('');
    container.innerHTML = cardsHtml ? `<div class="cards-grid">${cardsHtml}</div>` : '<div class="no-results">暂无网站</div>';
  }

  /**
   * 递归聚合节点及其所有后代的站点
   * @param {Object} node
   * @returns {Array}
   */
  collectSitesRecursive(node) {
    const result = [];
    const stack = [node];
    let guard = 0;
    while (stack.length && guard < 10000) {
      guard += 1;
      const cur = stack.pop();
      if (!cur) continue;
      if (Array.isArray(cur.sites) && cur.sites.length) result.push(...cur.sites);
      if (Array.isArray(cur.children) && cur.children.length) {
        for (let i = 0; i < cur.children.length; i++) stack.push(cur.children[i]);
      }
    }
    return result;
  }

  openSubcategory(category, child) {
    this.currentPath = [category.title, child.title];
    const cards = (child.sites || []).map(site => this.renderSiteCard(site)).join('');
    const html = `
      <section class="section fade-in">
        <h2 class="section-title"><span>📁</span><span>${category.title} / ${child.title}</span></h2>
        <div class="cards-grid">${cards}</div>
      </section>
    `;
    this.container.innerHTML = html;
  }

  renderBreadcrumb() {
    const parts = ['全部分类', ...this.currentPath];
    const items = parts.map((p, i) => {
      if (i === 0) {
        return `<a href="#" class="breadcrumb-link" data-level="root">${p}</a>`;
      }
      return `<span class="breadcrumb-sep">/</span><span class="breadcrumb-text">${p}</span>`;
    }).join('');
    const html = `<div class="breadcrumb">${items}</div>`;

    // 绑定返回根目录事件
    setTimeout(() => {
      const root = this.container.querySelector('.breadcrumb-link[data-level="root"]');
      if (root) {
        root.addEventListener('click', (e) => {
          e.preventDefault();
          this.renderCategories(this.categories);
        });
      }
    }, 0);

    return html;
  }

  /**
   * 渲染网站卡片
   * @param {Object} site - 网站数据
   * @returns {string} 卡片HTML
   */
  renderSiteCard(site) {
    const hasImgIcon = (v) => (/^https?:\/\//i.test(v || '') || /^data:image\//i.test(v || ''));
    // 优先级：图片URL > favicon > 文本icon
    let iconHtml = '🌐';
    if (hasImgIcon(site.icon)) {
      iconHtml = `<img src="${site.icon}" alt="" onerror="this.style.display='none';this.parentNode.innerHTML='${site.icon || '🌐'}'"/>`;
    } else if (site.favicon) {
      iconHtml = `<img src="${site.favicon}" alt="" onerror="this.style.display='none';this.parentNode.innerHTML='${site.icon || '🌐'}'"/>`;
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
      <a href="${site.url}" target="_blank" rel="noopener noreferrer" class="card">
        <div class="card-header">
          <div class="card-icon">${iconHtml}</div>
          <div class="card-title">${this.searchManager.highlightText(site.title)}</div>
        </div>
        <div class="card-description" title="${descTitle}">${this.searchManager.highlightText(site.description)}</div>
      </a>
    `;
  }

  // 将子文件夹渲染成“文件夹卡片”
  renderFolderCard(title, icon, meta) {
    const attrs = [
      'class="card folder-card"',
      `data-level="${meta.level}"`,
      `data-sec-index="${meta.secIndex}"`,
      `data-child-index="${meta.childIndex ?? -1}"`
    ];
    if (typeof meta.grandIndex === 'number') attrs.push(`data-grand-index="${meta.grandIndex}"`);
    const hasImgIcon = (v) => (/^https?:\/\//i.test(v || '') || /^data:image\//i.test(v || ''));
    const iconHtml = icon ? (hasImgIcon(icon) ? `<img src="${icon}" alt=""/>` : icon) : '📁';
    return `
      <a href="#" ${attrs.join(' ')}>
        <div class="card-header">
          <div class="card-icon">${iconHtml}</div>
          <div class="card-title">${title}</div>
        </div>
        <div class="card-description">文件夹</div>
      </a>
    `;
  }
}

/**
 * 统计信息管理器
 */
export class StatsManager {
  constructor() {
    this.totalSitesElement = document.getElementById('total-sites');
    this.totalCategoriesElement = document.getElementById('total-categories');
    this.lastUpdatedElement = document.getElementById('last-updated');
  }

  /**
   * 更新统计信息
   * @param {Object} stats - 统计数据
   */
  updateStats(stats) {
    if (this.totalSitesElement) {
      this.totalSitesElement.textContent = `${stats.totalSites} 个网站`;
    }
    
    if (this.totalCategoriesElement) {
      this.totalCategoriesElement.textContent = `${stats.totalCategories} 个分类`;
    }
    
    if (this.lastUpdatedElement) {
      const dt = new Date(stats.lastUpdated);
      const formatted = dt.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      this.lastUpdatedElement.textContent = `更新于 ${formatted}`;
    }
  }

  /**
   * 显示加载状态
   */
  showLoading() {
    if (this.totalSitesElement) {
      this.totalSitesElement.textContent = '加载中...';
    }
    if (this.totalCategoriesElement) {
      this.totalCategoriesElement.textContent = '加载中...';
    }
    if (this.lastUpdatedElement) {
      this.lastUpdatedElement.textContent = '加载中...';
    }
  }
}
