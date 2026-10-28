/**
 * Smart Queue — Automated Test Suite
 * Compatible with Node.js built-in test runner (`node --test`)
 * and direct Node execution (`node tests/app.test.js`).
 *
 * Verifies:
 * 1. Sequential token generation & prefix formatting (A001, A002, A003).
 * 2. Calling next waiting token & single-server constraint.
 * 3. Completing the active serving token.
 * 4. Cancelling waiting tokens.
 * 5. Department queue isolation (Admin, Fee, Lab).
 * 6. Queue reset operations (single department & all).
 * 7. Storage persistence & reload simulation.
 * 8. Error resilience against corrupted or missing LocalStorage data.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { QueueEngine, StorageManager, DEPARTMENTS_CONFIG, STORAGE_KEY } = require('../app.js');

// Mock localStorage implementation for Node test environment
class MockLocalStorage {
  constructor(initialData = {}) {
    this.store = { ...initialData };
  }

  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }
}

// ============================================================================
// TEST SUITE: SMART QUEUE ENGINE & PERSISTENCE
// ============================================================================

test('1. Sequential Token Generation & Prefix Numbering', async (t) => {
  const state = QueueEngine.createEmptyState();

  // Test sequential generation for Administration Office (Prefix A)
  const t1 = QueueEngine.generateToken(state, 'admin', 'Certificate Request');
  assert.equal(t1.success, true);
  assert.equal(t1.token.display, 'A001');
  assert.equal(t1.token.number, 1);
  assert.equal(t1.token.status, 'waiting');
  assert.equal(state.departments.admin.lastSequence, 1);
  assert.equal(state.userTokens.admin, 'A001');

  const t2 = QueueEngine.generateToken(state, 'admin', 'Grade Card');
  assert.equal(t2.token.display, 'A002');
  assert.equal(t2.token.number, 2);
  assert.equal(state.departments.admin.lastSequence, 2);

  const t3 = QueueEngine.generateToken(state, 'admin', 'Admissions Enquiry');
  assert.equal(t3.token.display, 'A003');
  assert.equal(t3.token.number, 3);
  assert.equal(state.departments.admin.lastSequence, 3);

  // Department token count should equal 3
  assert.equal(state.departments.admin.tokens.length, 3);
});

test('2. Calling Next Token & Preventing Concurrent Serving', async (t) => {
  const state = QueueEngine.createEmptyState();
  QueueEngine.generateToken(state, 'admin', 'First Visitor');
  QueueEngine.generateToken(state, 'admin', 'Second Visitor');

  assert.equal(state.departments.admin.currentlyServing, null);

  // Call first token
  const call1 = QueueEngine.callNextToken(state, 'admin');
  assert.equal(call1.success, true);
  assert.equal(call1.token.display, 'A001');
  assert.equal(call1.token.status, 'serving');
  assert.equal(state.departments.admin.currentlyServing, 'A001');

  // Attempting to call next token while A001 is still serving MUST fail
  const call2 = QueueEngine.callNextToken(state, 'admin');
  assert.equal(call2.success, false);
  assert.match(call2.message, /currently serving/i);
  assert.equal(state.departments.admin.currentlyServing, 'A001');
});

test('3. Completing the Serving Token', async (t) => {
  const state = QueueEngine.createEmptyState();
  QueueEngine.generateToken(state, 'admin', 'Enquiry');
  QueueEngine.callNextToken(state, 'admin');

  assert.equal(state.departments.admin.currentlyServing, 'A001');

  // Complete the serving token
  const compResult = QueueEngine.completeCurrentToken(state, 'admin');
  assert.equal(compResult.success, true);
  assert.equal(compResult.token.display, 'A001');
  assert.equal(compResult.token.status, 'completed');
  assert.ok(compResult.token.completedAt > 0);
  assert.equal(state.departments.admin.currentlyServing, null);

  // Calling complete again when counter is idle MUST fail
  const compAgain = QueueEngine.completeCurrentToken(state, 'admin');
  assert.equal(compAgain.success, false);
  assert.match(compAgain.message, /no token is currently being served/i);
});

test('4. Cancelling a Waiting Token', async (t) => {
  const state = QueueEngine.createEmptyState();
  QueueEngine.generateToken(state, 'admin', 'Visitor 1');
  QueueEngine.generateToken(state, 'admin', 'Visitor 2');

  // Cancel waiting token A002
  const cancelResult = QueueEngine.cancelToken(state, 'admin', 'A002', 'Visitor left premises');
  assert.equal(cancelResult.success, true);
  assert.equal(cancelResult.token.status, 'cancelled');
  assert.equal(cancelResult.token.cancelReason, 'Visitor left premises');

  // Cannot cancel an already cancelled token
  const cancelAgain = QueueEngine.cancelToken(state, 'admin', 'A002');
  assert.equal(cancelAgain.success, false);
  assert.match(cancelAgain.message, /already cancelled/i);

  // Calling next should skip cancelled tokens and serve remaining waiting tokens
  const nextCall = QueueEngine.callNextToken(state, 'admin');
  assert.equal(nextCall.success, true);
  assert.equal(nextCall.token.display, 'A001');
});

test('5. Independent Department Queues Isolation', async (t) => {
  const state = QueueEngine.createEmptyState();

  // Generate tokens across Administration (A), Fee (F), Lab (L)
  const adminToken = QueueEngine.generateToken(state, 'admin', 'Certificates');
  const feeToken1 = QueueEngine.generateToken(state, 'fee', 'Semester Fee');
  const feeToken2 = QueueEngine.generateToken(state, 'fee', 'Exam Challan');
  const labToken = QueueEngine.generateToken(state, 'lab', 'Component Kit');

  assert.equal(adminToken.token.display, 'A001');
  assert.equal(feeToken1.token.display, 'F001');
  assert.equal(feeToken2.token.display, 'F002');
  assert.equal(labToken.token.display, 'L001');

  // Call Fee token: should NOT affect Admin or Lab
  const feeCall = QueueEngine.callNextToken(state, 'fee');
  assert.equal(feeCall.success, true);
  assert.equal(state.departments.fee.currentlyServing, 'F001');
  assert.equal(state.departments.admin.currentlyServing, null);
  assert.equal(state.departments.lab.currentlyServing, null);

  // Admin stats should reflect 1 waiting, 0 serving
  const adminStats = QueueEngine.getDepartmentStats(state.departments.admin);
  assert.equal(adminStats.waiting, 1);
  assert.equal(adminStats.serving, 0);

  // Fee stats should reflect 1 waiting, 1 serving
  const feeStats = QueueEngine.getDepartmentStats(state.departments.fee);
  assert.equal(feeStats.waiting, 1);
  assert.equal(feeStats.serving, 1);
});

test('6. Reset Operations (Department & All Queues)', async (t) => {
  const state = QueueEngine.createInitialState();

  // Reset only Administration Office
  const resetAdmin = QueueEngine.resetDepartmentQueue(state, 'admin');
  assert.equal(resetAdmin.success, true);
  assert.equal(state.departments.admin.lastSequence, 0);
  assert.equal(state.departments.admin.currentlyServing, null);
  assert.equal(state.departments.admin.tokens.length, 0);

  // Fee department should still have its initial tokens intact
  assert.ok(state.departments.fee.tokens.length > 0);

  // Reset All Queues
  const resetAll = QueueEngine.resetAllQueues(state);
  assert.equal(resetAll.success, true);
  assert.equal(state.departments.fee.tokens.length, 0);
  assert.equal(state.departments.lab.tokens.length, 0);
});

test('7. Storage Persistence & State Restoration', async (t) => {
  const mockStorage = new MockLocalStorage();

  // 1. Initialize and save modified state
  const state = QueueEngine.createEmptyState();
  QueueEngine.generateToken(state, 'admin', 'Student 1');
  QueueEngine.generateToken(state, 'admin', 'Student 2');
  QueueEngine.callNextToken(state, 'admin');

  const saveSuccess = StorageManager.save(state, mockStorage);
  assert.equal(saveSuccess, true);

  // Verify raw storage item exists
  const rawItem = mockStorage.getItem(STORAGE_KEY);
  assert.ok(rawItem);
  assert.ok(rawItem.includes('A001'));

  // 2. Simulate page reload by loading from storage
  const restoredState = StorageManager.load(mockStorage);
  assert.equal(restoredState.version, 1);
  assert.equal(restoredState.departments.admin.lastSequence, 2);
  assert.equal(restoredState.departments.admin.currentlyServing, 'A001');
  assert.equal(restoredState.departments.admin.tokens.length, 2);
  assert.equal(restoredState.departments.admin.tokens[0].status, 'serving');
  assert.equal(restoredState.departments.admin.tokens[1].status, 'waiting');
});

test('8. Error Resilience & Recovery from Invalid or Corrupted Data', async (t) => {
  const mockStorage = new MockLocalStorage();

  // Test with invalid JSON string (corrupted storage)
  mockStorage.setItem(STORAGE_KEY, '{ invalid JSON :::: corrupted ]]]');
  const recoveredFromBadJson = StorageManager.load(mockStorage);
  assert.ok(recoveredFromBadJson);
  assert.equal(recoveredFromBadJson.version, 1);
  assert.ok(recoveredFromBadJson.departments.admin);

  // Test with valid JSON but invalid schema structure
  mockStorage.setItem(STORAGE_KEY, JSON.stringify({ invalidField: true }));
  const recoveredFromBadSchema = StorageManager.load(mockStorage);
  assert.ok(recoveredFromBadSchema);
  assert.equal(recoveredFromBadSchema.version, 1);
  assert.equal(QueueEngine.validateState(recoveredFromBadSchema), true);
});

test('9. Edge Cases: Cancelling Serving Token, Invalid Ops & Queue Position', async (t) => {
  const state = QueueEngine.createEmptyState();
  QueueEngine.generateToken(state, 'admin', 'Visitor 1');
  QueueEngine.generateToken(state, 'admin', 'Visitor 2');
  QueueEngine.generateToken(state, 'admin', 'Visitor 3');

  // Verify position ahead: A001 is ahead count 0 (next), A002 is 1, A003 is 2
  assert.equal(QueueEngine.getAheadCount(state.departments.admin, 'A001'), 0);
  assert.equal(QueueEngine.getAheadCount(state.departments.admin, 'A002'), 1);
  assert.equal(QueueEngine.getAheadCount(state.departments.admin, 'A003'), 2);

  // Call A001 to counter
  QueueEngine.callNextToken(state, 'admin');
  assert.equal(state.departments.admin.currentlyServing, 'A001');

  // Cancelling serving token A001 directly should release the counter
  const cancelServing = QueueEngine.cancelToken(state, 'admin', 'A001', 'Visitor walked away');
  assert.equal(cancelServing.success, true);
  assert.equal(state.departments.admin.currentlyServing, null);
  assert.equal(cancelServing.token.status, 'cancelled');

  // Counter is now freed; calling next should successfully pick A002
  const nextCall = QueueEngine.callNextToken(state, 'admin');
  assert.equal(nextCall.success, true);
  assert.equal(nextCall.token.display, 'A002');
  assert.equal(state.departments.admin.currentlyServing, 'A002');

  // Invalid operations tests
  const invalidDept = QueueEngine.generateToken(state, 'unknown_counter');
  assert.equal(invalidDept.success, false);

  const invalidCancel = QueueEngine.cancelToken(state, 'admin', 'NON_EXISTENT');
  assert.equal(invalidCancel.success, false);
});

test('10. Hospital Edition: Department Configuration & Prefixes', async (t) => {
  assert.equal(DEPARTMENTS_CONFIG.admin.name, 'Outpatient Registration & Triage');
  assert.equal(DEPARTMENTS_CONFIG.admin.prefix, 'A');
  assert.equal(DEPARTMENTS_CONFIG.fee.name, 'Pharmacy & Billing Counter');
  assert.equal(DEPARTMENTS_CONFIG.fee.prefix, 'F');
  assert.equal(DEPARTMENTS_CONFIG.lab.name, 'Diagnostic Pathology & Imaging');
  assert.equal(DEPARTMENTS_CONFIG.lab.prefix, 'L');
  assert.equal(STORAGE_KEY, 'smart_queue_hospital_v1');
});

test('11. Hospital Edition: Patient Check-in Modes & Simulated Patient Refs', async (t) => {
  const state = QueueEngine.createEmptyState();

  // Test self-check-in with auto-generated MRN
  const selfToken = QueueEngine.generateToken(state, 'admin', 'General Consultation', '', 'self');
  assert.equal(selfToken.success, true);
  assert.equal(selfToken.token.checkinType, 'self');
  assert.match(selfToken.token.patientRef, /^MRN-\d+$/);

  // Test receptionist registration with explicit simulated MRN
  const recepToken = QueueEngine.generateToken(
    state,
    'admin',
    'Cardiology Specialist Triage [Priority]',
    'MRN-8491',
    'reception'
  );
  assert.equal(recepToken.success, true);
  assert.equal(recepToken.token.checkinType, 'reception');
  assert.equal(recepToken.token.patientRef, 'MRN-8491');
  assert.equal(recepToken.token.purpose, 'Cardiology Specialist Triage [Priority]');
});

test('12. Hospital Edition: Mark Patient as No-Show & Free Counter Window', async (t) => {
  const state = QueueEngine.createEmptyState();
  QueueEngine.generateToken(state, 'fee', 'Prescription Dispensing', 'MRN-1001', 'self');
  QueueEngine.generateToken(state, 'fee', 'Insurance Settlement', 'MRN-1002', 'self');

  // Call first patient to pharmacy window
  QueueEngine.callNextToken(state, 'fee');
  assert.equal(state.departments.fee.currentlyServing, 'F001');

  // Patient fails to arrive at the counter: staff marks as No-Show
  const noShowResult = QueueEngine.markNoShow(state, 'fee', 'F001');
  assert.equal(noShowResult.success, true);
  assert.equal(noShowResult.token.status, 'cancelled');
  assert.equal(noShowResult.token.cancelReason, 'Patient No-Show');
  assert.equal(state.departments.fee.currentlyServing, null);

  // Pharmacist can immediately call next patient
  const nextCall = QueueEngine.callNextToken(state, 'fee');
  assert.equal(nextCall.success, true);
  assert.equal(nextCall.token.display, 'F002');
  assert.equal(state.departments.fee.currentlyServing, 'F002');
});

