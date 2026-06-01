/**
 * Premium Dynamic Toast Notification System
 * Programmatically spawns sliding glassmorphic toasts with custom categories.
 */
class ToastManager {
  constructor() {
    this.container = null;
    this._createContainer();
  }

  _createContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed top-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0';
      document.body.appendChild(container);
    }
    this.container = container;
  }

  /**
   * Spawns a new premium toast message
   * @param {string} title - Main header of toast
   * @param {string} message - Description details
   * @param {'success' | 'error' | 'warning' | 'info'} type - Toast mode
   * @param {number} duration - Time before fadeout in ms (default: 4000)
   */
  show(title, message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex w-full flex-col overflow-hidden rounded-xl border bg-white/95 shadow-lg backdrop-blur-md transition-all duration-300 transform translate-x-12 opacity-0 border-slate-100 hover:scale-[1.01] cursor-pointer`;
    
    // Choose theme styling, icon, and colors
    let typeConfig = {
      accentColor: 'bg-indigo-600',
      iconColor: 'text-indigo-600',
      iconSvg: `
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
      `
    };

    if (type === 'success') {
      typeConfig = {
        accentColor: 'bg-emerald-500',
        iconColor: 'text-emerald-500',
        iconSvg: `
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        `
      };
    } else if (type === 'error') {
      typeConfig = {
        accentColor: 'bg-rose-500',
        iconColor: 'text-rose-500',
        iconSvg: `
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        `
      };
    } else if (type === 'warning') {
      typeConfig = {
        accentColor: 'bg-amber-500',
        iconColor: 'text-amber-500',
        iconSvg: `
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        `
      };
    }

    toast.innerHTML = `
      <div class="flex items-start p-4">
        <div class="flex-shrink-0 ${typeConfig.iconColor}">
          ${typeConfig.iconSvg}
        </div>
        <div class="ml-3 w-0 flex-1 pt-0.5">
          <p class="text-sm font-semibold text-slate-800">${title}</p>
          <p class="mt-1 text-xs text-slate-500 leading-relaxed">${message}</p>
        </div>
        <div class="ml-4 flex flex-shrink-0">
          <button type="button" class="inline-flex rounded-md text-slate-400 hover:text-slate-600 focus:outline-none">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <!-- Animated countdown progress bar -->
      <div class="h-[3px] w-full bg-slate-100 mt-auto overflow-hidden">
        <div class="toast-progress h-full ${typeConfig.accentColor} w-full rounded-full" style="animation: toastShrink ${duration}ms linear forwards"></div>
      </div>
    `;

    // Append and trigger animations
    this.container.appendChild(toast);

    // Force reflow
    toast.offsetHeight;

    // Slide in
    toast.classList.remove('translate-x-12', 'opacity-0');
    toast.classList.add('translate-x-0', 'opacity-100');

    const closeToast = () => {
      toast.classList.remove('translate-x-0', 'opacity-100');
      toast.classList.add('translate-x-12', 'opacity-0');
      setTimeout(() => {
        toast.remove();
      }, 300);
    };

    // Click to dismiss
    toast.addEventListener('click', closeToast);

    // Auto dismiss
    const autoDismissTimeout = setTimeout(closeToast, duration);

    // Custom CSS Animation in head if not exists
    if (!document.getElementById('toast-styles')) {
      const styles = document.createElement('style');
      styles.id = 'toast-styles';
      styles.innerHTML = `
        @keyframes toastShrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `;
      document.head.appendChild(styles);
    }
  }

  success(title, message, duration) {
    this.show(title, message, 'success', duration);
  }

  error(title, message, duration) {
    this.show(title, message, 'error', duration);
  }

  warning(title, message, duration) {
    this.show(title, message, 'warning', duration);
  }

  info(title, message, duration) {
    this.show(title, message, 'info', duration);
  }
}

// Export single instance
window.Toast = new ToastManager();
