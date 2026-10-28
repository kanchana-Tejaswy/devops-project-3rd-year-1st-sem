/**
 * Smart Queue — Hospital Edition (Phase 1)
 * Core State Engine, Storage Manager, Audio Synthesizer, and UI Controller
 * 
 * Works 100% offline with zero external dependencies.
 * Fully compatible with browser environments and Node.js testing.
 */

// ============================================================================
// 1. CONSTANTS & DEFAULT CONFIGURATION
// ============================================================================

const STORAGE_KEY = 'smart_queue_hospital_v1';

const DEPARTMENTS_CONFIG = {
  admin: {
    id: 'admin',
    name: 'Outpatient Registration & Triage',
    shortName: 'OPD & Triage',
    code: 'OPD',
    prefix: 'A',
    counter: 'Desk 1 — Triage & Consultation',
    description: 'Patient check-in, initial nurse triage, vital assessments, and consultation routing.',
    avgMinutes: 6,
    icon: 'stethoscope'
  },
  fee: {
    id: 'fee',
    name: 'Pharmacy & Billing Counter',
    shortName: 'Pharmacy & Billing',
    code: 'PHR',
    prefix: 'F',
    counter: 'Counter 2 — Pharmacy Window',
    description: 'Prescription dispensing, medication counseling, outpatient billing settlement, and insurance receipts.',
    avgMinutes: 4,
    icon: 'pill'
  },
  lab: {
    id: 'lab',
    name: 'Diagnostic Pathology & Imaging',
    shortName: 'Pathology & Imaging',
    code: 'LAB',
    prefix: 'L',
    counter: 'Counter 3 — Specimen Collection',
    description: 'Phlebotomy, clinical laboratory specimen collection, X-ray & imaging token coordination.',
    avgMinutes: 8,
    icon: 'flask'
  }
};

// ============================================================================
// 2. QUEUE ENGINE (PURE BUSINESS LOGIC)
// ============================================================================

const QueueEngine = {
  /**
   * Formats a sequential number with the department prefix into a 3-digit token.
   * e.g., ('A', 1) -> 'A001', ('F', 12) -> 'F012'
   */
  formatTokenNumber(prefix, number) {
    const num = Math.max(1, parseInt(number, 10) || 1);
    return `${prefix}${String(num).padStart(3, '0')}`;
  },

  /**
   * Creates an empty valid state structure.
   */
  createEmptyState() {
    const departments = {};
    for (const [deptId, config] of Object.entries(DEPARTMENTS_CONFIG)) {
      departments[deptId] = {
        id: config.id,
        name: config.name,
        code: config.code,
        prefix: config.prefix,
        counter: config.counter,
        lastSequence: 0,
        currentlyServing: null,
        tokens: []
      };
    }

    return {
      version: 1,
      selectedDepartment: 'admin',
      activeTab: 'visitor', // 'visitor' | 'admin' | 'display'
      checkinMode: 'self', // 'self' | 'reception'
      soundEnabled: true,
      userTokens: {
        admin: null,
        fee: null,
        lab: null
      },
      departments
    };
  },

  /**
   * Creates initial demo state with realistic simulated hospital queues.
   */
  createInitialState() {
    const state = this.createEmptyState();
    const now = Date.now();

    // Populate Outpatient Registration & Triage with realistic simulated patients
    state.departments.admin.lastSequence = 3;
    state.departments.admin.currentlyServing = 'A002';
    state.departments.admin.tokens = [
      {
        id: 'A001',
        departmentId: 'admin',
        number: 1,
        display: 'A001',
        status: 'completed',
        createdAt: now - 25 * 60 * 1000,
        servedAt: now - 18 * 60 * 1000,
        completedAt: now - 8 * 60 * 1000,
        cancelledAt: null,
        purpose: 'Routine Health Checkup',
        patientRef: 'MRN-7812',
        checkinType: 'self'
      },
      {
        id: 'A002',
        departmentId: 'admin',
        number: 2,
        display: 'A002',
        status: 'serving',
        createdAt: now - 15 * 60 * 1000,
        servedAt: now - 5 * 60 * 1000,
        completedAt: null,
        cancelledAt: null,
        purpose: 'General Outpatient Consultation',
        patientRef: 'MRN-8421',
        checkinType: 'reception'
      },
      {
        id: 'A003',
        departmentId: 'admin',
        number: 3,
        display: 'A003',
        status: 'waiting',
        createdAt: now - 4 * 60 * 1000,
        servedAt: null,
        completedAt: null,
        cancelledAt: null,
        purpose: 'Specialist Referral Triage',
        patientRef: 'MRN-9034',
        checkinType: 'self'
      }
    ];
    state.userTokens.admin = 'A003';

    // Pharmacy & Billing: 1 waiting patient
    state.departments.fee.lastSequence = 1;
    state.departments.fee.tokens = [
      {
        id: 'F001',
        departmentId: 'fee',
        number: 1,
        display: 'F001',
        status: 'waiting',
        createdAt: now - 8 * 60 * 1000,
        servedAt: null,
        completedAt: null,
        cancelledAt: null,
        purpose: 'Prescription Medication Dispensing',
        patientRef: 'MRN-6192',
        checkinType: 'self'
      }
    ];

    // Diagnostic Pathology: 1 waiting patient
    state.departments.lab.lastSequence = 1;
    state.departments.lab.tokens = [
      {
        id: 'L001',
        departmentId: 'lab',
        number: 1,
        display: 'L001',
        status: 'waiting',
        createdAt: now - 11 * 60 * 1000,
        servedAt: null,
        completedAt: null,
        cancelledAt: null,
        purpose: 'Blood Panel & Specimen Collection',
        patientRef: 'MRN-5310',
        checkinType: 'reception'
      }
    ];

    return state;
  },

  /**
   * Validates whether a state object matches the expected schema.
   */
  validateState(state) {
    if (!state || typeof state !== 'object') return false;
    if (state.version !== 1) return false;
    if (!state.departments || typeof state.departments !== 'object') return false;

    // Check required departments
    for (const deptId of Object.keys(DEPARTMENTS_CONFIG)) {
      const dept = state.departments[deptId];
      if (!dept || typeof dept !== 'object') return false;
      if (typeof dept.lastSequence !== 'number' || dept.lastSequence < 0) return false;
      if (!Array.isArray(dept.tokens)) return false;
    }

    if (!state.userTokens || typeof state.userTokens !== 'object') return false;

    return true;
  },

  /**
   * Generates a new sequential queue token for a department.
   * Supports simulated patient reference and check-in type ('self' vs 'reception').
   */
  generateToken(state, departmentId, purpose = 'General Consultation', patientRef = '', checkinType = 'self') {
    if (!state.departments[departmentId]) {
      return { success: false, message: `Invalid department: "${departmentId}"` };
    }

    const dept = state.departments[departmentId];
    const nextSequence = dept.lastSequence + 1;
    const tokenDisplay = this.formatTokenNumber(dept.prefix, nextSequence);
    const now = Date.now();

    const sanitizedPurpose = (purpose && purpose.trim()) ? purpose.trim() : 'General Outpatient Visit';
    const sanitizedRef = (patientRef && patientRef.trim()) 
      ? patientRef.trim() 
      : `MRN-${Math.floor(1000 + Math.random() * 9000)}`;

    const newToken = {
      id: tokenDisplay,
      departmentId,
      number: nextSequence,
      display: tokenDisplay,
      status: 'waiting',
      createdAt: now,
      servedAt: null,
      completedAt: null,
      cancelledAt: null,
      purpose: sanitizedPurpose,
      patientRef: sanitizedRef,
      checkinType: checkinType === 'reception' ? 'reception' : 'self'
    };

    dept.lastSequence = nextSequence;
    dept.tokens.push(newToken);
    state.userTokens[departmentId] = tokenDisplay;

    return {
      success: true,
      message: `Token ${tokenDisplay} generated successfully!`,
      token: newToken,
      state
    };
  },

  /**
   * Calls the next waiting token in the department queue.
   */
  callNextToken(state, departmentId) {
    if (!state.departments[departmentId]) {
      return { success: false, message: `Invalid department: "${departmentId}"` };
    }

    const dept = state.departments[departmentId];

    // Check if another token is currently being served
    if (dept.currentlyServing) {
      return {
        success: false,
        message: `Counter is currently serving Token ${dept.currentlyServing}. Please complete or cancel it before calling the next patient.`
      };
    }

    // Find the oldest waiting token
    const nextWaiting = dept.tokens.find(t => t.status === 'waiting');
    if (!nextWaiting) {
      return {
        success: false,
        message: 'The queue is currently empty. No patients are waiting.'
      };
    }

    // Advance token to serving
    nextWaiting.status = 'serving';
    nextWaiting.servedAt = Date.now();
    dept.currentlyServing = nextWaiting.id;

    return {
      success: true,
      message: `Now serving Token ${nextWaiting.id} at ${dept.counter}!`,
      token: nextWaiting,
      state
    };
  },

  /**
   * Completes the token currently being served.
   */
  completeCurrentToken(state, departmentId) {
    if (!state.departments[departmentId]) {
      return { success: false, message: `Invalid department: "${departmentId}"` };
    }

    const dept = state.departments[departmentId];
    if (!dept.currentlyServing) {
      return {
        success: false,
        message: 'No token is currently being served in this department.'
      };
    }

    const servingToken = dept.tokens.find(t => t.id === dept.currentlyServing);
    if (!servingToken) {
      dept.currentlyServing = null;
      return {
        success: false,
        message: 'Serving token record could not be found.'
      };
    }

    servingToken.status = 'completed';
    servingToken.completedAt = Date.now();
    const completedTokenId = servingToken.id;
    dept.currentlyServing = null;

    return {
      success: true,
      message: `Token ${completedTokenId} has been marked as completed.`,
      token: servingToken,
      state
    };
  },

  /**
   * Cancels a waiting or serving token by ID.
   */
  cancelToken(state, departmentId, tokenId, reason = 'Cancelled by staff') {
    if (!state.departments[departmentId]) {
      return { success: false, message: `Invalid department: "${departmentId}"` };
    }

    const dept = state.departments[departmentId];
    const token = dept.tokens.find(t => t.id === tokenId);

    if (!token) {
      return { success: false, message: `Token ${tokenId} not found.` };
    }

    if (token.status === 'completed') {
      return { success: false, message: `Cannot cancel Token ${tokenId} because it has already been completed.` };
    }

    if (token.status === 'cancelled') {
      return { success: false, message: `Token ${tokenId} is already cancelled.` };
    }

    // If currently serving, release the counter
    if (dept.currentlyServing === tokenId) {
      dept.currentlyServing = null;
    }

    token.status = 'cancelled';
    token.cancelledAt = Date.now();
    token.cancelReason = reason;

    return {
      success: true,
      message: `Token ${tokenId} was cancelled (${reason}).`,
      token,
      state
    };
  },

  /**
   * Marks a token as No-Show and releases the counter if currently serving.
   */
  markNoShow(state, departmentId, tokenId) {
    return this.cancelToken(state, departmentId, tokenId, 'Patient No-Show');
  },

  /**
   * Resets all tokens and sequences for a single department.
   */
  resetDepartmentQueue(state, departmentId) {
    if (!state.departments[departmentId]) {
      return { success: false, message: `Invalid department: "${departmentId}"` };
    }

    const dept = state.departments[departmentId];
    dept.lastSequence = 0;
    dept.currentlyServing = null;
    dept.tokens = [];
    state.userTokens[departmentId] = null;

    return {
      success: true,
      message: `Queue for ${dept.name} has been reset.`,
      state
    };
  },

  /**
   * Resets all departments to a completely clean, empty queue.
   */
  resetAllQueues(state) {
    for (const deptId of Object.keys(state.departments)) {
      this.resetDepartmentQueue(state, deptId);
    }
    return {
      success: true,
      message: 'All department queues have been reset to zero.',
      state
    };
  },

  /**
   * Computes summary metrics for a department.
   */
  getDepartmentStats(department) {
    if (!department || !Array.isArray(department.tokens)) {
      return { waiting: 0, serving: 0, completed: 0, cancelled: 0, total: 0, currentlyServingToken: null };
    }

    let waiting = 0;
    let serving = 0;
    let completed = 0;
    let cancelled = 0;

    for (const t of department.tokens) {
      if (t.status === 'waiting') waiting++;
      else if (t.status === 'serving') serving++;
      else if (t.status === 'completed') completed++;
      else if (t.status === 'cancelled') cancelled++;
    }

    const currentlyServingToken = department.currentlyServing
      ? department.tokens.find(t => t.id === department.currentlyServing) || null
      : null;

    return {
      waiting,
      serving,
      completed,
      cancelled,
      total: department.tokens.length,
      currentlyServingToken
    };
  },

  /**
   * Returns how many waiting visitors are ahead of a specific token.
   * Returns 0 if next in line, -1 if token is not waiting.
   */
  getAheadCount(department, tokenId) {
    if (!department || !tokenId) return -1;
    const waitingTokens = department.tokens.filter(t => t.status === 'waiting');
    const index = waitingTokens.findIndex(t => t.id === tokenId);
    return index; // -1 if not found in waiting queue, 0 if next, 1+ if people ahead
  }
};

// ============================================================================
// 3. STORAGE MANAGER (LOCALSTORAGE ABSTRACTION & FALLBACKS)
// ============================================================================

const StorageManager = {
  /**
   * Loads state from localStorage with robust error handling and fallback defaults.
   */
  load(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
    if (!storage) {
      return QueueEngine.createInitialState();
    }

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) {
        const initialState = QueueEngine.createInitialState();
        this.save(initialState, storage);
        return initialState;
      }

      const parsed = JSON.parse(raw);
      if (QueueEngine.validateState(parsed)) {
        return parsed;
      } else {
        console.warn('[SmartQueue] Stored data did not match schema. Reinitializing demo data.');
        const freshState = QueueEngine.createInitialState();
        this.save(freshState, storage);
        return freshState;
      }
    } catch (err) {
      console.error('[SmartQueue] Error loading from storage:', err);
      const fallbackState = QueueEngine.createInitialState();
      try {
        this.save(fallbackState, storage);
      } catch (saveErr) {
        // Ignore if storage write fails
      }
      return fallbackState;
    }
  },

  /**
   * Persists state to localStorage.
   */
  save(state, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('[SmartQueue] Error saving to storage:', err);
      return false;
    }
  },

  /**
   * Clears stored queue data.
   */
  clear(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
    if (!storage) return false;
    try {
      storage.removeItem(STORAGE_KEY);
      return true;
    } catch (err) {
      console.error('[SmartQueue] Error clearing storage:', err);
      return false;
    }
  }
};

// ============================================================================
// 4. AUDIO CHIME SYNTHESIZER (WEB AUDIO API)
// ============================================================================

const SoundEffects = {
  audioCtx: null,

  initAudio() {
    if (typeof window === 'undefined') return;
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  },

  /**
   * Plays a refined medical-grade two-tone announcement chime (C5 -> E5).
   */
  playChime(enabled = true) {
    if (!enabled || typeof window === 'undefined') return;

    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;

      // First tone (523.25 Hz - C5)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.18, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Second tone (659.25 Hz - E5)
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.16);
      gain2.gain.setValueAtTime(0, now + 0.16);
      gain2.gain.linearRampToValueAtTime(0.22, now + 0.20);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.16);
      osc2.stop(now + 0.9);
    } catch (e) {
      console.debug('Audio chime disabled or blocked by browser policy');
    }
  }
};

// ============================================================================
// 5. CLIENT-SIDE UI CONTROLLER
// ============================================================================

class SmartQueueApp {
  constructor() {
    this.state = null;
    this.toastTimeout = null;
    this.pendingConfirmAction = null;
  }

  init() {
    // 1. Load initial state
    this.state = StorageManager.load();

    // 2. Bind event listeners
    this.bindEvents();

    // 3. Render complete UI
    this.render();

    // 4. Setup periodic timestamp refresh
    setInterval(() => {
      this.updateRelativeTimes();
    }, 30000);

    // Live clock on public display
    setInterval(() => {
      const clockEl = document.getElementById('display-clock');
      if (clockEl) {
        const d = new Date();
        clockEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
    }, 1000);

    console.log('%c CareQueue Hospital Edition Initialized ', 'background: #000000; color: #ffffff; border: 1px solid #333333; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  }

  saveAndRender() {
    StorageManager.save(this.state);
    this.render();
  }

  // --- Notification Toasts (Zero Emojis, Pure Inline SVGs) ---
  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    const iconMap = {
      success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
      warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    };

    toast.className = `toast toast-${type} show`;
    toast.innerHTML = `
      <span class="toast-icon">${iconMap[type] || iconMap.info}</span>
      <span class="toast-message">${this.escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Close message" onclick="document.getElementById('toast').classList.remove('show')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }

  // --- Confirmation Dialog ---
  showConfirmDialog(title, message, confirmBtnText, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm-btn');

    if (!modal || !titleEl || !messageEl || !confirmBtn) return;

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmBtnText;

    this.pendingConfirmAction = onConfirm;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    confirmBtn.focus();
  }

  closeConfirmDialog() {
    const modal = document.getElementById('confirm-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
    this.pendingConfirmAction = null;
  }

  // --- Event Binding ---
  bindEvents() {
    // Top Navigation Tabs
    document.querySelectorAll('[data-tab-target]').forEach(button => {
      button.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.getAttribute('data-tab-target');
        this.switchTab(targetTab);
      });
    });

    // Global Department Selector
    const deptSelect = document.getElementById('global-dept-select');
    if (deptSelect) {
      deptSelect.addEventListener('change', (e) => {
        this.switchDepartment(e.target.value);
      });
    }

    // Sound toggle
    const soundToggle = document.getElementById('sound-toggle-btn');
    if (soundToggle) {
      soundToggle.addEventListener('click', () => {
        this.state.soundEnabled = !this.state.soundEnabled;
        SoundEffects.playChime(this.state.soundEnabled);
        this.saveAndRender();
        this.showToast(this.state.soundEnabled ? 'Hospital chime announcements enabled' : 'Chime announcements muted', 'info');
      });
    }

    // Demo Data Reset
    const resetDemoBtn = document.getElementById('reset-demo-data-btn');
    if (resetDemoBtn) {
      resetDemoBtn.addEventListener('click', () => {
        this.showConfirmDialog(
          'Reset Hospital Demo Data?',
          'This will clear active queues and re-seed the sample hospital outpatient queue. This action cannot be undone.',
          'Reset Demo Data',
          () => {
            this.state = QueueEngine.createInitialState();
            this.saveAndRender();
            this.showToast('Sample hospital demo queue restored.', 'success');
          }
        );
      });
    }

    // Modal Cancel / Close
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    if (modalCancelBtn) {
      modalCancelBtn.addEventListener('click', () => this.closeConfirmDialog());
    }

    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    if (modalConfirmBtn) {
      modalConfirmBtn.addEventListener('click', () => {
        if (typeof this.pendingConfirmAction === 'function') {
          this.pendingConfirmAction();
        }
        this.closeConfirmDialog();
      });
    }

    // Keyboard support: Escape closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeConfirmDialog();
      }
    });

    this.bindVisitorEvents();
    this.bindAdminEvents();
  }

  bindVisitorEvents() {
    // Department Selection Pills on Check-in screen
    document.querySelectorAll('.visitor-dept-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const deptId = e.currentTarget.getAttribute('data-dept-id');
        this.switchDepartment(deptId);
      });
    });

    // Check-in Mode Segmented Switcher (Self vs Receptionist)
    const modeSelfBtn = document.getElementById('checkin-mode-self');
    const modeReceptionBtn = document.getElementById('checkin-mode-reception');
    const selfFormPanel = document.getElementById('self-checkin-panel');
    const receptionFormPanel = document.getElementById('reception-checkin-panel');

    const updateCheckinMode = (mode) => {
      this.state.checkinMode = mode;
      if (modeSelfBtn) {
        modeSelfBtn.classList.toggle('active', mode === 'self');
        modeSelfBtn.setAttribute('aria-selected', mode === 'self' ? 'true' : 'false');
      }
      if (modeReceptionBtn) {
        modeReceptionBtn.classList.toggle('active', mode === 'reception');
        modeReceptionBtn.setAttribute('aria-selected', mode === 'reception' ? 'true' : 'false');
      }
      if (selfFormPanel) {
        selfFormPanel.style.display = mode === 'self' ? 'block' : 'none';
      }
      if (receptionFormPanel) {
        receptionFormPanel.style.display = mode === 'reception' ? 'block' : 'none';
      }
      StorageManager.save(this.state);
    };

    if (modeSelfBtn) {
      modeSelfBtn.addEventListener('click', () => updateCheckinMode('self'));
    }
    if (modeReceptionBtn) {
      modeReceptionBtn.addEventListener('click', () => updateCheckinMode('reception'));
    }

    // Generate Token (Self Check-in)
    const generateBtn = document.getElementById('generate-token-btn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        SoundEffects.initAudio();
        const deptId = this.state.selectedDepartment;
        const purposeInput = document.getElementById('token-purpose-input');
        const purpose = purposeInput ? purposeInput.value : '';
        const refInput = document.getElementById('token-patient-ref-input');
        const patientRef = refInput ? refInput.value : '';

        const result = QueueEngine.generateToken(this.state, deptId, purpose, patientRef, 'self');
        if (result.success) {
          if (purposeInput) purposeInput.value = '';
          if (refInput) refInput.value = '';
          this.saveAndRender();
          this.showToast(`Token ${result.token.display} assigned! Please wait for your turn.`, 'success');
        } else {
          this.showToast(result.message, 'error');
        }
      });
    }

    // Receptionist Registration Button
    const receptionBtn = document.getElementById('reception-register-btn');
    if (receptionBtn) {
      receptionBtn.addEventListener('click', () => {
        SoundEffects.initAudio();
        const deptId = this.state.selectedDepartment;
        const patientNameInput = document.getElementById('reception-patient-name');
        const patientMrnInput = document.getElementById('reception-patient-mrn');
        const visitCategorySelect = document.getElementById('reception-visit-category');
        const prioritySelect = document.getElementById('reception-priority');

        const pName = patientNameInput ? patientNameInput.value.trim() : '';
        const pMrn = patientMrnInput ? patientMrnInput.value.trim() : '';
        const pCategory = visitCategorySelect ? visitCategorySelect.value : 'General OPD';
        const pPriority = prioritySelect ? prioritySelect.value : 'Normal';

        const finalPurpose = `${pCategory}${pPriority === 'Priority' ? ' [Priority]' : ''}${pName ? ` (${pName})` : ''}`;
        const finalRef = pMrn || (pName ? `PT-${pName.replace(/\s+/g, '').substring(0, 4).toUpperCase()}` : '');

        const result = QueueEngine.generateToken(this.state, deptId, finalPurpose, finalRef, 'reception');
        if (result.success) {
          if (patientNameInput) patientNameInput.value = '';
          if (patientMrnInput) patientMrnInput.value = '';
          this.saveAndRender();
          this.showToast(`Patient registered! Token ${result.token.display} issued at ${DEPARTMENTS_CONFIG[deptId].shortName}.`, 'success');
        } else {
          this.showToast(result.message, 'error');
        }
      });
    }

    // Visitor: Cancel my token
    const cancelMyTokenBtn = document.getElementById('visitor-cancel-token-btn');
    if (cancelMyTokenBtn) {
      cancelMyTokenBtn.addEventListener('click', () => {
        const deptId = this.state.selectedDepartment;
        const userTokenId = this.state.userTokens[deptId];
        if (!userTokenId) return;

        this.showConfirmDialog(
          `Cancel Token ${userTokenId}?`,
          'Are you sure you want to cancel your queue token? You will lose your current spot in line.',
          'Yes, Cancel Token',
          () => {
            const result = QueueEngine.cancelToken(this.state, deptId, userTokenId, 'Cancelled by patient');
            if (result.success) {
              this.saveAndRender();
              this.showToast(`Your token ${userTokenId} has been cancelled.`, 'info');
            } else {
              this.showToast(result.message, 'error');
            }
          }
        );
      });
    }

    // Visitor: Print Ticket
    const printTicketBtn = document.getElementById('visitor-print-btn');
    if (printTicketBtn) {
      printTicketBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // Visitor: Dismiss / Register another patient
    const dismissTicketBtn = document.getElementById('visitor-dismiss-btn');
    if (dismissTicketBtn) {
      dismissTicketBtn.addEventListener('click', () => {
        const deptId = this.state.selectedDepartment;
        this.state.userTokens[deptId] = null;
        this.saveAndRender();
      });
    }
  }

  bindAdminEvents() {
    // Admin: Call Next Token
    const callNextBtn = document.getElementById('admin-call-next-btn');
    if (callNextBtn) {
      callNextBtn.addEventListener('click', () => {
        SoundEffects.initAudio();
        const deptId = this.state.selectedDepartment;
        const result = QueueEngine.callNextToken(this.state, deptId);

        if (result.success) {
          SoundEffects.playChime(this.state.soundEnabled);
          this.saveAndRender();
          this.showToast(`Called Token ${result.token.display} to Counter!`, 'success');
        } else {
          this.showToast(result.message, 'warning');
        }
      });
    }

    // Admin: Complete Current Token
    const completeBtn = document.getElementById('admin-complete-btn');
    if (completeBtn) {
      completeBtn.addEventListener('click', () => {
        const deptId = this.state.selectedDepartment;
        const result = QueueEngine.completeCurrentToken(this.state, deptId);

        if (result.success) {
          this.saveAndRender();
          this.showToast(`Token ${result.token.display} completed successfully.`, 'success');
        } else {
          this.showToast(result.message, 'warning');
        }
      });
    }

    // Admin: Mark Current Token as No-Show
    const noshowBtn = document.getElementById('admin-noshow-btn');
    if (noshowBtn) {
      noshowBtn.addEventListener('click', () => {
        const deptId = this.state.selectedDepartment;
        const dept = this.state.departments[deptId];
        if (!dept.currentlyServing) {
          this.showToast('No patient is currently serving to mark as no-show.', 'warning');
          return;
        }

        const tokenId = dept.currentlyServing;
        this.showConfirmDialog(
          `Mark Token ${tokenId} as No-Show?`,
          `This will mark Patient Token ${tokenId} as a No-Show and free the consultation window for the next patient.`,
          'Mark No-Show',
          () => {
            const result = QueueEngine.markNoShow(this.state, deptId, tokenId);
            if (result.success) {
              this.saveAndRender();
              this.showToast(`Token ${tokenId} marked as No-Show.`, 'info');
            } else {
              this.showToast(result.message, 'error');
            }
          }
        );
      });
    }

    // Admin: Recall Current Token
    const recallBtn = document.getElementById('admin-recall-btn');
    if (recallBtn) {
      recallBtn.addEventListener('click', () => {
        SoundEffects.initAudio();
        const deptId = this.state.selectedDepartment;
        const dept = this.state.departments[deptId];
        if (dept.currentlyServing) {
          SoundEffects.playChime(this.state.soundEnabled);
          this.showToast(`Re-announced Token ${dept.currentlyServing} for ${dept.counter}`, 'info');
        } else {
          this.showToast('No patient is currently serving to re-announce.', 'warning');
        }
      });
    }

    // Admin: Reset Current Department Queue
    const resetDeptBtn = document.getElementById('admin-reset-dept-btn');
    if (resetDeptBtn) {
      resetDeptBtn.addEventListener('click', () => {
        const deptId = this.state.selectedDepartment;
        const deptName = this.state.departments[deptId].name;

        this.showConfirmDialog(
          `Reset Queue for ${deptName}?`,
          `This will clear all waiting and completed tokens for ${deptName} and reset numbering back to 001.`,
          'Reset Department Queue',
          () => {
            const result = QueueEngine.resetDepartmentQueue(this.state, deptId);
            this.saveAndRender();
            this.showToast(result.message, 'info');
          }
        );
      });
    }

    // Admin: Filter Tabs
    document.querySelectorAll('.admin-filter-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        document.querySelectorAll('.admin-filter-pill').forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const filter = e.currentTarget.getAttribute('data-filter');
        this.renderQueueTable(filter);
      });
    });
  }

  // --- Tab & Department Switching ---
  switchTab(tabName) {
    if (!['visitor', 'admin', 'display'].includes(tabName)) return;

    this.state.activeTab = tabName;
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      const isTarget = btn.getAttribute('data-tab-target') === tabName;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.remove('active');
    });

    const activeView = document.getElementById(`tab-view-${tabName}`);
    if (activeView) {
      activeView.classList.add('active');
    }

    this.saveAndRender();
  }

  switchDepartment(deptId) {
    if (!this.state.departments[deptId]) return;
    this.state.selectedDepartment = deptId;
    this.saveAndRender();
  }

  // --- Rendering ---
  render() {
    const currentDeptId = this.state.selectedDepartment;
    const currentDept = this.state.departments[currentDeptId];
    const deptConfig = DEPARTMENTS_CONFIG[currentDeptId];
    const stats = QueueEngine.getDepartmentStats(currentDept);

    // 1. Update Global Header Controls
    const deptSelect = document.getElementById('global-dept-select');
    if (deptSelect && deptSelect.value !== currentDeptId) {
      deptSelect.value = currentDeptId;
    }

    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
      soundBtn.setAttribute('title', this.state.soundEnabled ? 'Mute announcement chime' : 'Enable announcement chime');
      soundBtn.innerHTML = this.state.soundEnabled
        ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> <span class="btn-label">Chime: ON</span>`
        : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> <span class="btn-label">Muted</span>`;
      soundBtn.classList.toggle('muted', !this.state.soundEnabled);
    }

    // 2. Render Patient Check-in View
    this.renderVisitorView(currentDept, deptConfig, stats);

    // 3. Render Staff Dashboard
    this.renderAdminView(currentDept, deptConfig, stats);

    // 4. Render Live Public Display Board
    this.renderDisplayBoard();

    // 5. Ensure active tab view is shown
    const activeTab = this.state.activeTab || 'visitor';
    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.toggle('active', view.id === `tab-view-${activeTab}`);
    });
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      const isTarget = btn.getAttribute('data-tab-target') === activeTab;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    // 6. Ensure checkin mode panels reflect state
    const mode = this.state.checkinMode || 'self';
    const modeSelfBtn = document.getElementById('checkin-mode-self');
    const modeReceptionBtn = document.getElementById('checkin-mode-reception');
    const selfFormPanel = document.getElementById('self-checkin-panel');
    const receptionFormPanel = document.getElementById('reception-checkin-panel');
    if (modeSelfBtn) modeSelfBtn.classList.toggle('active', mode === 'self');
    if (modeReceptionBtn) modeReceptionBtn.classList.toggle('active', mode === 'reception');
    if (selfFormPanel) selfFormPanel.style.display = mode === 'self' ? 'block' : 'none';
    if (receptionFormPanel) receptionFormPanel.style.display = mode === 'reception' ? 'block' : 'none';
  }

  renderVisitorView(dept, config, stats) {
    // Visitor Department Pills
    document.querySelectorAll('.visitor-dept-pill').forEach(pill => {
      const deptId = pill.getAttribute('data-dept-id');
      const isSelected = deptId === dept.id;
      pill.classList.toggle('active', isSelected);
      pill.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    // Current Counter Info
    const titleEl = document.getElementById('visitor-dept-title');
    if (titleEl) titleEl.textContent = dept.name;

    const counterBadge = document.getElementById('visitor-counter-badge');
    if (counterBadge) counterBadge.textContent = dept.counter;

    const descEl = document.getElementById('visitor-dept-desc');
    if (descEl) descEl.textContent = config.description;

    // Fast stats on Patient Check-in
    const servingNumEl = document.getElementById('visitor-serving-token');
    if (servingNumEl) {
      servingNumEl.textContent = dept.currentlyServing || '—';
    }

    const waitingCountEl = document.getElementById('visitor-waiting-count');
    if (waitingCountEl) {
      waitingCountEl.textContent = stats.waiting;
    }

    const avgWaitEl = document.getElementById('visitor-est-wait');
    if (avgWaitEl) {
      const totalMinutes = stats.waiting * config.avgMinutes;
      avgWaitEl.textContent = totalMinutes === 0 ? '~3 mins' : `~${totalMinutes} mins`;
    }

    // Patient's Token Slip
    const userTokenId = this.state.userTokens[dept.id];
    const ticketCard = document.getElementById('visitor-ticket-card');
    const emptyState = document.getElementById('visitor-empty-state');

    if (!userTokenId) {
      if (ticketCard) ticketCard.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
    } else {
      const userToken = dept.tokens.find(t => t.id === userTokenId);
      if (!userToken) {
        if (ticketCard) ticketCard.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
      } else {
        if (emptyState) emptyState.style.display = 'none';
        if (ticketCard) {
          ticketCard.style.display = 'block';
          this.renderVisitorTicket(userToken, dept, config);
        }
      }
    }
  }

  renderVisitorTicket(token, dept, config) {
    const tokenDisplay = document.getElementById('ticket-token-display');
    if (tokenDisplay) tokenDisplay.textContent = token.display;

    const deptName = document.getElementById('ticket-dept-name');
    if (deptName) deptName.textContent = dept.name;

    const counterName = document.getElementById('ticket-counter-name');
    if (counterName) counterName.textContent = dept.counter;

    const issueTime = document.getElementById('ticket-issue-time');
    if (issueTime) {
      issueTime.textContent = new Date(token.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    const purposeEl = document.getElementById('ticket-purpose');
    if (purposeEl) purposeEl.textContent = token.purpose || 'General Consultation';

    const patientRefEl = document.getElementById('ticket-patient-ref');
    if (patientRefEl) patientRefEl.textContent = token.patientRef || 'Simulated Patient';

    const checkinTypeEl = document.getElementById('ticket-checkin-type');
    if (checkinTypeEl) {
      checkinTypeEl.textContent = token.checkinType === 'reception' ? 'Reception Desk Check-in' : 'Patient Self-Check-in';
    }

    // Status Badge and Announcement Message
    const badgeEl = document.getElementById('ticket-status-badge');
    const bannerEl = document.getElementById('ticket-callout-banner');
    const cancelBtn = document.getElementById('visitor-cancel-token-btn');

    if (token.status === 'serving') {
      if (badgeEl) {
        badgeEl.className = 'status-pill status-serving pulse';
        badgeEl.innerHTML = '<span class="status-dot"></span> NOW SERVING';
      }
      if (bannerEl) {
        bannerEl.className = 'ticket-alert alert-serving';
        bannerEl.innerHTML = `
          <div class="alert-icon-svg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          <div>
            <strong>It is your turn!</strong> Please proceed to <strong>${this.escapeHtml(dept.counter)}</strong> immediately.
          </div>
        `;
      }
      if (cancelBtn) cancelBtn.style.display = 'none';
    } else if (token.status === 'waiting') {
      const ahead = QueueEngine.getAheadCount(dept, token.id);
      if (badgeEl) {
        badgeEl.className = 'status-pill status-waiting';
        badgeEl.textContent = 'Waiting in Queue';
      }
      if (bannerEl) {
        bannerEl.className = 'ticket-alert alert-waiting';
        const msg = ahead === 0
          ? `<strong>You are next in line!</strong> Please wait near ${this.escapeHtml(dept.counter)}.`
          : `There ${ahead === 1 ? 'is <strong>1 patient</strong>' : `are <strong>${ahead} patients</strong>`} ahead of you in line.`;
        
        bannerEl.innerHTML = `
          <div class="alert-icon-svg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>${msg}</div>
        `;
      }
      if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    } else if (token.status === 'completed') {
      if (badgeEl) {
        badgeEl.className = 'status-pill status-completed';
        badgeEl.textContent = 'Consultation Completed';
      }
      if (bannerEl) {
        bannerEl.className = 'ticket-alert alert-completed';
        bannerEl.innerHTML = `
          <div class="alert-icon-svg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div>Thank you. Service completed at ${new Date(token.completedAt || token.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</div>
        `;
      }
      if (cancelBtn) cancelBtn.style.display = 'none';
    } else if (token.status === 'cancelled') {
      if (badgeEl) {
        badgeEl.className = 'status-pill status-cancelled';
        badgeEl.textContent = token.cancelReason === 'Patient No-Show' ? 'Marked No-Show' : 'Token Cancelled';
      }
      if (bannerEl) {
        bannerEl.className = 'ticket-alert alert-cancelled';
        bannerEl.innerHTML = `
          <div class="alert-icon-svg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
          <div>This token was closed (${this.escapeHtml(token.cancelReason || 'Cancelled')}).</div>
        `;
      }
      if (cancelBtn) cancelBtn.style.display = 'none';
    }
  }

  renderAdminView(dept, config, stats) {
    // Current Dept Info
    const deptTitle = document.getElementById('admin-dept-title');
    if (deptTitle) deptTitle.textContent = `${dept.name} — Staff Console`;

    const counterName = document.getElementById('admin-counter-name');
    if (counterName) counterName.textContent = dept.counter;

    // Stat Counters
    const countWaiting = document.getElementById('stat-waiting-count');
    if (countWaiting) countWaiting.textContent = stats.waiting;

    const countServing = document.getElementById('stat-serving-count');
    if (countServing) countServing.textContent = stats.serving;

    const countCompleted = document.getElementById('stat-completed-count');
    if (countCompleted) countCompleted.textContent = stats.completed;

    const countCancelled = document.getElementById('stat-cancelled-count');
    if (countCancelled) countCancelled.textContent = stats.cancelled;

    const countTotal = document.getElementById('stat-total-count');
    if (countTotal) countTotal.textContent = stats.total;

    // Active Serving Card
    const servingCard = document.getElementById('admin-serving-display');
    const callNextBtn = document.getElementById('admin-call-next-btn');
    const completeBtn = document.getElementById('admin-complete-btn');
    const noshowBtn = document.getElementById('admin-noshow-btn');
    const recallBtn = document.getElementById('admin-recall-btn');

    if (stats.currentlyServingToken) {
      const token = stats.currentlyServingToken;
      const waitTimeMins = Math.max(0, Math.round((token.servedAt - token.createdAt) / 60000));
      servingCard.innerHTML = `
        <div class="serving-active-box">
          <div class="serving-header">
            <span class="status-pill status-serving pulse"><span class="status-dot"></span> CURRENTLY SERVING</span>
            <span class="serving-since font-mono">Called ${this.formatTimeAgo(token.servedAt)}</span>
          </div>
          <div class="serving-token-number font-mono">${token.display}</div>
          <div class="serving-details">
            <div class="serving-detail-row">
              <span class="detail-label">Patient Ref:</span>
              <span class="detail-value font-mono font-bold">${this.escapeHtml(token.patientRef || 'MRN-Auto')}</span>
              <span class="mode-tag ${token.checkinType === 'reception' ? 'mode-reception' : 'mode-self'}">
                ${token.checkinType === 'reception' ? 'Reception' : 'Self-Check'}
              </span>
            </div>
            <div class="serving-detail-row">
              <span class="detail-label">Service:</span>
              <span class="detail-value">${this.escapeHtml(token.purpose || 'General Consultation')}</span>
            </div>
            <div class="serving-detail-row">
              <span class="detail-label">Wait Time:</span>
              <span class="detail-value font-mono">${waitTimeMins}m in waiting area</span>
            </div>
          </div>
        </div>
      `;

      if (callNextBtn) {
        callNextBtn.disabled = true;
        callNextBtn.setAttribute('title', 'Complete or resolve current patient before calling next');
      }
      if (completeBtn) {
        completeBtn.disabled = false;
        completeBtn.setAttribute('title', 'Mark consultation/service as completed');
      }
      if (noshowBtn) {
        noshowBtn.disabled = false;
        noshowBtn.setAttribute('title', 'Mark this patient as No-Show');
      }
      if (recallBtn) {
        recallBtn.disabled = false;
      }
    } else {
      servingCard.innerHTML = `
        <div class="serving-idle-box">
          <div class="idle-icon-svg">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="idle-title">Window is Idle</div>
          <p class="idle-desc">${stats.waiting > 0 ? `${stats.waiting} patient(s) waiting in queue. Click "Call Next Patient" to begin.` : 'No patients currently waiting in this clinic queue.'}</p>
        </div>
      `;

      if (callNextBtn) {
        callNextBtn.disabled = stats.waiting === 0;
        callNextBtn.setAttribute('title', stats.waiting === 0 ? 'Queue is empty' : 'Call next waiting patient');
      }
      if (completeBtn) {
        completeBtn.disabled = true;
        completeBtn.setAttribute('title', 'No active patient to complete');
      }
      if (noshowBtn) {
        noshowBtn.disabled = true;
        noshowBtn.setAttribute('title', 'No active patient to mark as no-show');
      }
      if (recallBtn) {
        recallBtn.disabled = true;
      }
    }

    // Queue Table Rendering
    const activeFilter = document.querySelector('.admin-filter-pill.active')?.getAttribute('data-filter') || 'all';
    this.renderQueueTable(activeFilter);
  }

  renderQueueTable(filter = 'all') {
    const tbody = document.getElementById('queue-table-body');
    if (!tbody) return;

    const deptId = this.state.selectedDepartment;
    const dept = this.state.departments[deptId];
    let tokens = [...dept.tokens];

    if (filter === 'waiting') {
      tokens = tokens.filter(t => t.status === 'waiting');
    } else if (filter === 'serving') {
      tokens = tokens.filter(t => t.status === 'serving');
    } else if (filter === 'completed') {
      tokens = tokens.filter(t => t.status === 'completed');
    } else if (filter === 'cancelled') {
      tokens = tokens.filter(t => t.status === 'cancelled');
    }

    // Update filter counts in pill tabs
    const stats = QueueEngine.getDepartmentStats(dept);
    document.querySelectorAll('.admin-filter-pill').forEach(pill => {
      const f = pill.getAttribute('data-filter');
      const countEl = pill.querySelector('.pill-count');
      if (countEl) {
        if (f === 'all') countEl.textContent = stats.total;
        else if (f === 'waiting') countEl.textContent = stats.waiting;
        else if (f === 'serving') countEl.textContent = stats.serving;
        else if (f === 'completed') countEl.textContent = stats.completed;
        else if (f === 'cancelled') countEl.textContent = stats.cancelled;
      }
    });

    if (tokens.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="table-empty-cell">
            <div class="table-empty-state">
              <div class="empty-icon-svg">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <p>No patient records in <strong>${filter}</strong> category.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    // Render token rows
    tbody.innerHTML = tokens.map((t) => {
      const statusBadge = this.getStatusBadgeHtml(t.status, t.cancelReason);
      const createdTime = new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const waitTime = this.calculateWaitTime(t);
      const checkinModeLabel = t.checkinType === 'reception'
        ? '<span class="badge-mini mode-reception">Reception</span>'
        : '<span class="badge-mini mode-self">Self-Check</span>';

      let actionHtml = '';
      if (t.status === 'waiting') {
        actionHtml = `
          <div class="table-actions-group">
            <button class="btn-table btn-call-sm" onclick="window.SmartQueueInstance.handleCallSpecific('${t.id}')" title="Call this patient">
              Call
            </button>
            <button class="btn-table btn-noshow-sm" onclick="window.SmartQueueInstance.handleNoShowFromTable('${t.id}')" title="Mark as No-Show">
              No-Show
            </button>
            <button class="btn-table btn-cancel-sm" onclick="window.SmartQueueInstance.handleCancelFromTable('${t.id}')" title="Cancel Token">
              Cancel
            </button>
          </div>
        `;
      } else if (t.status === 'serving') {
        actionHtml = `
          <div class="table-actions-group">
            <button class="btn-table btn-complete" onclick="window.SmartQueueInstance.handleCompleteCurrent()" title="Complete Service">
              Complete
            </button>
            <button class="btn-table btn-noshow-sm" onclick="window.SmartQueueInstance.handleNoShowFromTable('${t.id}')" title="Mark as No-Show">
              No-Show
            </button>
          </div>
        `;
      } else {
        actionHtml = `<span class="text-muted text-sm">—</span>`;
      }

      return `
        <tr class="queue-row row-${t.status}">
          <td class="font-mono font-bold text-teal">${t.display}</td>
          <td class="font-mono font-medium">${this.escapeHtml(t.patientRef || 'MRN-Auto')}</td>
          <td>${this.escapeHtml(t.purpose || 'General Consultation')}</td>
          <td>${checkinModeLabel}</td>
          <td class="font-mono text-sm">${createdTime}</td>
          <td class="font-mono text-sm">${waitTime}</td>
          <td>${statusBadge}</td>
          <td class="table-actions">${actionHtml}</td>
        </tr>
      `;
    }).join('');
  }

  renderDisplayBoard() {
    const currentDeptId = this.state.selectedDepartment;
    const currentDept = this.state.departments[currentDeptId];

    // Main Counter Callout on Display Board
    const boardDeptTitle = document.getElementById('board-current-dept');
    if (boardDeptTitle) boardDeptTitle.textContent = currentDept.name;

    const boardCounterName = document.getElementById('board-current-counter');
    if (boardCounterName) boardCounterName.textContent = currentDept.counter;

    const boardServingToken = document.getElementById('board-serving-number');
    if (boardServingToken) {
      if (currentDept.currentlyServing) {
        boardServingToken.textContent = currentDept.currentlyServing;
        boardServingToken.className = 'board-big-token pulse-glow';
      } else {
        boardServingToken.textContent = '—';
        boardServingToken.className = 'board-big-token idle';
      }
    }

    // Upcoming Waiting list on Board
    const upcomingList = document.getElementById('board-upcoming-list');
    if (upcomingList) {
      const waiting = currentDept.tokens.filter(t => t.status === 'waiting').slice(0, 5);
      if (waiting.length === 0) {
        upcomingList.innerHTML = `<li class="board-empty-item">No upcoming patients in waiting queue</li>`;
      } else {
        upcomingList.innerHTML = waiting.map((t, idx) => `
          <li class="board-upcoming-item">
            <span class="upcoming-position font-mono">#${idx + 1}</span>
            <div class="upcoming-info">
              <span class="upcoming-token font-mono">${t.display}</span>
              <span class="upcoming-ref font-mono">${this.escapeHtml(t.patientRef || '')}</span>
            </div>
            <span class="upcoming-time font-mono">${new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </li>
        `).join('');
      }
    }

    // Department Overview Grid (All 3 Departments side by side)
    const summaryGrid = document.getElementById('board-departments-grid');
    if (summaryGrid) {
      summaryGrid.innerHTML = Object.entries(this.state.departments).map(([id, d]) => {
        const stats = QueueEngine.getDepartmentStats(d);
        const isCurrent = id === currentDeptId;
        return `
          <div class="board-dept-card ${isCurrent ? 'board-dept-active' : ''}">
            <div class="board-card-header">
              <span class="board-card-name">${this.escapeHtml(d.name)}</span>
              <span class="board-card-counter font-mono">${this.escapeHtml(d.counter)}</span>
            </div>
            <div class="board-card-body">
              <div class="board-serving-sub">
                <span class="label">Now Serving</span>
                <span class="val font-mono ${d.currentlyServing ? 'val-serving' : 'val-idle'}">${d.currentlyServing || '—'}</span>
              </div>
              <div class="board-waiting-sub">
                <span class="label">Waiting in Queue</span>
                <span class="val font-mono">${stats.waiting}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // --- Actions Triggered From Table ---
  handleCallSpecific(tokenId) {
    const deptId = this.state.selectedDepartment;
    const dept = this.state.departments[deptId];

    if (dept.currentlyServing) {
      this.showToast(`Counter is currently serving Token ${dept.currentlyServing}. Complete or resolve it first.`, 'warning');
      return;
    }

    // Find the token
    const token = dept.tokens.find(t => t.id === tokenId && t.status === 'waiting');
    if (!token) {
      this.showToast('Selected token is not waiting.', 'warning');
      return;
    }

    SoundEffects.initAudio();
    token.status = 'serving';
    token.servedAt = Date.now();
    dept.currentlyServing = token.id;

    SoundEffects.playChime(this.state.soundEnabled);
    this.saveAndRender();
    this.showToast(`Now serving Patient Token ${token.display} at ${dept.counter}!`, 'success');
  }

  handleNoShowFromTable(tokenId) {
    const deptId = this.state.selectedDepartment;
    this.showConfirmDialog(
      `Mark Token ${tokenId} as No-Show?`,
      `Are you sure you want to mark Patient Token ${tokenId} as a No-Show?`,
      'Mark No-Show',
      () => {
        const result = QueueEngine.markNoShow(this.state, deptId, tokenId);
        if (result.success) {
          this.saveAndRender();
          this.showToast(result.message, 'info');
        } else {
          this.showToast(result.message, 'error');
        }
      }
    );
  }

  handleCancelFromTable(tokenId) {
    const deptId = this.state.selectedDepartment;
    this.showConfirmDialog(
      `Cancel Token ${tokenId}?`,
      `Are you sure you want to cancel Token ${tokenId} from the queue?`,
      'Cancel Token',
      () => {
        const result = QueueEngine.cancelToken(this.state, deptId, tokenId, 'Cancelled by staff');
        if (result.success) {
          this.saveAndRender();
          this.showToast(result.message, 'info');
        } else {
          this.showToast(result.message, 'error');
        }
      }
    );
  }

  handleCompleteCurrent() {
    const deptId = this.state.selectedDepartment;
    const result = QueueEngine.completeCurrentToken(this.state, deptId);
    if (result.success) {
      this.saveAndRender();
      this.showToast(result.message, 'success');
    } else {
      this.showToast(result.message, 'warning');
    }
  }

  // --- Helper Methods ---
  getStatusBadgeHtml(status, cancelReason) {
    switch (status) {
      case 'waiting':
        return '<span class="status-pill status-waiting">Waiting</span>';
      case 'serving':
        return '<span class="status-pill status-serving"><span class="status-dot"></span> Serving</span>';
      case 'completed':
        return '<span class="status-pill status-completed">Completed</span>';
      case 'cancelled':
        return cancelReason === 'Patient No-Show' 
          ? '<span class="status-pill status-cancelled">No-Show</span>'
          : '<span class="status-pill status-cancelled">Cancelled</span>';
      default:
        return `<span class="status-pill">${this.escapeHtml(status)}</span>`;
    }
  }

  calculateWaitTime(token) {
    if (token.status === 'waiting') {
      const mins = Math.max(0, Math.floor((Date.now() - token.createdAt) / 60000));
      return `${mins}m waiting`;
    }
    if (token.servedAt) {
      const waitMins = Math.max(0, Math.floor((token.servedAt - token.createdAt) / 60000));
      if (token.status === 'serving') {
        const servingMins = Math.max(0, Math.floor((Date.now() - token.servedAt) / 60000));
        return `${waitMins}m wait (${servingMins}m in consult)`;
      }
      if (token.completedAt) {
        const handleMins = Math.max(0, Math.floor((token.completedAt - token.servedAt) / 60000));
        return `${waitMins}m wait (${handleMins}m consult)`;
      }
    }
    return '—';
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return '—';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  updateRelativeTimes() {
    if (this.state && (this.state.activeTab === 'admin' || this.state.activeTab === 'display')) {
      this.render();
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// ============================================================================
// 6. INITIALIZATION & EXPORTS
// ============================================================================

// Initialize when running in browser
if (typeof window !== 'undefined') {
  window.SmartQueue = {
    QueueEngine,
    StorageManager,
    DEPARTMENTS_CONFIG,
    STORAGE_KEY,
    App: SmartQueueApp
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.SmartQueueInstance = new SmartQueueApp();
    window.SmartQueueInstance.init();
  });
}

// CommonJS export for Node.js automated testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    QueueEngine,
    StorageManager,
    DEPARTMENTS_CONFIG,
    STORAGE_KEY
  };
}
