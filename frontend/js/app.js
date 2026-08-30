/* ============================================
   小瓜的拼豆施工图 — 应用逻辑
   ============================================ */

const API_BASE = '/api';
const HISTORY_KEY = 'perler-bead-history';

const App = {
  currentScreen: 'home',
  screenHistory: ['home'],
  selectedFile: null,
  selectedImageData: null,  // Data URL for Canvas preview
  gridSize: 50,
  currentResult: null,

  getLocalHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (e) { return []; }
  },

  saveLocalHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  },

  // ── 初始化 ──
  init() {
    this.updateNav();
    this.loadHistoryCount();
  },

  // ── 页面导航 ──
  goTo(screen) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screen}`).classList.add('active');
    this.screenHistory.push(screen);
    this.currentScreen = screen;
    this.updateNav();
    document.getElementById('screen-' + screen).scrollTop = 0;

    if (screen === 'config') {
      setTimeout(() => this.updatePreview(), 100);
    }
  },

  goBack() {
    if (this.screenHistory.length <= 1) return;
    this.screenHistory.pop();
    const prev = this.screenHistory[this.screenHistory.length - 1];
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${prev}`).classList.add('active');
    this.currentScreen = prev;
    this.updateNav();
  },

  updateNav() {
    const backBtn = document.getElementById('navBack');
    const title = document.getElementById('navTitle');

    if (this.currentScreen === 'home') {
      backBtn.classList.add('hidden');
      title.textContent = '🍉 小瓜的拼豆施工图';
    } else {
      backBtn.classList.remove('hidden');
      const titles = {
        upload: '选择图片',
        config: '参数设置',
        generating: '生成中',
        result: '施工图',
      };
      title.textContent = titles[this.currentScreen] || '🍉 小瓜的拼豆施工图';
    }
  },

  // ── ② 选图 ──
  handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      this.selectedImageData = e.target.result;
      const preview = document.getElementById('uploadPreview');
      const placeholder = document.getElementById('uploadPlaceholder');
      preview.src = e.target.result;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
      document.getElementById('btnNextConfig').disabled = false;
    };
    reader.readAsDataURL(file);
  },

  capturePhoto() {
    const input = document.getElementById('fileInput');
    input.setAttribute('capture', 'environment');
    input.click();
    input.removeAttribute('capture');
  },

  // ── ③ 实时预览（Canvas 像素化） ──
  updatePreview() {
    if (!this.selectedImageData) return;

    const gridSize = this.gridSize;
    const canvas = document.getElementById('previewCanvas');
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.onload = () => {
      // 计算 canvas 显示尺寸（适配移动端宽度）
      const wrap = document.querySelector('.preview-canvas-wrap');
      const maxW = wrap.clientWidth - 16;
      const displaySize = Math.min(maxW, 320);

      canvas.width = gridSize;
      canvas.height = gridSize;
      canvas.style.width = displaySize + 'px';
      canvas.style.height = displaySize + 'px';

      // 像素化：缩小再放大，NEAREST 插值
      const offCanvas = document.createElement('canvas');
      offCanvas.width = gridSize;
      offCanvas.height = gridSize;
      const offCtx = offCanvas.getContext('2d');
      offCtx.imageSmoothingEnabled = false;
      offCtx.drawImage(img, 0, 0, gridSize, gridSize);

      // 简易颜色量化（模拟色卡匹配效果）
      const imageData = offCtx.getImageData(0, 0, gridSize, gridSize);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // 量化到色卡粒度（简化：每个通道 32 级）
        const qr = Math.round(r / 32) * 32;
        const qg = Math.round(g / 32) * 32;
        const qb = Math.round(b / 32) * 32;
        data[i] = qr;
        data[i + 1] = qg;
        data[i + 2] = qb;
      }
      offCtx.putImageData(imageData, 0, 0);

      // 绘制到主 canvas（再次 NEAREST 确保像素化）
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, gridSize, gridSize);
      ctx.drawImage(offCanvas, 0, 0, gridSize, gridSize);

      document.getElementById('previewGridInfo').textContent =
        `${gridSize}×${gridSize} · ${(gridSize * gridSize).toLocaleString()} 颗`;
    };
    img.src = this.selectedImageData;
  },

  // ── 配置 ──
  setGridSize(size) {
    this.gridSize = size;
    document.getElementById('gridSlider').value = size;
    this.updateSliderDisplay();
    this.updatePreview();
  },

  updateSlider() {
    const val = parseInt(document.getElementById('gridSlider').value);
    this.gridSize = val;
    this.updateSliderDisplay();
    // 防抖预览
    clearTimeout(this._sliderTimer);
    this._sliderTimer = setTimeout(() => this.updatePreview(), 150);
  },

  updateSliderDisplay() {
    const val = this.gridSize;
    document.getElementById('gridSizeValue').textContent = `${val} × ${val}`;
    document.getElementById('gridBeadCount').textContent = `${(val * val).toLocaleString()} 颗`;

    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    const presetBtn = document.getElementById('preset' + val);
    if (presetBtn) presetBtn.classList.add('active');
  },

  // ── ④ 生成 ──
  async startGenerate() {
    if (!this.selectedFile) {
      this.showToast('请先选择图片');
      return;
    }

    this.goTo('generating');
    this.updateGenProgress(10, '正在上传图片...', '准备中');

    const formData = new FormData();
    formData.append('image', this.selectedFile);
    formData.append('grid_size', `${this.gridSize}x${this.gridSize}`);
    formData.append('bg_remove', document.getElementById('bgRemove').checked);
    formData.append('max_colors', document.querySelector('input[name="colorMode"]:checked').value === 'full' ? 221 : 0);

    this.updateGenProgress(25, '正在分析图片...', '像素化处理中');

    try {
      const response = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        body: formData,
      });

      this.updateGenProgress(60, '正在匹配色卡...', 'MARD 221 色卡匹配中');

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '生成失败');
      }

      this.updateGenProgress(90, '正在生成施工图...', '渲染中');

      this.currentResult = result.data;

      const img = new Image();
      img.onload = () => {
        this.updateGenProgress(100, '完成！', '');
        setTimeout(() => {
          const history = this.getLocalHistory();
          history.unshift(result.data);
          this.saveLocalHistory(history);
          this.showResult(result.data);
        }, 400);
      };
      img.src = `${API_BASE}/output/${result.data.output_file}`;

    } catch (err) {
      this.showToast('生成失败：' + err.message);
      this.goBack();
    }
  },

  updateGenProgress(percent, status, step) {
    document.getElementById('genProgressBar').style.width = percent + '%';
    document.getElementById('genStatus').textContent = status;
    document.getElementById('genStep').textContent = step;
  },

  // ── ⑤ 结果展示 ──
  showResult(data) {
    this.goTo('result');

    const img = document.getElementById('resultImage');
    img.src = `${API_BASE}/output/${data.output_file}`;

    document.getElementById('statBeads').textContent = data.total_beads.toLocaleString();
    document.getElementById('statColors').textContent = data.color_count;
    document.getElementById('statGrid').textContent = `${data.grid_w}×${data.grid_h}`;

    // 色卡图例 — 使用后端返回的真实 RGB 颜色
    const legendGrid = document.getElementById('legendGrid');
    legendGrid.innerHTML = '';

    const colorDetails = data.colors_detail || [];
    if (colorDetails.length > 0) {
      colorDetails.forEach(c => {
        const [r, g, b] = c.rgb;
        const hex = `rgb(${r},${g},${b})`;
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
          <span class="legend-swatch" style="background:${hex}"></span>
          <span class="legend-code">${c.id}</span>
          <span class="legend-count">×${c.count}</span>
        `;
        legendGrid.appendChild(item);
      });
    } else {
      // 兼容旧数据：用 usage 格式
      (data.usage || []).forEach(([code, count]) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
          <span class="legend-swatch" style="background:#ccc"></span>
          <span class="legend-code">${code}</span>
          <span class="legend-count">×${count}</span>
        `;
        legendGrid.appendChild(item);
      });
    }
  },

  // ── 下载 ──
  downloadResult() {
    if (!this.currentResult) return;
    const link = document.createElement('a');
    link.href = `${API_BASE}/output/${this.currentResult.output_file}`;
    link.download = this.currentResult.output_file;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // ── 分享 ──
  async shareResult() {
    if (!this.currentResult) return;
    const url = `${API_BASE}/output/${this.currentResult.output_file}`;

    if (navigator.share) {
      try {
        const blob = await fetch(url).then(r => r.blob());
        const file = new File([blob], this.currentResult.output_file, { type: 'image/png' });
        await navigator.share({
          title: '小瓜的拼豆施工图',
          files: [file],
        });
      } catch (e) { /* ignore */ }
    } else {
      this.downloadResult();
      this.showToast('已保存到本地，长按分享给好友');
    }
  },

  // ── 历史记录 ──
  async showHistory() {
    document.getElementById('historyOverlay').classList.add('active');
    await this.loadHistory();
  },

  hideHistory() {
    document.getElementById('historyOverlay').classList.remove('active');
  },

  async loadHistory() {
    const list = document.getElementById('historyList');
    const history = this.getLocalHistory();
    if (history.length === 0) {
      list.innerHTML = '<div class="history-empty">还没有作品，快去创作吧 🍉</div>';
      return;
    }

    list.innerHTML = history.map(item => `
        <div class="history-item" onclick="App.viewHistoryItem('${item.id}')">
          <img class="history-thumb" src="${API_BASE}/output/${item.output_file}" alt="${item.original_name}" loading="lazy">
          <div class="history-info">
            <div class="history-name">${item.original_name}</div>
            <div class="history-meta">
              ${item.grid_w}×${item.grid_h} · ${item.total_beads.toLocaleString()}颗 · ${item.color_count}色
            </div>
            <div class="history-meta">${new Date(item.created_at).toLocaleDateString()}</div>
          </div>
          <button class="history-delete" onclick="event.stopPropagation(); App.deleteHistoryItem('${item.id}')">🗑️</button>
        </div>
    `).join('');
  },

  async loadHistoryCount() {
    const count = this.getLocalHistory().length;
    document.getElementById('navHistory').textContent = count ? `📋(${count})` : '📋';
  },

  viewHistoryItem(id) {
    this.hideHistory();
    const item = this.getLocalHistory().find(h => h.id === id);
    if (item) {
      this.currentResult = item;
      if (!item.colors_detail && item.usage) {
        item.colors_detail = item.usage.map(([code, count]) => ({
          id: code, count: count, rgb: [200, 200, 200]
        }));
      }
      this.showResult(item);
    }
  },

  async deleteHistoryItem(id) {
    this.saveLocalHistory(this.getLocalHistory().filter(item => item.id !== id));
    this.loadHistory();
    this.loadHistoryCount();
  },

  async clearHistory() {
    if (!confirm('确定要清空所有作品记录吗？')) return;
    this.saveLocalHistory([]);
    this.loadHistory();
    this.loadHistoryCount();
    this.showToast('已清空');
  },

  // ── Toast ──
  showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  },
};

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', () => App.init());

// 点击上传区域
document.getElementById('uploadArea').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});
