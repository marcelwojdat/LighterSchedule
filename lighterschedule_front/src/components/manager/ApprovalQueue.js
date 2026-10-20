import React, { useEffect, useState } from 'react';
import RejectionReasonPicker from './RejectionReasonPicker';
import RoleSelect from '../common/RoleSelect';
import styles from '../Manager.module.css';
import { displayName } from '../../utils/people';
import { toApiTime } from '../../utils/time';

const employeeName = (item, employees) => {
  const employee = employees.find((candidate) => candidate.id === item.employee);
  return employee ? displayName(employee) : item.employee_name;
};

const fullShiftTitle = (item) =>
  item.shift_slots?.is_full ? `Zmiana ${item.shift_template_name || ''} jest już obsadzona` : undefined;

/**
 * Employee declarations waiting for approval: approve as-is, edit hours/role first, reject, or approve in bulk.
 *
 * Callbacks resolve to true on success; forms stay open when an action fails.
 */
const ApprovalQueue = ({ items, employees, taskTypes, rejectionReasons, onApprove, onReject, onBulkApprove }) => {
  // A row is either viewed, edited or being rejected — one state, so two modes can't be open at once.
  const [active, setActive] = useState(null); // { id, kind: 'edit' | 'reject' }
  const [editTimes, setEditTimes] = useState({ start: '', end: '' });
  const [editRole, setEditRole] = useState('');
  const [reason, setReason] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const approvable = items.filter((item) => !item.shift_slots?.is_full);

  // Drop selections of rows that disappeared or became full after a refresh.
  useEffect(() => {
    const validIds = new Set(items.filter((item) => !item.shift_slots?.is_full).map((item) => item.id));
    setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [items]);

  const isActive = (item, kind) => active?.id === item.id && active.kind === kind;
  const close = () => setActive(null);

  const startEdit = (item) => {
    setEditTimes({ start: item.start_time.slice(0, 5), end: item.end_time.slice(0, 5) });
    setEditRole(item.role ? String(item.role) : '');
    setActive({ id: item.id, kind: 'edit' });
  };

  const startReject = (item) => {
    setReason('');
    setActive({ id: item.id, kind: 'reject' });
  };

  const approve = async (item) => {
    const changes = isActive(item, 'edit')
      ? { start_time: toApiTime(editTimes.start), end_time: toApiTime(editTimes.end), role: editRole ? Number(editRole) : null }
      : { start_time: toApiTime(item.start_time), end_time: toApiTime(item.end_time), role: item.role || null };
    if (await onApprove(item, changes)) close();
  };

  const reject = async (item) => {
    if (await onReject(item, reason.trim())) close();
  };

  const toggleSelected = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((selected) => selected !== id) : [...prev, id]));

  const bulkApprove = async () => {
    if (!window.confirm(`Zatwierdzić ${selectedIds.length} deklaracji bez zmian godzin?`)) return;
    setBulkBusy(true);
    try {
      if (await onBulkApprove(selectedIds)) {
        setSelectedIds([]);
        close();
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const renderActions = (item) => {
    if (isActive(item, 'reject')) {
      return (
        <>
          <button type="button" className={styles.btnDanger} onClick={() => reject(item)}>
            Potwierdź odrzucenie
          </button>
          <button type="button" className={styles.btnSecondary} onClick={close}>
            Anuluj
          </button>
        </>
      );
    }
    const isFull = item.shift_slots?.is_full;
    if (isActive(item, 'edit')) {
      return (
        <>
          <button type="button" className={styles.btnSuccess} onClick={() => approve(item)} disabled={isFull} title={fullShiftTitle(item)}>
            Zatwierdź
          </button>
          <button type="button" className={styles.btnSecondary} onClick={close}>
            Anuluj
          </button>
        </>
      );
    }
    return (
      <>
        <button type="button" className={styles.btnSuccess} onClick={() => approve(item)} disabled={isFull} title={fullShiftTitle(item)}>
          {isFull ? 'Brak miejsc' : 'Zatwierdź'}
        </button>
        <button type="button" className={styles.btnSecondary} onClick={() => startEdit(item)}>
          Edytuj godziny
        </button>
        <button type="button" className={styles.btnDanger} onClick={() => startReject(item)}>
          Odrzuć
        </button>
      </>
    );
  };

  return (
    <div className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <h3>Do akceptacji</h3>
        <span className={styles.queueBadge}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className={styles.emptyQueue}>Brak deklaracji oczekujących na akceptację.</p>
      ) : (
        <div className={styles.queueList}>
          {approvable.length > 0 ? (
            <div className={styles.bulkApproveBar}>
              <div className={styles.bulkApproveActions}>
                <button
                  type="button"
                  className={styles.btnLink}
                  onClick={() => setSelectedIds(approvable.map((item) => item.id))}
                  disabled={bulkBusy}
                >
                  Zaznacz dostępne ({approvable.length})
                </button>
                {selectedIds.length ? (
                  <button type="button" className={styles.btnLink} onClick={() => setSelectedIds([])} disabled={bulkBusy}>
                    Odznacz
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.btnSuccess}
                disabled={bulkBusy || selectedIds.length === 0}
                onClick={bulkApprove}
              >
                {bulkBusy ? 'Zatwierdzanie…' : `Zatwierdź zaznaczone (${selectedIds.length})`}
              </button>
            </div>
          ) : null}

          {items.map((item) => {
            const name = employeeName(item, employees);
            return (
              <div key={item.id} className={styles.queueItem}>
                <div className={styles.queueItemHeader}>
                  <label className={styles.queueSelectLabel}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      disabled={Boolean(item.shift_slots?.is_full) || bulkBusy}
                      onChange={() => toggleSelected(item.id)}
                      aria-label={`Zaznacz ${name} ${item.date}`}
                    />
                    <strong>{name}</strong>
                  </label>
                  <span>{item.date}</span>
                </div>

                {isActive(item, 'edit') ? (
                  <div className={styles.queueEditRow}>
                    <input
                      type="time"
                      value={editTimes.start}
                      onChange={(event) => setEditTimes((prev) => ({ ...prev, start: event.target.value }))}
                    />
                    <input
                      type="time"
                      value={editTimes.end}
                      onChange={(event) => setEditTimes((prev) => ({ ...prev, end: event.target.value }))}
                    />
                    <RoleSelect taskTypes={taskTypes} value={editRole} onChange={setEditRole} className={styles.roleSelect} />
                  </div>
                ) : (
                  <div className={styles.queueHours}>
                    {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
                    {item.role_name ? ` (${item.role_name})` : ''}
                  </div>
                )}
                {item.note?.trim() ? <div className={styles.dayNoteBox}>Notatka: {item.note}</div> : null}
                {item.shift_template_name ? (
                  <div className={styles.queueHours}>
                    Zmiana: {item.shift_template_name}
                    {item.shift_slots ? ` · ${item.shift_slots.filled}/${item.shift_slots.max_slots} miejsc` : ''}
                  </div>
                ) : null}
                {item.shift_slots?.is_full ? (
                  <div className={styles.slotFullHint}>
                    Zmiana obsadzona
                    {item.shift_slots.holders?.length
                      ? `: ${item.shift_slots.holders.map((holder) => holder.name).join(', ')}`
                      : ''}
                  </div>
                ) : null}
                {isActive(item, 'reject') ? (
                  <RejectionReasonPicker reasons={rejectionReasons} value={reason} onChange={setReason} />
                ) : null}

                <div className={styles.queueActions}>{renderActions(item)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApprovalQueue;
