/**
 * Member 1 - Shared UI Foundation
 * Earthy Visual Language, Navigation, Modals, Toasts, and Shared Formatting
 */

const UI = {
  activeTab: 'dashboard',
  tabRenderers: {},

  init() {
    this.setupNavigation();
    this.createToastContainer();
    this.createModalContainer();
  },

  registerTabRenderer(tabId, renderFn) {
    this.tabRenderers[tabId] = renderFn;
  },

  setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });
  },

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.view-panel').forEach(p => {
      p.classList.toggle('active', p.id === 'view-' + tabId);
    });

    if (this.tabRenderers[tabId]) {
      this.tabRenderers[tabId]();
    }
  },

  formatCurrency(val) {
    const num = Number(val) || 0;
    return '₹' + num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  },

  createToastContainer() {
    if (!document.getElementById('toast-container')) {
      const tc = document.createElement('div');
      tc.id = 'toast-container';
      tc.className = 'toast-container';
      document.body.appendChild(tc);
    }
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span>' + message + '</span>';
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  createModalContainer() {
    if (!document.getElementById('modal-backdrop')) {
      const mb = document.createElement('div');
      mb.id = 'modal-backdrop';
      mb.className = 'modal-backdrop';
      mb.innerHTML = '<div class="modal-box"><div class="modal-header"><h3 class="modal-title" id="modal-title">Modal Title</h3><button class="modal-close" id="modal-close-btn">&times;</button></div><div class="modal-body" id="modal-body"></div><div class="modal-footer" id="modal-footer"></div></div>';
      document.body.appendChild(mb);
      document.getElementById('modal-close-btn').onclick = () => UI.closeModal();
      mb.addEventListener('click', (e) => {
        if (e.target === mb) UI.closeModal();
      });
    }
  },

  showModal(title, bodyHtml, buttons = []) {
    this.createModalContainer();
    const mb = document.getElementById('modal-backdrop');
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    const footer = document.getElementById('modal-footer');
    footer.innerHTML = '';

    buttons.forEach(btn => {
      const b = document.createElement('button');
      b.className = 'btn ' + (btn.className || 'btn-secondary');
      b.innerText = btn.label;
      b.addEventListener('click', () => {
        if (btn.onClick) btn.onClick();
      });
      footer.appendChild(b);
    });

    mb.classList.add('active');
  },

  closeModal() {
    const mb = document.getElementById('modal-backdrop');
    if (mb) mb.classList.remove('active');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UI };
} else if (typeof window !== 'undefined') {
  window.UI = UI;
}