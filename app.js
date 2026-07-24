/* ═══════════════════════════════════════════════════════════════
   VENGO APP - COMPLETE APPLICATION LOGIC
   Version 1.0.0 | مصنع ملابس الأطفال
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   STORAGE KEYS
───────────────────────────────────────────── */
const KEYS = {
  USERS:   'vengo_users',
  MODELS:  'vengo_models',
  ORDERS:  'vengo_orders',
  SESSION: 'vengo_session',
  COLORS:  'vengo_colors',
  CONFIG:  'vengo_config',
  CUSTOMERS: 'vengo_customers'
};

/* ─────────────────────────────────────────────
   FIREBASE CONFIG & SYNC
───────────────────────────────────────────── */
// === ضع إعدادات فايربيس هنا ===
const firebaseConfig = {
  apiKey: "AIzaSyBUmpHwZylgAbHbENl0gW8uCA6wgSx2G4s",
  authDomain: "vengo-wear.firebaseapp.com",
  projectId: "vengo-wear",
  storageBucket: "vengo-wear.firebasestorage.app",
  messagingSenderId: "426437238789",
  appId: "1:426437238789:web:db1ec6c90334a1b15b3c6c",
  measurementId: "G-R9XTXGWEWT"
};

let fireDB = null;
try {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey) {
    firebase.initializeApp(firebaseConfig);
    fireDB = firebase.firestore();
    fireDB.enablePersistence().catch(err => {
      console.warn("Firebase persistence error:", err);
    });
  }
} catch (e) {
  console.error("Firebase init error:", e);
}

const Sync = {
  unsubscribers: [],

  init() {
    if (!fireDB) return;
    console.log('Firebase Sync Initialized (Collections Mode)');

    const collections = {
      [KEYS.USERS]: 'vengo_users',
      [KEYS.MODELS]: 'vengo_models',
      [KEYS.ORDERS]: 'vengo_orders',
      [KEYS.COLORS]: 'vengo_colors',
      [KEYS.CUSTOMERS]: 'vengo_customers'
    };

    // Listen to all collection-based data
    for (const [localKey, fireCol] of Object.entries(collections)) {
      const unsub = fireDB.collection(fireCol).onSnapshot(snapshot => {
        const dataArray = snapshot.docs.map(doc => doc.data());
        localStorage.setItem(localKey, JSON.stringify(dataArray));
        
        // Trigger UI updates based on current page
        const p = App.currentPage;
        if (localKey === KEYS.USERS && p === 'users' && typeof Users !== 'undefined') Users.render();
        if (localKey === KEYS.COLORS && p === 'colors' && typeof Colors !== 'undefined') Colors.render();
        if (localKey === KEYS.CUSTOMERS && p === 'customers' && typeof Customers !== 'undefined') Customers.render();
        if (localKey === KEYS.MODELS) {
          if (p === 'models' && typeof Models !== 'undefined') Models.render();
          if (p === 'inventory' && typeof Inventory !== 'undefined') Inventory.render();
          if (p === 'create-order' && typeof Orders !== 'undefined') Orders.renderOrderModels('');
          if (p === 'dashboard' && typeof Dashboard !== 'undefined') Dashboard.render();
        }
        if (localKey === KEYS.ORDERS) {
          if (p === 'orders' && typeof Orders !== 'undefined') Orders.render();
          if (p === 'dashboard' && typeof Dashboard !== 'undefined') Dashboard.render();
        }
      });
      this.unsubscribers.push(unsub);
    }

    // Listen to Config (Single Document)
    const configUnsub = fireDB.collection('vengo_config').doc('main').onSnapshot(doc => {
      if (doc.exists) {
        localStorage.setItem(KEYS.CONFIG, JSON.stringify(doc.data()));
        App.updateSeasonDisplay();
      }
    });
    this.unsubscribers.push(configUnsub);
  },

  stop() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  },

  addOrUpdate(key, id, data) {
    if (!fireDB || !id) return;
    const collections = {
      [KEYS.USERS]: 'vengo_users',
      [KEYS.MODELS]: 'vengo_models',
      [KEYS.ORDERS]: 'vengo_orders',
      [KEYS.COLORS]: 'vengo_colors',
      [KEYS.CUSTOMERS]: 'vengo_customers'
    };
    const fireCol = collections[key];
    if (fireCol) {
      return fireDB.collection(fireCol).doc(id).set({ ...data, updatedAt: new Date().toISOString() }, { merge: true })
        .catch(err => {
          console.error("Sync addOrUpdate Error:", err);
          // لا نعيد التحميل تلقائياً — نعرض رسالة واضحة للمستخدم
          const isPermission = err.code === 'permission-denied';
          Toast.error(isPermission
            ? 'ليس لديك صلاحية لتنفيذ هذا الإجراء. تواصل مع المدير.'
            : 'فشل الحفظ في السحابة. تحقق من اتصالك بالإنترنت وأعد المحاولة.');
          throw err;
        });
    }
  },

  delete(key, id) {
    if (!fireDB || !id) return;
    const collections = {
      [KEYS.USERS]: 'vengo_users',
      [KEYS.MODELS]: 'vengo_models',
      [KEYS.ORDERS]: 'vengo_orders',
      [KEYS.COLORS]: 'vengo_colors',
      [KEYS.CUSTOMERS]: 'vengo_customers'
    };
    const fireCol = collections[key];
    if (fireCol) {
      return fireDB.collection(fireCol).doc(id).delete()
        .catch(err => {
          console.error("Sync delete Error:", err);
          const isPermission = err.code === 'permission-denied';
          Toast.error(isPermission
            ? 'ليس لديك صلاحية لحذف هذا العنصر. تواصل مع المدير.'
            : 'فشل الحذف من السحابة. تحقق من اتصالك بالإنترنت وأعد المحاولة.');
          throw err;
        });
    }
  },

  saveConfig(data) {
    if (!fireDB) return;
    return fireDB.collection('vengo_config').doc('main').set({ ...data, updatedAt: new Date().toISOString() }, { merge: true })
      .catch(err => console.error("Sync saveConfig Error:", err));
  },

  async confirmOrderTransaction(order, items) {
    if (!fireDB) throw new Error("Firebase not initialized");
    
    // Group items by modelId
    const modelsToUpdate = {};
    items.forEach(item => {
      if (!modelsToUpdate[item.modelId]) modelsToUpdate[item.modelId] = [];
      modelsToUpdate[item.modelId].push(item);
    });

    const orderRef = fireDB.collection('vengo_orders').doc(order.id);
    
    return fireDB.runTransaction(async (transaction) => {
      // 1. Read all required models first
      const modelDocs = {};
      for (const modelId of Object.keys(modelsToUpdate)) {
        const ref = fireDB.collection('vengo_models').doc(modelId);
        const doc = await transaction.get(ref);
        if (!doc.exists) throw new Error(`الموديل غير موجود في قاعدة البيانات!`);
        modelDocs[modelId] = { ref, data: doc.data() };
      }

      // 2. ✅ تحقق من توفر الكمية قبل الخصم (CRITICAL FIX)
      for (const modelId of Object.keys(modelsToUpdate)) {
        const model = modelDocs[modelId].data;
        const itemsForModel = modelsToUpdate[modelId];

        for (const item of itemsForModel) {
          const color = model.colors.find(c => c.id === item.colorId);
          if (!color) throw new Error(`اللون غير موجود في الموديل!`);
          if (color.quantity < item.quantity) {
            throw new Error(`عذراً! الكمية المتاحة من لون "${item.colorName}" في موديل "${item.modelName}" هي ${color.quantity} قطعة فقط، وطلبت منها ${item.quantity} قطعة. يرجى تعديل الكمية.`);
          }
        }
      }

      // 3. خصم الكميات بعد التحقق
      for (const modelId of Object.keys(modelsToUpdate)) {
        const model = modelDocs[modelId].data;
        const itemsForModel = modelsToUpdate[modelId];
        
        itemsForModel.forEach(item => {
          const cIdx = model.colors.findIndex(c => c.id === item.colorId);
          if (cIdx !== -1) {
            model.colors[cIdx].quantity = model.colors[cIdx].quantity - item.quantity;
          }
        });
        
        transaction.update(modelDocs[modelId].ref, { colors: model.colors, updatedAt: new Date().toISOString() });
      }

      // 4. Save the order
      transaction.set(orderRef, { ...order, updatedAt: new Date().toISOString() });
    });
  },

  async deleteOrderTransaction(order) {
    if (!fireDB) throw new Error("Firebase not initialized");
    
    const modelsToUpdate = {};
    order.items.forEach(item => {
      if (!modelsToUpdate[item.modelId]) modelsToUpdate[item.modelId] = [];
      modelsToUpdate[item.modelId].push(item);
    });

    const orderRef = fireDB.collection('vengo_orders').doc(order.id);
    
    return fireDB.runTransaction(async (transaction) => {
      const modelDocs = {};
      for (const modelId of Object.keys(modelsToUpdate)) {
        const ref = fireDB.collection('vengo_models').doc(modelId);
        const doc = await transaction.get(ref);
        if (doc.exists) modelDocs[modelId] = { ref, data: doc.data() };
      }

      for (const modelId of Object.keys(modelsToUpdate)) {
        if (!modelDocs[modelId]) continue;
        const model = modelDocs[modelId].data;
        const itemsForModel = modelsToUpdate[modelId];
        
        itemsForModel.forEach(item => {
          const cIdx = model.colors.findIndex(c => c.id === item.colorId);
          if (cIdx !== -1) {
            model.colors[cIdx].quantity += item.quantity;
          }
        });
        
        transaction.update(modelDocs[modelId].ref, { colors: model.colors, updatedAt: new Date().toISOString() });
      }

      transaction.delete(orderRef);
    });
  }
};

/* ─────────────────────────────────────────────
   LOCAL DATABASE
───────────────────────────────────────────── */
const DB = {
  get(key)       { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  set(key, val)  { 
    try {
      localStorage.setItem(key, JSON.stringify(val)); 
    } catch (e) {
      console.error("localStorage setItem Error:", e);
      if (typeof Toast !== 'undefined') Toast.error("مساحة التخزين ممتلئة! يرجى مسح بعض البيانات.");
    }
  },
  getOne(key)    { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  setOne(key, v) { localStorage.setItem(key, JSON.stringify(v)); },
  remove(key)    { localStorage.removeItem(key); }
};

/* ─────────────────────────────────────────────
   CONFIG MODULE
───────────────────────────────────────────── */
const Config = {
  get() {
    return DB.getOne(KEYS.CONFIG) || { activeSeason: 'الموسم الأول', seasons: ['الموسم الأول'] };
  },
  save(config) {
    DB.setOne(KEYS.CONFIG, config);
    if (typeof Sync !== 'undefined' && typeof Sync.saveConfig === 'function') Sync.saveConfig(config);
    App.updateSeasonDisplay();
  }
};

/* ─────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────── */
const Utils = {
  id()  { return '_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36); },

  today() {
    return new Date().toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  },

  todayISO() {
    return new Date().toISOString().split('T')[0];
  },

  formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch { return isoStr; }
  },

  orderNum(id) {
    return '#' + id.toUpperCase().slice(-6);
  },

  el(id)  { return document.getElementById(id); },
  qs(sel) { return document.querySelector(sel); },
  qsa(sel){ return document.querySelectorAll(sel); },

  show(el) { if (typeof el === 'string') el = Utils.el(el); el && el.classList.remove('hidden'); },
  hide(el) { if (typeof el === 'string') el = Utils.el(el); el && el.classList.add('hidden'); },

  sanitize(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  }
};

/* ─────────────────────────────────────────────
   TOAST NOTIFICATIONS
───────────────────────────────────────────── */
const Toast = {
  show(msg, type = 'info', duration = 3000) {
    const container = Utils.el('toast-container');
    const icons = {
      success: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
      error:   '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
      info:    '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
      warning: '<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>'
    };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = (icons[type] || '') + Utils.sanitize(msg);
    container.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => t.remove(), 300);
    }, duration);
  },
  success(m) { this.show(m, 'success'); },
  error(m)   { this.show(m, 'error'); },
  info(m)    { this.show(m, 'info'); },
  warning(m) { this.show(m, 'warning'); }
};

/* ─────────────────────────────────────────────
   AUTH MODULE
───────────────────────────────────────────── */
const Auth = {
  currentUser: null,

  init() {
    // Create default config if missing
    const config = DB.getOne(KEYS.CONFIG);
    if (!config) {
      DB.setOne(KEYS.CONFIG, { activeSeason: 'الموسم الأول', seasons: ['الموسم الأول'] });
    }

    // Config only
  },

  async login(username, password) {
    if (!firebase) throw new Error("Firebase not loaded");
    const email = `${username}@vengo-wear.com`;
    return firebase.auth().signInWithEmailAndPassword(email, password);
  },

  async logout() {
    if (firebase) await firebase.auth().signOut();
    if (typeof Sync !== 'undefined') Sync.stop();
    this.currentUser = null;
    DB.remove(KEYS.SESSION);
  },

  can(page) {
    if (!this.currentUser) return false;
    const role = this.currentUser.role;
    const perms = {
      dashboard:     ['admin','sales','warehouse'],
      models:        ['admin'],
      'add-model':   ['admin'],
      'bulk-models': ['admin'],
      orders:        ['admin','sales'],
      'create-order':['admin','sales'],
      inventory:     ['admin','warehouse'],
      users:         ['admin'],
      colors:        ['admin'],
      customers:     ['admin'],
      seasons:       ['admin']
    };
    return (perms[page] || []).includes(role);
  },

  defaultPage() {
    const role = this.currentUser?.role;
    if (role === 'warehouse') return 'inventory';
    return 'dashboard';
  }
};

/* ─────────────────────────────────────────────
   MODAL MANAGER
───────────────────────────────────────────── */
const Modal = {
  open(name) {
    const m = Utils.el(`modal-${name}`);
    if (m) { m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  },
  close(name) {
    const m = Utils.el(`modal-${name}`);
    if (m) { m.classList.add('hidden'); document.body.style.overflow = ''; }
  },
  confirm(title, message, onOk) {
    Utils.el('confirm-title').textContent   = title;
    Utils.el('confirm-message').textContent = message;
    const btn = Utils.el('confirm-ok-btn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => { Modal.close('confirm'); onOk(); });
    this.open('confirm');
  }
};

/* ─────────────────────────────────────────────
   APPLICATION ROUTER & SHELL
───────────────────────────────────────────── */
const App = {
  currentPage: null,
  sidebarOpen: false,

  /* ── Bootstrap ── */
  init() {
    // Create default config if missing
    const config = DB.getOne(KEYS.CONFIG);
    if (!config) {
      DB.setOne(KEYS.CONFIG, { activeSeason: 'الموسم الأول', seasons: ['الموسم الأول'] });
    }

    Auth.init();

    // Instant launch: restore cached session immediately
    const cachedUser = DB.getOne(KEYS.SESSION);
    if (cachedUser) {
      Auth.currentUser = cachedUser;
      this.showShell();
      if (!this.currentPage) this.navigate(Auth.defaultPage());
    }

    this.bindLoginForm();
    this.bindModalBackdrops();

    // Network Status Listener
    const updateNetworkStatus = () => {
      const el = Utils.el('network-status');
      if (el) {
        if (navigator.onLine) {
          el.className = 'network-status online';
          el.querySelector('.network-text').textContent = 'متصل';
        } else {
          el.className = 'network-status offline';
          el.querySelector('.network-text').textContent = 'غير متصل';
        }
      }
    };
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

    // Firebase Auth State Listener
    if (firebase) {
      firebase.auth().onAuthStateChanged(async user => {
        if (user) {
          try {
            // Restore from local cache first for instant UX
            const localUsers = DB.get(KEYS.USERS);
            const cached = localUsers.find(u => u.id === user.uid) || DB.getOne(KEYS.SESSION);
            if (cached) {
              Auth.currentUser = cached;
              DB.setOne(KEYS.SESSION, cached);
              this.showShell();
              if (!this.currentPage) this.navigate(Auth.defaultPage());
            }

            // Sync/Verify from Firestore in background
            if (fireDB) {
              const doc = await fireDB.collection('vengo_users').doc(user.uid).get();
              if (doc.exists) {
                const userData = doc.data();
                Auth.currentUser = userData;
                DB.setOne(KEYS.SESSION, userData);
                if (typeof Sync !== 'undefined') {
                  Sync.stop(); // Prevent duplicate listeners
                  Sync.init();
                }
                this.showShell();
                if (!this.currentPage) this.navigate(Auth.defaultPage());
              } else {
                // User deleted or role revoked
                await Auth.logout();
                this.showLogin();
              }
            }
          } catch (e) {
            console.error("Error fetching user data", e);
            // If offline or network error, keep using cached session
            if (!DB.getOne(KEYS.SESSION)) {
              this.showLogin();
            }
          }
        } else {
          Auth.currentUser = null;
          DB.remove(KEYS.SESSION);
          this.showLogin();
        }
      });
    } else {
      if (!DB.getOne(KEYS.SESSION)) {
        this.showLogin();
      }
    }
  },

  updateSeasonDisplay() {
    const active = Config.get().activeSeason;
    const badge = Utils.el('header-season-badge');
    if (badge) badge.textContent = active;
  },

  /* ── Login / Logout ── */
  showLogin() {
    Utils.show('screen-login');
    Utils.hide('app-shell');
  },

  _shellBound: false,

  showShell() {
    Utils.hide('screen-login');
    Utils.show('app-shell');
    this.renderHeader();
    this.renderNav();
    // Bind shell events only once to prevent duplicate listeners
    if (!this._shellBound) {
      this._shellBound = true;
      this.bindShellEvents();
    }
    this.applyRoleVisibility();
    this.updateSeasonDisplay();
  },

  bindLoginForm() {
    const form = Utils.el('login-form');
    const toggleBtn = Utils.el('toggle-pass');
    const passInput = Utils.el('login-password');

    toggleBtn?.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      Utils.el('eye-show').classList.toggle('hidden', !isPass);
      Utils.el('eye-hide').classList.toggle('hidden', isPass);
    });

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const username = Utils.el('login-username').value.trim();
      const password = Utils.el('login-password').value;
      const errEl    = Utils.el('login-error');
      const btn      = Utils.el('login-btn');

      if (!username || !password) {
        Utils.show(errEl); errEl.textContent = 'يرجى إدخال اسم المستخدم وكلمة المرور';
        return;
      }

      btn.textContent = '...جاري التحقق';
      btn.disabled = true;

      try {
        await Auth.login(username, password);
        // onAuthStateChanged will handle the rest (showing shell)
        Utils.hide(errEl);
        btn.textContent = 'تسجيل الدخول';
        btn.disabled = false;
      } catch (err) {
        console.error("Login Error:", err);
        Utils.show(errEl);
        errEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة. (' + (err.message || '') + ')';
        btn.textContent = 'تسجيل الدخول';
        btn.disabled = false;
        passInput.value = '';
      }
    });
  },

  bindShellEvents() {
    // Logout
    Utils.el('logout-btn')?.addEventListener('click', () => {
      Modal.confirm('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', () => {
        Auth.logout();
        this.showLogin();
        Utils.el('login-username').value = '';
        Utils.el('login-password').value = '';
        Utils.el('login-btn').textContent = 'تسجيل الدخول';
        Utils.el('login-btn').disabled = false;
      });
    });

    // Sidebar toggle
    Utils.el('sidebar-toggle')?.addEventListener('click', () => this.toggleSidebar());

    // Sidebar overlay - only add once
    if (!Utils.el('sidebar-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.id = 'sidebar-overlay';
      overlay.addEventListener('click', () => this.closeSidebar());
      document.body.appendChild(overlay);
    }

    // Nav links (sidebar + bottom nav)
    document.querySelectorAll('.nav-item, .bnav-item').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const page = link.dataset.page;
        if (page) { this.navigate(page); this.closeSidebar(); }
      });
    });
  },

  bindModalBackdrops() {
    document.addEventListener('click', e => {
      // Close modal backdrop click
      if (e.target.classList.contains('modal-backdrop')) {
        const id = e.target.id.replace('modal-', '');
        Modal.close(id);
      }
      
      const closeTarget = e.target.dataset.close;
      if (closeTarget) Modal.close(closeTarget);
      
      // Close buttons via cross icon
      const closeBtn = e.target.closest('.close-modal');
      if (closeBtn) {
        Modal.close(closeBtn.dataset.modal);
      }
    });

    // Color Modal events
    Utils.el('btn-add-color')?.addEventListener('click', () => Colors.openModal());
    Utils.el('btn-save-color')?.addEventListener('click', (e) => {
      e.preventDefault();
      Colors.saveColor();
    });
  },

  /* ── Navigation ── */
  navigate(page) {
    if (!Auth.can(page)) {
      Toast.error('ليس لديك صلاحية للوصول لهذه الصفحة');
      return;
    }

    // Hide all pages
    Utils.qsa('.page').forEach(p => p.classList.add('hidden'));

    // Show target page
    const el = Utils.el(`page-${page}`);
    if (el) el.classList.remove('hidden');

    this.currentPage = page;
    this.updateNavActive(page);

    // Load page data
    const loaders = {
      dashboard:     () => Dashboard.render(),
      models:        () => Models.render(),
      'add-model':   () => Models.renderForm(null),
      orders:        () => Orders.render(),
      'create-order':() => Orders.startNew(),
      inventory:     () => Inventory.render(),
      users:         () => Users.render(),
      colors:        () => Colors.render(),
      customers:     () => Customers.render(),
      seasons:       () => Seasons.render()
    };
    if (loaders[page]) loaders[page]();

    // Scroll to top
    Utils.el('main-content')?.scrollTo(0, 0);
  },

  updateNavActive(page) {
    Utils.qsa('.nav-item, .bnav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  },

  applyRoleVisibility() {
    const role = Auth.currentUser?.role;
    Utils.qsa('[data-roles]').forEach(el => {
      const roles = el.dataset.roles.split(',');
      if (!roles.includes(role)) el.style.display = 'none';
      else el.style.display = '';
    });
  },

  renderHeader() {
    const user = Auth.currentUser;
    if (!user) return;
    Utils.el('header-username').textContent = user.name;
    const badge = Utils.el('header-role-badge');
    const labels = { admin: 'مدير', sales: 'سيلز', warehouse: 'مخزن' };
    badge.textContent = labels[user.role] || user.role;
    badge.className = `role-badge ${user.role}`;
  },

  renderNav() {
    Utils.el('dashboard-date').textContent = Utils.today();
  },

  toggleSidebar() {
    this.sidebarOpen ? this.closeSidebar() : this.openSidebar();
  },

  openSidebar() {
    Utils.el('sidebar')?.classList.add('open');
    Utils.el('sidebar-overlay')?.classList.add('show');
    this.sidebarOpen = true;
  },

  closeSidebar() {
    Utils.el('sidebar')?.classList.remove('open');
    Utils.el('sidebar-overlay')?.classList.remove('show');
    this.sidebarOpen = false;
  },

  closeModal(name) { Modal.close(name); }
};

/* ─────────────────────────────────────────────
   DASHBOARD MODULE
───────────────────────────────────────────── */
const Dashboard = {
  render() {
    const activeSeason = Config.get().activeSeason;
    const models  = DB.get(KEYS.MODELS).filter(m => (m.season || 'الموسم الأول') === activeSeason);
    const orders  = DB.get(KEYS.ORDERS).filter(o => (o.season || 'الموسم الأول') === activeSeason);
    const todayISO = Utils.todayISO();

    // Stats
    Utils.el('stat-models').textContent       = models.length;
    Utils.el('stat-total-orders').textContent  = orders.length;
    Utils.el('stat-orders-today').textContent  = orders.filter(o => o.date === todayISO).length;

    // Low stock (any color < 6)
    let lowCount = 0;
    const lowItems = [];
    models.forEach(m => {
      m.colors.forEach(c => {
        if (c.quantity < 6 && c.quantity > 0) {
          lowCount++;
          lowItems.push({ model: m.name, color: c.name, qty: c.quantity });
        } else if (c.quantity === 0) {
          lowCount++;
          lowItems.push({ model: m.name, color: c.name, qty: 0 });
        }
      });
    });

    Utils.el('stat-low-stock').textContent = lowCount;

    const alertSection = Utils.el('low-stock-alert');
    const chipsEl      = Utils.el('low-stock-list');
    if (lowItems.length) {
      Utils.show(alertSection);
      chipsEl.innerHTML = lowItems.map(i =>
        `<span class="low-stock-chip">${Utils.sanitize(i.model)} - ${Utils.sanitize(i.color)}: <strong>${i.qty}</strong></span>`
      ).join('');
    } else {
      Utils.hide(alertSection);
    }

    // Recent orders (last 5)
    const recent = [...orders].reverse().slice(0, 5);
    const listEl = Utils.el('recent-orders-list');
    const emptyEl = Utils.el('no-recent-orders');
    if (!recent.length) {
      listEl.innerHTML = '';
      Utils.show(emptyEl);
    } else {
      Utils.hide(emptyEl);
      listEl.innerHTML = recent.map(o => `
        <div class="recent-order-item" data-action="order-detail" data-id="${o.id}">
          <div class="recent-order-left">
            <span class="recent-order-customer">${Utils.sanitize(o.customer.name)}</span>
            <span class="recent-order-meta">${Utils.sanitize(o.customer.phone || '')} | ${Utils.sanitize(o.customer.address || '')}</span>
          </div>
          <div class="recent-order-right">
            <span class="recent-order-qty">${o.totalPieces} قطعة</span>
            <span class="recent-order-date">${Utils.formatDate(o.date)}</span>
          </div>
        </div>
      `).join('');
    }
  }
};

/* ─────────────────────────────────────────────
   MODELS MODULE
───────────────────────────────────────────── */
const Models = {
  colorIndex: 0,

  render() {
    const models = DB.get(KEYS.MODELS);
    const activeSeason = Config.get().activeSeason;
    const seasonModels = models.filter(m => (m.season || 'الموسم الأول') === activeSeason);
    const grid   = Utils.el('models-grid');
    const empty  = Utils.el('models-empty');
    const countEl = Utils.el('models-count-label');

    // Bind buttons (use onclick to prevent stacking listeners)
    const btnAdd = Utils.el('btn-add-model');
    if (btnAdd) btnAdd.onclick = () => App.navigate('add-model');
    const btnBulk = Utils.el('btn-bulk-add');
    if (btnBulk) btnBulk.onclick = () => Models.startBulkAdd();

    // Search — pass full models array, renderGrid handles season filtering internally
    const searchInput = Utils.el('models-search');
    if (searchInput) {
      searchInput.oninput = () => this.renderGrid(models, searchInput.value);
    }

    if (!seasonModels.length) { Utils.hide(grid); Utils.show(empty); if (countEl) countEl.textContent = ''; return; }
    Utils.show(grid); Utils.hide(empty);
    if (countEl) countEl.textContent = `${seasonModels.length} موديل`;
    this.renderGrid(models, searchInput?.value || '');
  },

  renderGrid(models, search = '') {
    const grid = Utils.el('models-grid');
    const activeSeason = Config.get().activeSeason;
    
    // Filter by season and search
    let filtered = models.filter(m => (m.season || 'الموسم الأول') === activeSeason);
    if (search) {
      filtered = filtered.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
    }

    if (!filtered.length) {
      if (search) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><p>لا توجد نتائج لـ "${Utils.sanitize(search)}"</p></div>`;
      } else {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📦</div><p>لا توجد موديلات في هذا الموسم</p></div>`;
      }
      return;
    }

    grid.innerHTML = filtered.map(m => this.modelCardHTML(m)).join('');
  },

  modelCardHTML(m) {
    if (!m.colors || !Array.isArray(m.colors)) m.colors = [];
    const colorsHTML = m.colors.map(c => {
      const cls    = c.quantity === 0 ? 'zero' : c.quantity < 6 ? 'low' : 'ok';
      const label  = c.quantity === 0 ? 'نفد' : c.quantity < 6 ? 'منخفض' : 'متوفر';
      return `
        <div class="color-row">
          <span class="color-dot" style="background:${Utils.sanitize(c.code)}"></span>
          <span class="color-name">${Utils.sanitize(c.name)}</span>
          <span class="color-qty">${c.quantity}</span>
          <span class="color-qty-badge ${cls}">${label}</span>
        </div>`;
    }).join('');

    const totalLeft = m.colors.reduce((s, c) => s + c.quantity, 0);

    return `
      <div class="model-card" data-id="${m.id}">
        <div class="model-card-header">
          <div>
            <div class="model-card-name">${Utils.sanitize(m.name)}</div>
            <div class="model-card-total">متبقي: ${totalLeft} / ${m.totalPieces} قطعة</div>
          </div>
          <div class="model-card-actions">
            <button class="icon-btn-sm edit" title="تكرار" data-action="model-duplicate" data-id="${m.id}">
              <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            </button>
            <button class="icon-btn-sm edit" title="تعديل" data-action="model-edit" data-id="${m.id}">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="icon-btn-sm delete" title="حذف" data-action="model-delete" data-id="${m.id}">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
        <div class="model-colors">${colorsHTML}</div>
      </div>`;
  },

  /* ── Add/Edit Form ── */
  renderForm(modelId) {
    this.colorIndex = 0;
    const isEdit = !!modelId;
    const model  = isEdit ? DB.get(KEYS.MODELS).find(m => m.id === modelId) : null;

    Utils.el('add-model-title').textContent = isEdit ? 'تعديل الموديل' : 'إضافة موديل جديد';
    Utils.el('model-edit-id').value         = modelId || '';
    Utils.el('model-name').value            = model?.name || '';
    Utils.el('model-price').value           = model?.price || '';
    Utils.el('model-total').value           = model?.totalPieces || 48;
    Utils.el('colors-list').innerHTML       = '';
    Utils.hide('colors-empty-hint');
    Utils.hide('colors-total-check');

    if (model?.colors?.length) {
      model.colors.forEach(c => this.addColorRow(c));
    } else {
      Utils.show('colors-empty-hint');
    }

    // Bind events
    Utils.el('add-color-btn').onclick    = () => this.addColorRow(null);
    Utils.el('back-from-model').onclick  = () => App.navigate('models');
    Utils.el('cancel-model-btn').onclick = () => App.navigate('models');
    Utils.el('model-form').onsubmit      = e => { e.preventDefault(); this.saveModel(); };
    Utils.el('model-total').oninput      = () => this.checkColorsTotal();
  },

  addColorRow(existing) {
    const list = Utils.el('colors-list');
    Utils.hide('colors-empty-hint');
    const idx   = this.colorIndex++;
    const color = existing || { name: '', code: '#C9A84C', quantity: 12, originalQty: 12 };

    const row = document.createElement('div');
    row.className = 'color-input-row';
    row.dataset.idx = idx;
    row.innerHTML = `
      <div class="color-picker-wrap" title="اختر لون">
        <input type="color" value="${color.code}" data-preview="${idx}">
        <div class="color-picker-preview" id="preview-${idx}" style="background:${color.code}"></div>
      </div>
      <input type="text" placeholder="اسم اللون (مثال: أحمر)" list="available-colors" value="${Utils.sanitize(color.name)}" data-color-name="${idx}" required>
      <input type="number" placeholder="12" value="${color.quantity}" min="0" max="999" data-color-qty="${idx}">
      <button type="button" class="remove-color-btn" data-remove="${idx}">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>`;

    // Color picker sync
    const picker = row.querySelector(`input[type="color"]`);
    const preview = row.querySelector('.color-picker-preview');
    picker.addEventListener('input', () => { preview.style.background = picker.value; });

    // Remove row
    row.querySelector('.remove-color-btn').addEventListener('click', () => {
      row.remove();
      if (!Utils.el('colors-list').children.length) Utils.show('colors-empty-hint');
      this.checkColorsTotal();
    });

    // Qty change
    row.querySelector(`input[type="number"]`).addEventListener('input', () => this.checkColorsTotal());

    // Auto-select hex if name matches system color
    const nameInput = row.querySelector(`input[type="text"]`);
    nameInput.addEventListener('input', () => {
      const sysColors = DB.get(KEYS.COLORS);
      const match = sysColors.find(c => c.name === nameInput.value.trim());
      if (match) {
        picker.value = match.hex;
        preview.style.background = match.hex;
      }
    });

    list.appendChild(row);
    this.checkColorsTotal();
    
    // Add datalist if it doesn't exist
    if (!Utils.el('available-colors')) {
      const dl = document.createElement('datalist');
      dl.id = 'available-colors';
      document.body.appendChild(dl);
    }
    const dl = Utils.el('available-colors');
    dl.innerHTML = DB.get(KEYS.COLORS).map(c => `<option value="${c.name}"></option>`).join('');
  },

  checkColorsTotal() {
    const totalEl  = Utils.el('model-total');
    const expected = parseInt(totalEl?.value) || 0;
    const rows     = Utils.qsa('#colors-list .color-input-row');
    let sum = 0;
    rows.forEach(r => {
      const q = parseInt(r.querySelector('input[type="number"]')?.value) || 0;
      sum += q;
    });
    const check = Utils.el('colors-total-check');
    if (!rows.length) { Utils.hide(check); return; }
    Utils.show(check);
    if (sum === expected) {
      check.className = 'colors-total ok';
      check.textContent = `✅ مجموع الألوان = ${sum} قطعة (صحيح)`;
    } else {
      check.className = 'colors-total warn';
      check.textContent = `⚠️ مجموع الألوان = ${sum} والمطلوب ${expected} قطعة`;
    }
  },

  saveModel() {
    const name  = Utils.el('model-name').value.trim();
    const price = parseFloat(Utils.el('model-price').value) || 0;
    const total = parseInt(Utils.el('model-total').value) || 0;
    const editId = Utils.el('model-edit-id').value;

    if (!name) { Toast.error('يرجى إدخال اسم الموديل'); return; }
    if (!price) { Toast.error('يرجى إدخال السعر'); return; }
    if (!total) { Toast.error('يرجى إدخال إجمالي القطع'); return; }

    // Collect colors
    const rows  = Utils.qsa('#colors-list .color-input-row');
    if (!rows.length) { Toast.error('يرجى إضافة لون واحد على الأقل'); return; }

    const colors = [];
    let valid = true;
    rows.forEach(row => {
      const name = row.querySelector('input[type="text"]')?.value.trim();
      const code = row.querySelector('input[type="color"]')?.value.trim();
      const qty  = parseInt(row.querySelector('input[type="number"]')?.value) || 0;
      if (!name) { Toast.error('يرجى إدخال اسم كل لون'); valid = false; return; }
      if (!/^#([0-9A-Fa-f]{3}){1,2}$/.test(code)) { Toast.error('كود اللون غير صالح (يجب أن يكون بصيغة HEX)'); valid = false; return; }
      colors.push({ id: Utils.id(), name, code, quantity: qty, originalQty: qty });
    });
    if (!valid) return;

    const models = DB.get(KEYS.MODELS);

    if (editId) {
      // Edit: preserve sold quantities
      const idx = models.findIndex(m => m.id === editId);
      if (idx !== -1) {
        const existing = models[idx];
        // Update colors but try to keep sold data
        const updatedColors = colors.map((c) => {
          const oldC = existing.colors.find(ex => ex.name === c.name || ex.code === c.code);
          if (oldC) {
            const diff = c.quantity - oldC.quantity;
            return { ...c, originalQty: (oldC.originalQty || oldC.quantity) + diff, id: oldC.id };
          }
          return { ...c, originalQty: c.quantity, id: Utils.id() };
        });
        const updatedModel = { ...existing, name, price, totalPieces: total, colors: updatedColors };
        models[idx] = updatedModel;
        Sync.addOrUpdate(KEYS.MODELS, updatedModel.id, updatedModel);
        Toast.success('تم تحديث الموديل بنجاح ✅');
      }
    } else {
      const newModel = {
        id: Utils.id(),
        name,
        price,
        totalPieces: total,
        colors,
        season: Config.get().activeSeason,
        createdAt: Utils.todayISO()
      };
      models.push(newModel);
      Sync.addOrUpdate(KEYS.MODELS, newModel.id, newModel);
      Toast.success('تم إضافة الموديل بنجاح ✅');
    }

    DB.set(KEYS.MODELS, models);
    App.navigate('models');
  },

  editModel(id) {
    App.navigate('add-model');
    this.renderForm(id);
  },

  deleteModel(id) {
    const models = DB.get(KEYS.MODELS);
    const model  = models.find(m => m.id === id);
    Modal.confirm(
      'حذف الموديل',
      `هل تريد حذف موديل "${model?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`,
      () => {
        DB.set(KEYS.MODELS, models.filter(m => m.id !== id));
        Sync.delete(KEYS.MODELS, id);
        Toast.success('تم حذف الموديل');
        this.render();
      }
    );
  },

  duplicateModel(id) {
    const models = DB.get(KEYS.MODELS);
    const model = models.find(m => m.id === id);
    if (!model) return;
    
    const duplicate = JSON.parse(JSON.stringify(model));
    duplicate.id = Utils.id();
    duplicate.name = duplicate.name + ' (نسخة)';
    duplicate.createdAt = Utils.todayISO();
    duplicate.colors.forEach(c => c.id = Utils.id());

    models.push(duplicate);
    DB.set(KEYS.MODELS, models);
    Sync.addOrUpdate(KEYS.MODELS, duplicate.id, duplicate);
    Toast.success('تم تكرار الموديل بنجاح');
    this.render();
  },

  startBulkAdd() {
    App.navigate('bulk-models');
    
    // Generate headers
    const colors = DB.get(KEYS.COLORS);
    const thead = Utils.el('bulk-thead');
    thead.innerHTML = `<tr>
      <th>اسم الموديل</th>
      <th style="width: 100px;">السعر</th>
      <th style="width: 100px;">إجمالي القطع</th>
      ${colors.map(c => `<th style="width: 100px;">${Utils.sanitize(c.name)}</th>`).join('')}
      <th style="width: 50px;"></th>
    </tr>`;

    // Clear and add 3 rows default
    const tbody = Utils.el('bulk-tbody');
    tbody.innerHTML = '';
    this.addBulkRow();
    this.addBulkRow();
    this.addBulkRow();

    Utils.el('btn-bulk-add-row').onclick = () => this.addBulkRow();
    Utils.el('btn-save-bulk').onclick = () => this.saveBulkModels();
  },

  addBulkRow() {
    const tbody = Utils.el('bulk-tbody');
    const colors = DB.get(KEYS.COLORS);
    const tr = document.createElement('tr');
    tr.className = 'bulk-row';
    
    tr.innerHTML = `
      <td><input type="text" class="bulk-name" placeholder="اسم الموديل" style="width: 100%;"></td>
      <td><input type="number" class="bulk-price" min="0" placeholder="السعر" style="width: 100%;"></td>
      <td><input type="number" class="bulk-total" min="1" placeholder="48" style="width: 100%;"></td>
      ${colors.map(c => `<td><input type="number" class="bulk-qty" data-hex="${c.hex}" data-cname="${c.name}" min="0" placeholder="0" style="width: 100%;"></td>`).join('')}
      <td><button class="icon-btn-sm delete" data-action="bulk-row-remove"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></td>
    `;
    tbody.appendChild(tr);
  },

  saveBulkModels() {
    const rows = Utils.qsa('#bulk-tbody .bulk-row');
    const models = DB.get(KEYS.MODELS);
    let addedCount = 0;

    rows.forEach(tr => {
      const name = tr.querySelector('.bulk-name').value.trim();
      const price = parseFloat(tr.querySelector('.bulk-price').value) || 0;
      const totalPieces = parseInt(tr.querySelector('.bulk-total').value) || 0;
      
      if (!name) return; // skip empty rows

      const modelColors = [];
      tr.querySelectorAll('.bulk-qty').forEach(qtyInput => {
        const qty = parseInt(qtyInput.value) || 0;
        if (qty > 0) {
          modelColors.push({
            id: Utils.id(),
            name: qtyInput.dataset.cname,
            code: qtyInput.dataset.hex,
            quantity: qty,
            originalQty: qty
          });
        }
      });

      if (modelColors.length > 0) {
        models.push({
          id: Utils.id(),
          name,
          price,
          totalPieces: totalPieces || modelColors.reduce((s, c) => s + c.quantity, 0),
          colors: modelColors,
          season: Config.get().activeSeason,
          createdAt: Utils.todayISO()
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      DB.set(KEYS.MODELS, models);
      // Sync each new model to Firebase
      const allModels = DB.get(KEYS.MODELS);
      // Get the newly added models (last addedCount)
      allModels.slice(-addedCount).forEach(m => Sync.addOrUpdate(KEYS.MODELS, m.id, m));
      Toast.success(`تم حفظ ${addedCount} موديلات بنجاح ✅`);
      App.navigate('models');
    } else {
      Toast.error('لم يتم إدخال بيانات صحيحة للحفظ');
    }
  }
};

/* ─────────────────────────────────────────────
   ORDERS MODULE
───────────────────────────────────────────── */
const Orders = {
  draft: { customer: {}, items: [] },
  currentStep: 1,
  viewingOrderId: null,

  /* ── Orders List ── */
  render() {
    const activeSeason = Config.get().activeSeason;
    const orders = DB.get(KEYS.ORDERS).filter(o => (o.season || 'الموسم الأول') === activeSeason);
    const listEl = Utils.el('orders-list');
    const emptyEl= Utils.el('orders-empty');
    const countEl= Utils.el('orders-count-label');

    const btnNew = Utils.el('btn-new-order');
    if (btnNew) btnNew.onclick = () => App.navigate('create-order');
    const btnNewEmpty = Utils.el('btn-new-order-empty');
    if (btnNewEmpty) btnNewEmpty.onclick = () => App.navigate('create-order');

    // Always show newest first
    const reversed = [...orders].reverse();
    const searchInput = Utils.el('orders-search');
    if (searchInput) {
      searchInput.oninput = () => this.renderList(reversed, searchInput.value);
    }

    if (countEl) countEl.textContent = `${orders.length} أوردر`;

    if (!orders.length) { Utils.hide(listEl); Utils.show(emptyEl); return; }
    Utils.show(listEl); Utils.hide(emptyEl);
    this.renderList(reversed, '');
  },

  renderList(orders, search = '') {
    const listEl   = Utils.el('orders-list');
    const filtered = search
      ? orders.filter(o =>
          o.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
          o.date?.includes(search) ||
          o.id.toLowerCase().includes(search.toLowerCase())
        )
      : orders;

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>لا توجد نتائج لـ "${Utils.sanitize(search)}"</p></div>`;
      return;
    }

    listEl.innerHTML = filtered.map(o => `
      <div class="order-item" data-action="order-detail" data-id="${o.id}">
        <div class="order-item-left">
          <div class="order-item-num">${Utils.orderNum(o.id)}</div>
          <div class="order-item-name">${Utils.sanitize(o.customer?.name || 'بدون اسم')}</div>
          <div class="order-item-meta">
            📞 ${Utils.sanitize(o.customer?.phone || '-')} |
            📍 ${Utils.sanitize(o.customer?.address || '-')} |
            🗓 ${Utils.formatDate(o.date)}
          </div>
        </div>
        <div class="order-item-right">
          <div class="order-item-qty">${o.totalPieces} قطعة</div>
          <div class="order-item-actions">
            <button class="icon-btn-sm" title="طباعة" data-action="order-print" data-id="${o.id}">
              <svg viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
            </button>
            <button class="icon-btn-sm delete" title="حذف" data-action="order-delete" data-id="${o.id}">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
      </div>`).join('');
  },

  /* ── Create Order ── */
  qtyStepMultiplier: 1,

  startNew() {
    this.draft = { customer: {}, items: [] };
    this.qtyStepMultiplier = 1;
    this.goToStep(1);

    // Clear form fields
    ['customer-name','customer-address','customer-phone','customer-advance'].forEach(id => {
      const el = Utils.el(id); if (el) el.value = '';
    });

    // Reset multipliers UI
    const stepBtns = document.querySelectorAll('.qty-step-selector .step-btn');
    stepBtns.forEach(btn => btn.classList.remove('active'));
    if (stepBtns.length > 0) stepBtns[0].classList.add('active');

    // Bind step navigation
    Utils.el('back-from-order').onclick = () => App.navigate('orders');
    Utils.el('order-next-1').onclick    = () => this.step1Next();
    Utils.el('order-back-1').onclick    = () => this.goToStep(1);
    Utils.el('order-next-2').onclick    = () => this.step2Next();
    Utils.el('order-back-2').onclick    = () => this.goToStep(2);
    Utils.el('order-confirm-btn').onclick = () => this.confirmOrder();
    Utils.el('clear-basket-btn').onclick  = () => this.clearBasket();

    // Search in models step
    const modelSearch = Utils.el('order-search-model');
    if (modelSearch) {
      modelSearch.oninput = () => this.renderOrderModels(modelSearch.value);
    }

    // Populate Customers Datalist
    const datalist = Utils.el('customers-list');
    const nameInput = Utils.el('customer-name');
    const phoneInput = Utils.el('customer-phone');
    const addressInput = Utils.el('customer-address');
    
    if (datalist && nameInput) {
      const customers = DB.get(KEYS.CUSTOMERS);
      datalist.innerHTML = customers.map(c => `<option value="${Utils.sanitize(c.name)}">${c.phone}</option>`).join('');
      
      // Auto-fill on selection
      nameInput.oninput = () => {
        const selected = customers.find(c => c.name === nameInput.value);
        if (selected) {
          if (phoneInput) phoneInput.value = selected.phone || '';
          if (addressInput) addressInput.value = selected.address || '';
        }
      };
    }
  },

  setQtyStep(val) {
    this.qtyStepMultiplier = val;
    document.querySelectorAll('.qty-step-selector .step-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.textContent) === val);
    });
  },

  goToStep(n) {
    this.currentStep = n;
    for (let i = 1; i <= 3; i++) {
      Utils.hide(`order-step-${i}`);
      const indicator = Utils.el(`step-indicator-${i}`);
      if (indicator) {
        indicator.classList.remove('active','done');
        if (i < n) indicator.classList.add('done');
        if (i === n) indicator.classList.add('active');
      }
    }
    Utils.show(`order-step-${n}`);
    if (n === 1) this.renderOrderModels('');
    if (n === 3) this.renderReview();
  },

  step1Next() {
    if (!this.draft.items.length) {
      Toast.error('يرجى اختيار موديل واحد على الأقل');
      return;
    }
    this.goToStep(2);
  },

  step2Next() {
    const name  = Utils.el('customer-name').value.trim();
    const phone = Utils.el('customer-phone').value.trim();
    const address = Utils.el('customer-address').value.trim();
    if (!name)  { Toast.error('يرجى إدخال اسم التاجر'); return; }
    if (!phone) { Toast.error('يرجى إدخال رقم الموبايل'); return; }
    // تحقق من صحة رقم الموبايل (مصري: 01x + 8 أرقام)
    const phoneRegex = /^(010|011|012|015)\d{8}$/;
    if (!phoneRegex.test(phone.replace(/\s|-/g, ''))) {
      Toast.error('رقم الموبايل غير صحيح. مثال: 01012345678');
      return;
    }
    const advance = parseFloat(Utils.el('customer-advance').value) || 0;
    
    this.draft.customer = { name, address, phone };
    this.draft.advance = advance;

    // Auto-save customer
    const customers = DB.get(KEYS.CUSTOMERS);
    const existing = customers.find(c => c.name === name || c.phone === phone);
    if (!existing) {
      const newCust = { id: Utils.id(), name, phone, address, createdAt: Utils.todayISO() };
      customers.push(newCust);
      DB.set(KEYS.CUSTOMERS, customers);
      if (typeof Sync !== 'undefined' && Sync.addOrUpdate) Sync.addOrUpdate(KEYS.CUSTOMERS, newCust.id, newCust);
    } else {
      // Update address if it was empty
      let updated = false;
      if (!existing.address && address) { existing.address = address; updated = true; }
      if (!existing.phone && phone) { existing.phone = phone; updated = true; }
      if (updated) {
        DB.set(KEYS.CUSTOMERS, customers);
        if (typeof Sync !== 'undefined' && Sync.addOrUpdate) Sync.addOrUpdate(KEYS.CUSTOMERS, existing.id, existing);
      }
    }

    this.goToStep(3);
  },

  renderOrderModels(search = '') {
    const activeSeason = Config.get().activeSeason;
    const allModels = DB.get(KEYS.MODELS);
    
    // Filter models by the active season first
    let models = allModels.filter(m => (m.season || 'الموسم الأول') === activeSeason);

    const container = Utils.el('order-models-container');
    const filtered  = search
      ? models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
      : models;

    if (!filtered.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>لا توجد موديلات${search ? ' لهذا البحث' : '. أضف موديلات أولاً'}</p></div>`;
      return;
    }

    container.innerHTML = filtered.map(m => this.orderModelCardHTML(m)).join('');
    this.updateBasketBar();
  },

  orderModelCardHTML(m) {
    const colorsHTML = m.colors.map(c => {
      const basketItem = this.draft.items.find(i => i.modelId === m.id && i.colorId === c.id);
      const qty = basketItem ? basketItem.quantity : 0;
      const stockClass = c.quantity === 0 ? 'stock-zero' : c.quantity < 6 ? 'stock-low' : 'stock-ok';
      return `
        <div class="order-color-row">
          <span class="order-color-swatch" style="background:${c.code}"></span>
          <span class="order-color-name">${Utils.sanitize(c.name)}</span>
          <span class="order-color-stock ${stockClass}">متبقي: ${c.quantity}</span>
          <div class="order-qty-ctrl">
            <button class="qty-btn" data-action="qty-minus" data-model="${m.id}" data-color="${c.id}">−</button>
            <input class="qty-input" type="number" min="0" max="${c.quantity}"
              value="${qty}"
              id="qty-${m.id}-${c.id}"
              data-model="${m.id}"
              data-color="${c.id}"
              data-mname="${Utils.sanitize(m.name)}"
              data-cname="${Utils.sanitize(c.name)}"
              data-ccode="${c.code}"
              data-cqty="${c.quantity}"
              data-mprice="${m.price || 0}">
            <button class="qty-btn" data-action="qty-plus" data-model="${m.id}" data-color="${c.id}">+</button>
          </div>
        </div>`;
    }).join('');

    const inBasket = this.draft.items.filter(i => i.modelId === m.id).reduce((s,i) => s + i.quantity, 0);
    return `
      <div class="order-model-card ${inBasket ? 'expanded' : ''}" id="omc-${m.id}">
        <div class="order-model-header" data-action="model-toggle" data-id="${m.id}">
          <div>
            <div class="order-model-name">${Utils.sanitize(m.name)}</div>
            <div class="order-model-stock">متبقي: ${m.colors.reduce((s,c)=>s+c.quantity,0)} قطعة${inBasket ? ` | في السلة: ${inBasket}` : ''}</div>
          </div>
          <div class="order-model-chevron">
            <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
          </div>
        </div>
        <div class="order-model-colors">${colorsHTML}</div>
      </div>`;
  },

  toggleModelCard(modelId) {
    const card = Utils.el(`omc-${modelId}`);
    if (card) card.classList.toggle('expanded');
  },

  changeQty(modelId, colorId, delta) {
    const inputEl = Utils.el(`qty-${modelId}-${colorId}`);
    if (!inputEl) return;
    const models = DB.get(KEYS.MODELS);
    const model  = models.find(m => m.id === modelId);
    const color  = model?.colors.find(c => c.id === colorId);
    if (!color) return;
    const current = parseInt(inputEl.value) || 0;
    const effectiveDelta = delta * this.qtyStepMultiplier;
    const newVal  = Math.max(0, Math.min(color.quantity, current + effectiveDelta));
    inputEl.value = newVal;
    this.setQty(modelId, colorId, newVal, model.name, color.name, color.code, color.quantity, model.price || 0);
  },

  setQty(modelId, colorId, value, modelName, colorName, colorCode, maxQty, price) {
    let qty = parseInt(value) || 0;
    if (qty > maxQty) { qty = maxQty; const inp = Utils.el(`qty-${modelId}-${colorId}`); if (inp) inp.value = qty; Toast.warning(`الحد الأقصى للون هذا ${maxQty} قطعة`); }
    if (qty < 0) qty = 0;

    const idx = this.draft.items.findIndex(i => i.modelId === modelId && i.colorId === colorId);
    if (qty === 0) {
      if (idx !== -1) this.draft.items.splice(idx, 1);
    } else {
      if (idx !== -1) {
        this.draft.items[idx].quantity = qty;
        this.draft.items[idx].price = price;
      } else {
        this.draft.items.push({ modelId, colorId, modelName, colorName, colorCode, quantity: qty, maxQty, price });
      }
    }

    // Update model card stock label
    const card = Utils.el(`omc-${modelId}`);
    if (card) {
      const totalInBasket = this.draft.items.filter(i => i.modelId === modelId).reduce((s,i) => s + i.quantity, 0);
      const stockEl = card.querySelector('.order-model-stock');
      if (stockEl) {
        const models = DB.get(KEYS.MODELS);
        const model  = models.find(m => m.id === modelId);
        const remain = model ? model.colors.reduce((s,c) => s + c.quantity, 0) : 0;
        stockEl.textContent = `متبقي: ${remain} قطعة${totalInBasket ? ` | في السلة: ${totalInBasket}` : ''}`;
      }
    }

    this.updateBasketBar();
  },

  clearBasket() {
    this.draft.items = [];
    // Reset all qty inputs
    Utils.qsa('.qty-input').forEach(inp => inp.value = 0);
    this.updateBasketBar();
    
    // Re-render models to update stock UI
    const searchInput = Utils.el('order-search-model');
    this.renderOrderModels(searchInput ? searchInput.value : '');
    
    Toast.info('تم مسح السلة');
  },

  updateBasketBar() {
    const count = this.draft.items.length;
    const total = this.draft.items.reduce((s, i) => s + i.quantity, 0);
    Utils.el('basket-items-count').textContent = count;
    Utils.el('basket-total-qty').textContent   = total;
  },

  renderReview() {
    const c = this.draft.customer;
    // Customer card
    Utils.el('review-customer-card').innerHTML = `
      <h3>بيانات التاجر</h3>
      <div class="review-customer-line"><span>الاسم:</span><strong>${Utils.sanitize(c.name)}</strong></div>
      <div class="review-customer-line"><span>الموبايل:</span><strong>${Utils.sanitize(c.phone)}</strong></div>
      ${c.address ? `<div class="review-customer-line"><span>العنوان:</span><strong>${Utils.sanitize(c.address)}</strong></div>` : ''}`;

    // Items
    const itemsEl = Utils.el('review-items-list');
    itemsEl.innerHTML = this.draft.items.map(item => `
      <div class="review-item">
        <span class="review-item-color" style="background:${item.colorCode};width:14px;height:14px;border-radius:50%;flex-shrink:0;border:2px solid rgba(255,255,255,.2)"></span>
        <span class="review-item-name">${Utils.sanitize(item.modelName)} — ${Utils.sanitize(item.colorName)}</span>
        <span class="review-item-qty">${item.quantity} قطعة × ${item.price} ج = ${item.quantity * item.price} ج</span>
      </div>`).join('');

    // Totals
    const totalPieces = this.draft.items.reduce((s,i) => s + i.quantity, 0);
    const totalPrice = this.draft.items.reduce((s,i) => s + (i.quantity * (i.price || 0)), 0);
    const advance = this.draft.advance || 0;
    const remaining = totalPrice - advance;

    let totalsHTML = `
      <div class="review-total-item"><span class="review-total-value">${totalPrice}</span><span class="review-total-label">المبلغ الكلي (ج)</span></div>
      <div class="review-total-item"><span class="review-total-value">${totalPieces}</span><span class="review-total-label">إجمالي القطع</span></div>
      <div class="review-total-item"><span class="review-total-value">${this.draft.items.length}</span><span class="review-total-label">أصناف</span></div>`;
    
    if (advance > 0) {
      totalsHTML += `
      <div class="review-total-item" style="color: var(--green)"><span class="review-total-value">${advance}</span><span class="review-total-label">العربون المدفوع (ج)</span></div>
      <div class="review-total-item" style="color: var(--red)"><span class="review-total-value">${remaining}</span><span class="review-total-label">المتبقي (ج)</span></div>`;
    }

    Utils.el('review-totals').innerHTML = totalsHTML;
  },

  async confirmOrder() {
    if (!this.draft.items.length) { Toast.error('السلة فارغة'); return; }

    const totalPieces = this.draft.items.reduce((s, i) => s + i.quantity, 0);
    const totalPrice = this.draft.items.reduce((s, i) => s + (i.quantity * (i.price || 0)), 0);

    const order = {
      id:          Utils.id(),
      date:        Utils.todayISO(),
      season:      Config.get().activeSeason,
      customer:    this.draft.customer,
      items:       this.draft.items,
      totalPieces,
      totalPrice,
      advance:     this.draft.advance || 0,
      staff:       Auth.currentUser?.name || 'غير محدد'
    };

    // Show loading
    const btn = Utils.el('order-confirm-btn');
    const origText = btn.innerHTML;
    btn.innerHTML = 'جاري التأكيد...';
    btn.disabled = true;

    try {
      if (typeof fireDB !== 'undefined' && fireDB) {
        await Sync.confirmOrderTransaction(order, this.draft.items);
      } else {
        // Fallback for purely local dev without Firebase
        const models = DB.get(KEYS.MODELS);
        this.draft.items.forEach(item => {
          const mIdx = models.findIndex(m => m.id === item.modelId);
          if (mIdx !== -1) {
            const cIdx = models[mIdx].colors.findIndex(c => c.id === item.colorId);
            if (cIdx !== -1) models[mIdx].colors[cIdx].quantity = Math.max(0, models[mIdx].colors[cIdx].quantity - item.quantity);
          }
        });
        DB.set(KEYS.MODELS, models);
        const orders = DB.get(KEYS.ORDERS);
        orders.push(order);
        DB.set(KEYS.ORDERS, orders);
      }
    } catch (err) {
      console.error(err);
      let errMsg = 'حدث خطأ أثناء تأكيد الأوردر. قد يكون السبب مشكلة في الاتصال بالإنترنت.';
      if (err.message && !err.message.includes('internet') && !err.message.includes('offline') && !err.message.includes('network') && !err.message.includes('fetch')) {
         errMsg = err.message;
      }
      Toast.error(errMsg);
      btn.innerHTML = origText;
      btn.disabled = false;
      return;
    }

    btn.innerHTML = origText;
    btn.disabled = false;

    Toast.success('تم تأكيد الأوردر بنجاح! 🎉');

    // Show success modal
    const printBtn = Utils.el('btn-success-print');
    if (printBtn) {
      printBtn.onclick = () => {
        Modal.close('order-success');
        this.printOrder(order.id);
        App.navigate('orders');
      };
    }
    Modal.open('order-success');
  },

  /* ── Print ── */
  printOrder(orderId) {
    const orders = DB.get(KEYS.ORDERS);
    const order  = orders.find(o => o.id === orderId);
    if (!order) { Toast.error('لم يتم العثور على الأوردر'); return; }

    Utils.el('print-order-num').textContent   = Utils.orderNum(order.id);
    Utils.el('print-order-date').textContent  = Utils.formatDate(order.date);
    Utils.el('print-order-staff').textContent = order.staff || '-';
    Utils.el('print-cust-name').textContent    = order.customer?.name || '';
    Utils.el('print-cust-phone').textContent   = order.customer?.phone || '';
    Utils.el('print-cust-address').textContent = order.customer?.address || '';

    const tbody = Utils.el('print-items-body');
    let totalPieces = 0;
    let totalPrice = 0;
    tbody.innerHTML = order.items.map((item, idx) => {
      totalPieces += item.quantity;
      totalPrice += item.quantity * (item.price || 0);
      return `<tr>
        <td>${idx + 1}</td>
        <td>${Utils.sanitize(item.modelName)}</td>
        <td>${Utils.sanitize(item.colorName)}</td>
        <td>${item.quantity}</td>
        <td>${item.price || 0}</td>
        <td>${item.quantity * (item.price || 0)}</td>
      </tr>`;
    }).join('');

    Utils.el('print-total-pieces').textContent = totalPieces;
    Utils.el('print-total-price').textContent = totalPrice + ' ج';

    const tfoot = Utils.el('print-tfoot');
    const advance = order.advance || 0;
    
    // Clear previously injected rows if any
    const extraRows = tfoot.querySelectorAll('.advance-row');
    extraRows.forEach(r => r.remove());

    if (advance > 0) {
      const remaining = totalPrice - advance;
      const advanceRow = document.createElement('tr');
      advanceRow.className = 'print-total-row advance-row';
      advanceRow.innerHTML = `
        <td colspan="4"></td>
        <td><strong>العربون المدفوع</strong></td>
        <td><strong>${advance} ج</strong></td>
      `;
      const remainingRow = document.createElement('tr');
      remainingRow.className = 'print-total-row advance-row';
      remainingRow.innerHTML = `
        <td colspan="4"></td>
        <td><strong>المتبقي</strong></td>
        <td><strong>${remaining} ج</strong></td>
      `;
      tfoot.appendChild(advanceRow);
      tfoot.appendChild(remainingRow);
    }

    window.print();
  },

  /* ── Order Detail Modal ── */
  showDetail(orderId) {
    const orders = DB.get(KEYS.ORDERS);
    const order  = orders.find(o => o.id === orderId);
    if (!order) return;

    this.viewingOrderId = orderId;
    Utils.el('order-detail-title').textContent = `${Utils.orderNum(order.id)} | ${Utils.sanitize(order.customer?.name || '')}`;

    const body = Utils.el('order-detail-body');
    const totalPieces = order.totalPieces || order.items.reduce((s,i) => s+i.quantity, 0);
    body.innerHTML = `
      <div class="order-detail-section">
        <h4>بيانات التاجر</h4>
        <div class="order-detail-customer">
          <div class="odc-line"><span class="odc-label">الاسم:</span><strong>${Utils.sanitize(order.customer?.name||'')}</strong></div>
          <div class="odc-line"><span class="odc-label">الموبايل:</span><strong>${Utils.sanitize(order.customer?.phone||'')}</strong></div>
          <div class="odc-line"><span class="odc-label">العنوان:</span><strong>${Utils.sanitize(order.customer?.address||'-')}</strong></div>
          <div class="odc-line"><span class="odc-label">التاريخ:</span><strong>${Utils.formatDate(order.date)}</strong></div>
        </div>
      </div>
      <div class="order-detail-section">
        <h4>الأصناف (${order.items.length} صنف | ${totalPieces} قطعة)</h4>
        <div class="order-detail-items">
          ${order.items.map(item => `
            <div class="odi-item">
              <span class="odi-dot" style="background:${item.colorCode}"></span>
              <span class="odi-name">${Utils.sanitize(item.modelName)} — ${Utils.sanitize(item.colorName)}</span>
              <span class="odi-qty">${item.quantity} قطعة</span>
            </div>`).join('')}
        </div>
      </div>`;

    Utils.el('reprint-order-btn').onclick = () => { Modal.close('order-detail'); this.printOrder(orderId); };
    Modal.open('order-detail');
  },

  deleteOrder(id) {
    const orders = DB.get(KEYS.ORDERS);
    const order  = orders.find(o => o.id === id);
    Modal.confirm(
      'حذف الأوردر',
      `هل تريد حذف أوردر "${order?.customer?.name}"؟ سيتم استرجاع الكميات للمخزون.`,
      async () => {
        try {
          if (typeof fireDB !== 'undefined' && fireDB) {
            await Sync.deleteOrderTransaction(order);
          } else {
            // Restore inventory locally
            const models = DB.get(KEYS.MODELS);
            order.items.forEach(item => {
              const mIdx = models.findIndex(m => m.id === item.modelId);
              if (mIdx === -1) return;
              const cIdx = models[mIdx].colors.findIndex(c => c.id === item.colorId);
              if (cIdx !== -1) models[mIdx].colors[cIdx].quantity += item.quantity;
            });
            DB.set(KEYS.MODELS, models);
            DB.set(KEYS.ORDERS, orders.filter(o => o.id !== id));
          }
          Toast.success('تم حذف الأوردر واسترجاع المخزون');
          this.render();
        } catch (err) {
          console.error(err);
          let errMsg = 'حدث خطأ أثناء حذف الأوردر';
          if (err.message && !err.message.includes('internet') && !err.message.includes('offline') && !err.message.includes('network') && !err.message.includes('fetch')) {
             errMsg = err.message;
          }
          Toast.error(errMsg);
        }
      }
    );
  }
};

/* ─────────────────────────────────────────────
   INVENTORY MODULE
───────────────────────────────────────────── */
const Inventory = {
  render() {
    const activeSeason = Config.get().activeSeason;
    const models  = DB.get(KEYS.MODELS).filter(m => (m.season || 'الموسم الأول') === activeSeason);
    const content = Utils.el('inventory-content');
    const emptyEl = Utils.el('inventory-empty');

    const exportBtn = Utils.el('export-inventory-btn');
    if (exportBtn) exportBtn.onclick = () => this.exportCSV();

    const searchInput = Utils.el('inventory-search');
    if (searchInput) {
      searchInput.oninput = () => this.renderContent(models, searchInput.value);
    }

    if (!models.length) { Utils.hide(content); Utils.show(emptyEl); return; }
    Utils.show(content); Utils.hide(emptyEl);
    this.renderContent(models, '');
  },

  renderContent(models, search = '') {
    const content  = Utils.el('inventory-content');
    const filtered = search
      ? models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
      : models;

    if (!filtered.length) {
      content.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>لا توجد نتائج لـ "${Utils.sanitize(search)}"</p></div>`;
      return;
    }

    content.innerHTML = filtered.map(m => {
      const totalLeft     = m.colors.reduce((s, c) => s + c.quantity, 0);
      const totalOriginal = m.colors.reduce((s, c) => s + (c.originalQty || c.quantity), 0);

      const rows = m.colors.map(c => {
        const orig    = c.originalQty || c.quantity;
        const pct     = orig > 0 ? Math.round((c.quantity / orig) * 100) : 0;
        const cls     = c.quantity === 0 ? 'fill-red' : c.quantity < 6 ? 'fill-orange' : 'fill-green';
        const numCls  = c.quantity === 0 ? 'stock-zero' : c.quantity < 6 ? 'stock-low' : 'stock-ok';
        const sold    = orig - c.quantity;
        return `
          <tr>
            <td><div class="inv-color-cell"><span class="inv-dot" style="background:${c.code}"></span>${Utils.sanitize(c.name)}</div></td>
            <td>${orig}</td>
            <td>${sold}</td>
            <td>
              <div class="stock-bar-wrap">
                <div class="stock-bar"><div class="stock-bar-fill ${cls}" style="width:${pct}%"></div></div>
                <span class="stock-num ${numCls}">${c.quantity}</span>
              </div>
            </td>
            <td><span class="color-qty-badge ${c.quantity===0?'zero':c.quantity<6?'low':'ok'}">${c.quantity===0?'نفد':c.quantity<6?'منخفض':'متوفر'}</span></td>
          </tr>`;
      }).join('');

      return `
        <div class="inventory-model-section">
          <div class="inventory-model-name">
            ${Utils.sanitize(m.name)}
            <span class="total-badge">متبقي: ${totalLeft} / ${totalOriginal}</span>
          </div>
          <table class="inventory-colors-table">
            <thead><tr><th>اللون</th><th>الأصلي</th><th>المباع</th><th>المتبقي</th><th>الحالة</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');
  },

  exportCSV() {
    const activeSeason = Config.get().activeSeason;
    const models = DB.get(KEYS.MODELS).filter(m => (m.season || 'الموسم الأول') === activeSeason);
    if (!models.length) { Toast.warning('لا توجد بيانات للتصدير'); return; }
    let csv = '\uFEFF'; // BOM for Arabic in Excel
    csv += 'الموديل,اللون,الكمية الأصلية,المباع,المتبقي\n';
    models.forEach(m => {
      m.colors.forEach(c => {
        const orig = c.originalQty || c.quantity;
        const sold = orig - c.quantity;
        let mName = m.name || '';
        let cName = c.name || '';
        if (/^[=\-+\@]/.test(mName)) mName = "'" + mName;
        if (/^[=\-+\@]/.test(cName)) cName = "'" + cName;
        const escName = mName.replace(/"/g, '""');
        const escColor = cName.replace(/"/g, '""');
        csv += `"${escName}","${escColor}",${orig},${sold},${c.quantity}\n`;
      });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `vengo-inventory-${Utils.todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.success('تم تصدير التقرير بنجاح');
  }
};

/* ─────────────────────────────────────────────
   USERS MODULE
───────────────────────────────────────────── */
const Users = {
  render() {
    const users  = DB.get(KEYS.USERS);
    const grid   = Utils.el('users-grid');
    const countEl= Utils.el('users-count-label');

    countEl.textContent = `${users.length} مستخدمين`;

    const btnAdd = Utils.el('btn-add-user');
    if (btnAdd) btnAdd.onclick = () => this.openUserModal(null);
    
    const btnSave = Utils.el('save-user-btn');
    if (btnSave) btnSave.onclick = () => this.saveUser();

    grid.innerHTML = users.map(u => this.userCardHTML(u)).join('');
  },

  userCardHTML(u) {
    const isSelf = u.id === Auth.currentUser?.id;
    const roleLabels = { admin: 'مدير', sales: 'سيلز', warehouse: 'مخزن' };
    const initial = (u.name || '?').charAt(0);
    return `
      <div class="user-card">
        <div class="user-card-top">
          <div class="user-avatar ${u.role}">${initial}</div>
          <div class="user-info">
            <div class="user-fullname">${Utils.sanitize(u.name)}</div>
            <div class="user-username">@${Utils.sanitize(u.username)}</div>
          </div>
        </div>
        <div class="user-card-bottom">
          <span class="role-badge ${u.role}">${roleLabels[u.role] || u.role}</span>
          <div style="display:flex;align-items:center;gap:.5rem">
            ${isSelf ? '<span class="user-self-badge">أنت</span>' : ''}
            <div class="user-card-actions">
              <button class="icon-btn-sm edit" title="تعديل" data-action="user-edit" data-id="${u.id}">
                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
              ${!isSelf ? `<button class="icon-btn-sm delete" title="حذف" data-action="user-delete" data-id="${u.id}">
                <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>` : ''}
            </div>
          </div>
        </div>
      </div>`;
  },

  openUserModal(userId) {
    const isEdit = !!userId;
    const user   = isEdit ? DB.get(KEYS.USERS).find(u => u.id === userId) : null;

    Utils.el('user-modal-title').textContent = isEdit ? 'تعديل مستخدم' : 'إضافة مستخدم جديد';
    Utils.el('user-edit-id').value    = userId || '';
    Utils.el('user-fullname').value   = user?.name || '';
    const usernameInput = Utils.el('user-username');
    usernameInput.value = user?.username || '';
    usernameInput.disabled = isEdit;
    Utils.el('user-password').value   = '';
    Utils.el('user-role').value       = user?.role || '';

    // Restore password label correctly for both modes
    const passLabel = Utils.qs('label[for="user-password"]') ||
                      Utils.el('user-password')?.previousElementSibling;
    if (passLabel) {
      passLabel.innerHTML = isEdit
        ? 'كلمة المرور (اتركها فارغة للإبقاء عليها)'
        : 'كلمة المرور <span class="req">*</span>';
    }

    Modal.open('user');
  },

  async saveUser() {
    const editId   = Utils.el('user-edit-id').value;
    const name     = Utils.el('user-fullname').value.trim();
    const username = Utils.el('user-username').value.trim();
    const password = Utils.el('user-password').value;
    const role     = Utils.el('user-role').value;

    if (!name)     { Toast.error('يرجى إدخال الاسم الكامل'); return; }
    if (!username) { Toast.error('يرجى إدخال اسم الدخول'); return; }
    if (!role)     { Toast.error('يرجى تحديد الدور'); return; }
    if (!editId && !password) { Toast.error('يرجى إدخال كلمة المرور'); return; }

    const users = DB.get(KEYS.USERS);

    // Check username uniqueness
    const duplicate = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== editId);
    if (duplicate) { Toast.error('اسم الدخول موجود بالفعل'); return; }

    const btn = Utils.el('save-user-btn');
    if(btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ...'; }

    try {
      if (editId) {
        const idx = users.findIndex(u => u.id === editId);
        if (idx !== -1) {
          const email = `${username}@vengo-wear.com`;
          
          if (password) {
            if (editId === Auth.currentUser?.id) {
              await firebase.auth().currentUser.updatePassword(password);
            } else {
              Toast.warning('لا يمكن تغيير كلمة مرور مستخدم آخر من لوحة التحكم، يجب عليه تغييرها بنفسه أو قم بحذفه وإضافته مجدداً.');
            }
          }

          users[idx] = {
            ...users[idx],
            name, username, role, email
          };
          
          if (editId === Auth.currentUser?.id) {
            Auth.currentUser = users[idx];
            App.renderHeader();
          }
          Sync.addOrUpdate(KEYS.USERS, editId, users[idx]);
          Toast.success('تم تحديث المستخدم بنجاح');
        }
      } else {
        const email = `${username}@vengo-wear.com`;
        
        // Use a secondary app safely to create the user without logging out the admin
        let secondaryApp = firebase.apps?.find(app => app.name === "Secondary");
        if (!secondaryApp) {
          secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
        }
        
        try {
          const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
          const uid = userCredential.user.uid;
          await secondaryApp.auth().signOut();

          const newUser = { id: uid, uid: uid, name, username, email, role, createdAt: Utils.todayISO() };
          users.push(newUser);
          Sync.addOrUpdate(KEYS.USERS, uid, newUser);
          Toast.success('تم إضافة المستخدم بنجاح');
        } finally {
          await secondaryApp.delete().catch(() => {});
        }
      }

      DB.set(KEYS.USERS, users);
      Modal.close('user');
      this.render();
    } catch (err) {
      console.error(err);
      let msg = err.message;
      if (err.code === 'auth/email-already-in-use') {
        msg = 'اسم المستخدم هذا مسجل بالفعل في نظام الحسابات (Firebase Auth)! يرجى اختيار اسم مستخدم آخر، أو حذف الحساب القديم من لوحة تحكم Firebase Authentication.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'كلمة المرور ضعيفة (يجب أن تكون 6 أحرف أو أكثر).';
      }
      Toast.error('حدث خطأ: ' + msg);
    } finally {
      if(btn) { btn.disabled = false; btn.textContent = 'حفظ'; }
    }
  },

  deleteUser(id) {
    const users = DB.get(KEYS.USERS);
    const user  = users.find(u => u.id === id);
    if (users.filter(u => u.role === 'admin').length === 1 && user?.role === 'admin') {
      Toast.error('لا يمكن حذف المدير الوحيد في النظام');
      return;
    }
    Modal.confirm(
      'حذف المستخدم',
      `هل تريد حذف المستخدم "${user?.name}"؟`,
      () => {
        DB.set(KEYS.USERS, users.filter(u => u.id !== id));
        Sync.delete(KEYS.USERS, id);
        Toast.success('تم حذف المستخدم');
        this.render();
      }
    );
  }
};

/* ─────────────────────────────────────────────
   COLORS MODULE
───────────────────────────────────────────── */
const Colors = {
  render() {
    this.renderGrid();
    Utils.el('colors-count-label').textContent = `العدد: ${DB.get(KEYS.COLORS).length}`;
  },

  renderGrid() {
    const colors = DB.get(KEYS.COLORS);
    const container = Utils.el('colors-grid');
    if (!container) return;
    
    if (!colors.length) {
      container.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-icon">🎨</div>
        <h3>لا توجد ألوان</h3>
        <p>أضف الألوان التي تستخدمها في التصنيع</p>
        <button class="btn btn-primary" style="margin-top: 1rem;" data-action="color-restore">
          استعادة الألوان الأساسية
        </button>
      </div>`;
      return;
    }

    container.innerHTML = colors.map(c => `
      <div class="user-card" style="border-top: 4px solid ${c.hex}">
        <div class="user-card-body">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <div style="width:24px; height:24px; border-radius:50%; background:${c.hex}; border:1px solid #ddd;"></div>
              <h3 class="user-name">${Utils.sanitize(c.name)}</h3>
            </div>
            <div class="user-card-actions">
              <button class="icon-btn-sm edit" title="تعديل" data-action="color-edit" data-id="${c.id}">
                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
              <button class="icon-btn-sm delete" title="حذف" data-action="color-delete" data-id="${c.id}">
                <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>`).join('');
  },

  openModal(id) {
    const isEdit = !!id;
    const color = isEdit ? DB.get(KEYS.COLORS).find(c => c.id === id) : null;
    
    Utils.el('color-modal-title').textContent = isEdit ? 'تعديل لون' : 'إضافة لون جديد';
    Utils.el('color-id').value = id || '';
    Utils.el('color-name').value = color?.name || '';
    Utils.el('color-hex').value = color?.hex || '#3B82F6';
    
    Modal.open('color');
  },

  saveColor() {
    const id = Utils.el('color-id').value;
    const name = Utils.el('color-name').value.trim();
    const hex = Utils.el('color-hex').value.trim();

    if (!name) { Toast.error('يرجى إدخال اسم اللون'); return; }
    if (!/^#([0-9A-Fa-f]{3}){1,2}$/.test(hex)) { Toast.error('صيغة اللون غير صحيحة، يجب أن تكون HEX مثل #FFFFFF'); return; }

    const colors = DB.get(KEYS.COLORS);
    const duplicate = colors.find(c => c.name === name && c.id !== id);
    if (duplicate) { Toast.error('يوجد لون بهذا الاسم بالفعل'); return; }

    if (id) {
      const idx = colors.findIndex(c => c.id === id);
      if (idx !== -1) {
        colors[idx] = { ...colors[idx], name, hex };
        Sync.addOrUpdate(KEYS.COLORS, colors[idx].id, colors[idx]);
        Toast.success('تم تحديث اللون بنجاح');
      }
    } else {
      const newColor = { id: Utils.id(), name, hex };
      colors.push(newColor);
      Sync.addOrUpdate(KEYS.COLORS, newColor.id, newColor);
      Toast.success('تم إضافة اللون بنجاح');
    }

    DB.set(KEYS.COLORS, colors);
    Modal.close('color');
    this.render();
  },

  deleteColor(id) {
    const colors = DB.get(KEYS.COLORS);
    const color = colors.find(c => c.id === id);
    Modal.confirm('حذف اللون', `هل أنت متأكد من حذف اللون "${color?.name}"؟`, () => {
      DB.set(KEYS.COLORS, colors.filter(c => c.id !== id));
      Sync.delete(KEYS.COLORS, id);
      Toast.success('تم حذف اللون بنجاح');
      this.render();
    });
  },

  async restoreDefaults() {
    const defaultColors = [
      { name: 'اسود', hex: '#1a1a1a' },
      { name: 'ابيض', hex: '#f0f0f0' },
      { name: 'احمر', hex: '#d0342c' },
      { name: 'ازرق', hex: '#2563eb' },
      { name: 'اصفر', hex: '#eab308' },
      { name: 'اخضر', hex: '#16a34a' },
      { name: 'بمبي', hex: '#ec4899' },
      { name: 'بيج', hex: '#d8c3a5' },
      { name: 'كحلي', hex: '#1e3a8a' },
      { name: 'رمادي', hex: '#9ca3af' },
      { name: 'بني', hex: '#7c4a2d' },
      { name: 'بنفسجي', hex: '#7c3aed' },
      { name: 'منت', hex: '#a8e0c8' },
      { name: 'نبيتي', hex: '#5c1a2b' },
      { name: 'بترولي', hex: '#0f5c66' },
      { name: 'فيروزي', hex: '#14b8a6' },
      { name: 'موف', hex: '#b088c9' },
      { name: 'تركواز', hex: '#2dd4bf' },
      { name: 'كافيه', hex: '#4b3223' }
    ];
    
    Toast.info('جاري استعادة الألوان... برجاء الانتظار');
    try {
      const colorsWithIds = [];
      for (const dc of defaultColors) {
        const id = Utils.id();
        const fullColor = { ...dc, id, createdAt: Utils.todayISO() };
        colorsWithIds.push(fullColor);
        await Sync.addOrUpdate(KEYS.COLORS, id, fullColor);
      }
      DB.set(KEYS.COLORS, [...DB.get(KEYS.COLORS), ...colorsWithIds]);
      Toast.success('تمت استعادة الألوان الأساسية بنجاح!');
    } catch(err) {
      console.error(err);
      Toast.error('حدث خطأ أثناء استعادة الألوان.');
    }
  }
};

/* ─────────────────────────────────────────────
   CUSTOMERS MODULE
───────────────────────────────────────────── */
const Customers = {
  render() {
    const customers = DB.get(KEYS.CUSTOMERS);
    const grid = Utils.el('customers-grid');
    const countEl = Utils.el('customers-count-label');

    // Guard: page-customers was removed from HTML, skip rendering
    if (!grid) return;
    if (countEl) countEl.textContent = `${customers.length} تاجر`;

    const searchInput = Utils.el('customers-search');
    if (searchInput) {
      searchInput.oninput = () => this.renderList(DB.get(KEYS.CUSTOMERS), searchInput.value);
    }

    this.renderList(customers, '');
  },

  renderList(customers, search = '') {
    const grid = Utils.el('customers-grid');
    const emptyEl = Utils.el('customers-empty');
    if (!grid || !emptyEl) return;

    const filtered = search
      ? customers.filter(c => 
          (c.name && c.name.toLowerCase().includes(search.toLowerCase())) || 
          (c.phone && c.phone.includes(search))
        )
      : customers;

    if (!filtered.length) {
      Utils.show(emptyEl);
      Utils.hide(grid);
      return;
    }
    
    Utils.hide(emptyEl);
    Utils.show(grid);

    grid.innerHTML = filtered.map(c => `
      <div class="user-card">
        <div class="user-card-top">
          <div class="user-avatar" style="background:var(--primary)">${(c.name || '?').charAt(0)}</div>
          <div class="user-info">
            <div class="user-fullname">${Utils.sanitize(c.name)}</div>
            <div class="user-username">${Utils.sanitize(c.phone)}</div>
          </div>
        </div>
        <div class="user-card-bottom">
          <span class="role-badge" style="color:var(--text-dim); background:var(--bg-elevated); border:none;">${Utils.sanitize(c.address || 'بدون عنوان')}</span>
          <div class="user-card-actions">
            <button class="icon-btn-sm edit" title="تعديل" data-action="customer-edit" data-id="${c.id}">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="icon-btn-sm delete" title="حذف" data-action="customer-delete" data-id="${c.id}">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  },

  openModal(id) {
    const isEdit = !!id;
    const customer = isEdit ? DB.get(KEYS.CUSTOMERS).find(c => c.id === id) : null;
    
    Utils.el('customer-edit-id').value = id || '';
    Utils.el('customer-form-name').value = customer?.name || '';
    Utils.el('customer-form-phone').value = customer?.phone || '';
    Utils.el('customer-form-address').value = customer?.address || '';
    Utils.el('customer-modal-title').textContent = isEdit ? 'تعديل التاجر' : 'إضافة تاجر جديد';
    
    Modal.open('customer');
  },

  save() {
    const id = Utils.el('customer-edit-id').value;
    const name = Utils.el('customer-form-name').value.trim();
    const phone = Utils.el('customer-form-phone').value.trim();
    const address = Utils.el('customer-form-address').value.trim();

    if (!name || !phone) { Toast.error('يرجى إدخال الاسم ورقم الموبايل'); return; }

    const customers = DB.get(KEYS.CUSTOMERS);
    
    if (id) {
      const idx = customers.findIndex(c => c.id === id);
      if (idx !== -1) {
        customers[idx] = { ...customers[idx], name, phone, address };
        Sync.addOrUpdate(KEYS.CUSTOMERS, customers[idx].id, customers[idx]);
        Toast.success('تم التعديل بنجاح');
      }
    } else {
      const newCustomer = { id: Utils.id(), name, phone, address, createdAt: Utils.todayISO() };
      customers.push(newCustomer);
      Sync.addOrUpdate(KEYS.CUSTOMERS, newCustomer.id, newCustomer);
      Toast.success('تمت إضافة التاجر بنجاح');
    }
    
    DB.set(KEYS.CUSTOMERS, customers);
    Modal.close('customer');
    if (App.currentPage === 'customers') this.render();
  },

  deleteCustomer(id) {
    const customers = DB.get(KEYS.CUSTOMERS);
    const c = customers.find(x => x.id === id);
    Modal.confirm('حذف تاجر', `هل تريد حذف التاجر "${c?.name}"؟`, () => {
      DB.set(KEYS.CUSTOMERS, customers.filter(x => x.id !== id));
      Sync.delete(KEYS.CUSTOMERS, id);
      Toast.success('تم الحذف');
      this.render();
    });
  }
};

/* ─────────────────────────────────────────────
   SEASONS MODULE
───────────────────────────────────────────── */
const Seasons = {
  render() {
    const config = Config.get();
    const grid = Utils.el('seasons-grid');
    if (!grid) return;

    grid.innerHTML = config.seasons.map(s => {
      const isActive = s === config.activeSeason;
      return `
      <div class="user-card" style="${isActive ? 'border-color: var(--primary); background: rgba(37,99,235,0.05);' : ''}">
        <div class="user-card-top">
          <div class="user-info">
            <div class="user-fullname">${Utils.sanitize(s)} ${isActive ? '<span class="role-badge" style="background:var(--primary); color:white; margin-inline-start:0.5rem;">نشط</span>' : ''}</div>
          </div>
        </div>
        <div class="user-card-bottom" style="justify-content: flex-end;">
          <div class="user-card-actions">
            <button class="btn btn-outline btn-sm" ${isActive ? 'disabled' : ''} data-action="season-switch" data-name="${Utils.sanitize(s)}">تنشيط وعرض</button>
            <button class="icon-btn-sm delete" title="حذف بالكامل" data-action="season-delete" data-name="${Utils.sanitize(s)}" ${config.seasons.length === 1 ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
      </div>
      `;
    }).join('');
  },

  switchSeason(name) {
    const config = Config.get();
    if (!config.seasons.includes(name)) return;
    config.activeSeason = name;
    Config.save(config);
    Toast.success(`تم التبديل إلى ${name}`);
    this.render();
  },

  createNewSeason() {
    const input = Utils.el('new-season-input-page');
    const name = input?.value.trim();
    if (!name) return Toast.error('يرجى إدخال اسم الموسم');
    
    const config = Config.get();
    if (config.seasons.includes(name)) return Toast.error('هذا الموسم موجود بالفعل');
    
    config.seasons.push(name);
    config.activeSeason = name;
    Config.save(config);
    if(input) input.value = '';
    
    Toast.success(`تم بدء ${name} بنجاح!`);
    this.render();
  },

  deleteSeason(name) {
    const config = Config.get();
    if (config.seasons.length <= 1) return Toast.error('لا يمكن حذف الموسم الوحيد المتبقي');

    Modal.confirm('حذف الموسم بالكامل', `هل أنت متأكد من حذف موسم "${name}"؟ سيتم مسح جميع الموديلات والأوردرات المتعلقة به ولن يمكن التراجع عن ذلك!`, () => {
      // 1. Remove from config
      config.seasons = config.seasons.filter(s => s !== name);
      if (config.activeSeason === name) {
        config.activeSeason = config.seasons[0]; // fallback
      }
      Config.save(config);

      // 2. Delete models for this season
      const models = DB.get(KEYS.MODELS);
      const remainingModels = [];
      models.forEach(m => {
        if ((m.season || 'الموسم الأول') === name) {
          Sync.delete(KEYS.MODELS, m.id);
        } else {
          remainingModels.push(m);
        }
      });
      DB.set(KEYS.MODELS, remainingModels);

      // 3. Delete orders for this season
      const orders = DB.get(KEYS.ORDERS);
      const remainingOrders = [];
      orders.forEach(o => {
        if ((o.season || 'الموسم الأول') === name) {
          Sync.delete(KEYS.ORDERS, o.id);
        } else {
          remainingOrders.push(o);
        }
      });
      DB.set(KEYS.ORDERS, remainingOrders);

      Toast.success(`تم حذف الموسم ${name} بجميع بياناته بنجاح`);
      this.render();
    });
  }
};


/* ─────────────────────────────────────────────
   GLOBAL EVENT DELEGATION
───────────────────────────────────────────── */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  
  const action = btn.dataset.action;
  if (action === 'order-detail') Orders.showDetail(btn.dataset.id);
  else if (action === 'order-print') { e.stopPropagation(); Orders.printOrder(btn.dataset.id); }
  else if (action === 'order-delete') { e.stopPropagation(); Orders.deleteOrder(btn.dataset.id); }
  else if (action === 'model-duplicate') Models.duplicateModel(btn.dataset.id);
  else if (action === 'model-edit') Models.editModel(btn.dataset.id);
  else if (action === 'model-delete') Models.deleteModel(btn.dataset.id);
  else if (action === 'model-toggle') Orders.toggleModelCard(btn.dataset.id);
  else if (action === 'bulk-row-remove') btn.closest('tr').remove();
  else if (action === 'qty-minus') Orders.changeQty(btn.dataset.model, btn.dataset.color, -1);
  else if (action === 'qty-plus') Orders.changeQty(btn.dataset.model, btn.dataset.color, 1);
  else if (action === 'user-edit') Users.openUserModal(btn.dataset.id);
  else if (action === 'user-delete') Users.deleteUser(btn.dataset.id);
  else if (action === 'color-restore') Colors.restoreDefaults();
  else if (action === 'color-edit') Colors.openModal(btn.dataset.id);
  else if (action === 'color-delete') Colors.deleteColor(btn.dataset.id);
  else if (action === 'customer-edit') Customers.openModal(btn.dataset.id);
  else if (action === 'customer-delete') Customers.deleteCustomer(btn.dataset.id);
  else if (action === 'season-switch') Seasons.switchSeason(btn.dataset.name);
  else if (action === 'season-delete') Seasons.deleteSeason(btn.dataset.name);
});

document.addEventListener('change', (e) => {
  if (e.target.matches('.qty-input')) {
    const inp = e.target;
    Orders.setQty(inp.dataset.model, inp.dataset.color, inp.value, inp.dataset.mname, inp.dataset.cname, inp.dataset.ccode, parseInt(inp.dataset.cqty), parseFloat(inp.dataset.mprice));
  }
});

/* ─────────────────────────────────────────────
   INIT APP ON DOM READY
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => App.init());
