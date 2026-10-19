import React, { useState } from 'react';
import AddUserForm from './AddUserForm';
import styles from '../Manager.module.css';

const PREVIEW_COUNT = 5;

const fullName = (user) => `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;

const REMOVE_CONFIRM = {
  deactivate: (name) => `Dezaktywować konto „${name}"? Osoba nie będzie mogła się logować, historia grafiku zostanie.`,
  delete: (name) =>
    `Trwale usunąć konto „${name}"?\n\nTo możliwe tylko bez historii grafiku/zamian. W przeciwnym razie użyj dezaktywacji.`,
};

/**
 * Team accounts: role, hourly rate, active flag, schedule shortcut, deactivation and deletion.
 * Own account controls are disabled — the API refuses to demote or remove yourself anyway.
 */
const AccountsCard = ({
  users,
  currentUserId,
  onCreate,
  onUpdate,
  onRemove,
  onOpenSchedule,
  onError,
}) => {
  const [formOpen, setFormOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [optionsUserId, setOptionsUserId] = useState(null);

  const visibleUsers = showAll ? users : users.slice(0, PREVIEW_COUNT);

  const create = async (payload) => {
    if (await onCreate(payload)) setFormOpen(false);
  };

  const remove = (user, permanent) => {
    const confirmText = REMOVE_CONFIRM[permanent ? 'delete' : 'deactivate'](fullName(user));
    if (window.confirm(confirmText)) onRemove(user, { permanent });
  };

  const updateRate = (user, value) => {
    if (value === '' || Number.isNaN(Number(value))) return;
    onUpdate(user, { hourly_rate: value });
  };

  return (
    <div className={styles.sectionCard}>
      <div className={styles.settingsToggleRow}>
        <div>
          <h3>Zarządzanie kontami</h3>
          <p className={styles.statHint}>Lista kont zespołu — dodawaj pracowników i kierowników z panelu.</p>
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => setFormOpen((open) => !open)}
          aria-expanded={formOpen}
        >
          {formOpen ? 'Anuluj' : 'Dodaj pracownika'}
        </button>
      </div>

      {formOpen ? <AddUserForm onSubmit={create} onCancel={() => setFormOpen(false)} onError={onError} /> : null}

      <div className={styles.tableWrap}>
        <table className={styles.empTable}>
          <thead>
            <tr>
              <th>Osoba</th>
              <th>Rola</th>
              <th>Stawka</th>
              <th>Aktywne</th>
              <th>Grafik</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => {
              const isSelf = user.id === currentUserId;
              const isActive = user.is_active !== false;
              const optionsOpen = optionsUserId === user.id;
              return (
                <tr key={user.id} className={isActive ? undefined : styles.inactiveRow}>
                  <td>
                    <div className={styles.empName}>
                      {user.first_name} {user.last_name}
                    </div>
                    <small>{user.username}</small>
                  </td>
                  <td>
                    <select
                      value={user.is_manager ? 'manager' : 'employee'}
                      onChange={(event) => onUpdate(user, { is_manager: event.target.value === 'manager' })}
                      disabled={isSelf}
                    >
                      <option value="employee">Pracownik</option>
                      <option value="manager">Kierownik</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={user.hourly_rate ?? ''}
                      key={`rate-${user.id}-${user.hourly_rate}`}
                      onBlur={(event) => updateRate(user, event.target.value)}
                    />
                  </td>
                  <td className={styles.empActiveCell}>
                    <input
                      type="checkbox"
                      checked={isActive}
                      disabled={isSelf}
                      onChange={(event) => onUpdate(user, { is_active: event.target.checked })}
                      aria-label={`Aktywne: ${user.username}`}
                    />
                  </td>
                  <td>
                    {!user.is_manager && isActive ? (
                      <button type="button" className={styles.btnPrimary} onClick={() => onOpenSchedule(user)}>
                        Grafik
                      </button>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  <td>
                    {isSelf ? (
                      <span>—</span>
                    ) : (
                      <div className={styles.empActions}>
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          onClick={() => setOptionsUserId(optionsOpen ? null : user.id)}
                          aria-expanded={optionsOpen}
                        >
                          {optionsOpen ? 'Ukryj opcje' : 'Więcej opcji'}
                        </button>
                        {optionsOpen ? (
                          <div className={styles.empMoreOptions}>
                            {isActive ? (
                              <button type="button" className={styles.btnSecondary} onClick={() => remove(user, false)}>
                                Dezaktywuj
                              </button>
                            ) : null}
                            <button type="button" className={styles.btnDanger} onClick={() => remove(user, true)}>
                              Usuń
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {users.length > PREVIEW_COUNT ? (
        <button
          type="button"
          className={`${styles.btnSecondary} ${styles.usersExpandBtn}`}
          onClick={() => setShowAll((prev) => !prev)}
          aria-expanded={showAll}
        >
          {showAll ? 'Zwiń listę' : `Pokaż wszystkich (${users.length})`}
        </button>
      ) : null}
    </div>
  );
};

export default AccountsCard;
