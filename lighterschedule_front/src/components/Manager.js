import React, { useEffect, useState } from 'react';
import Auth from './Auth';
import ToastStack from './ToastStack';
import UserMenu from './UserMenu';
import AccountsCard from './manager/AccountsCard';
import ApprovalQueue from './manager/ApprovalQueue';
import EmployeeScheduleEditor from './manager/EmployeeScheduleEditor';
import ScheduleHolesCard from './manager/ScheduleHolesCard';
import ScheduleSettingsCard from './manager/ScheduleSettingsCard';
import SwapQueue from './manager/SwapQueue';
import TeamStatsBar from './manager/TeamStatsBar';
import TeamWeekOverview from './manager/TeamWeekOverview';
import styles from './Manager.module.css';
import { getErrorMessage } from '../api/client';
import { updateScheduleSettings } from '../api/scheduleSettings';
import { createShiftTemplate, deleteShiftTemplate, updateShiftTemplate } from '../api/shiftTemplates';
import { downloadPayrollPdf } from '../api/stats';
import { approveSwap as approveSwapRequest, rejectSwap as rejectSwapRequest } from '../api/swaps';
import { createUser, deleteUser, updateUserProfile } from '../api/users';
import {
  approveWorkday,
  bulkApproveWorkdays,
  copyWorkdays,
  createWorkday,
  deleteWorkday,
  rejectWorkday,
  updateWorkday,
} from '../api/workdays';
import { useAutoDismiss } from '../hooks/useAutoDismiss';
import { useDismissibleList } from '../hooks/useDismissibleList';
import { useManagerData } from '../hooks/useManagerData';
import { useTheme } from '../hooks/useTheme';
import { addDays, formatDateStr, getMonday, shiftMonth } from '../utils/dates';
import { formatMonthYearPl } from '../utils/locale';
import { displayName } from '../utils/people';
import { buildWorkdayPayload } from '../utils/time';

const MESSAGE_TIMEOUT_MS = 7000;

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const currentCalendarMonth = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
};

// Module-level, so it is stable between renders (useDismissibleList depends on it).
const notificationKey = (item, index) =>
  `${item.type}|${item.shift_template_id || ''}|${item.date || ''}|${item.message || ''}|${index}`;

/** "zatwierdzono 2, pominięto 1" from API counters; empty string when nothing happened. */
const describeCounts = (labels, result) =>
  Object.entries(labels)
    .filter(([key]) => result[key])
    .map(([key, label]) => `${label} ${result[key]}`)
    .join(', ');

/**
 * Saves one day edited by the manager. Manager edits always end up approved:
 * a pending proposal is approved with the manager's hours, an approved day is updated,
 * and a rejected day is replaced by a new entry.
 */
const saveDay = async (existing, payload) => {
  if (existing?.status === 'proposed') return approveWorkday(existing.id, payload);
  if (existing?.status === 'approved') return updateWorkday(existing.id, payload);
  if (existing?.status === 'rejected') await deleteWorkday(existing.id);
  return createWorkday(payload);
};

/**
 * Manager panel: loads the organization's data, runs the actions of every section
 * and lays the sections out. Sections own their UI state; this component owns data and messages.
 */
const Manager = () => {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [statsMonth, setStatsMonth] = useState(currentMonthValue);
  const [coverageMonth, setCoverageMonth] = useState(currentCalendarMonth);
  const [weekStart, setWeekStart] = useState(() => formatDateStr(getMonday()));
  const [holesDays, setHolesDays] = useState(7);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { darkMode, toggleTheme } = useTheme();
  useAutoDismiss(success, setSuccess, MESSAGE_TIMEOUT_MS);
  useAutoDismiss(error, setError, MESSAGE_TIMEOUT_MS);

  const {
    allUsers,
    setAllUsers,
    reloadUsers,
    employees,
    pendingQueue,
    swapQueue,
    teamStats,
    teamWorkdays,
    coverageWorkdays,
    workdays,
    reloadEmployeeWorkdays,
    taskTypes,
    shiftTemplates,
    reloadShiftTemplates,
    scheduleSettings,
    setScheduleSettings,
    rejectionReasons,
    scheduleHoles,
    notifications,
    refreshData,
  } = useManagerData({ statsMonth, weekStart, coverageMonth, holesDays, selectedEmployee, onError: setError });

  const { visible: visibleNotices, dismiss: dismissNotice } = useDismissibleList(
    notifications.items,
    notificationKey,
    MESSAGE_TIMEOUT_MS,
  );

  useEffect(() => {
    Auth.fetchCurrentUser()
      .then(setCurrentUser)
      .catch(() => Auth.logout());
  }, []);

  const notifySuccess = (message) => {
    setSuccess(message);
    setError('');
  };

  /**
   * Runs a server action, shows the outcome and reloads data (everything by default).
   * Resolves to true on success, so sections know whether to close their forms.
   */
  const runAction = async (action, { success: successMessage, failure, reload = refreshData }) => {
    try {
      const result = await action();
      notifySuccess(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      if (reload) await reload();
      return true;
    } catch (err) {
      setError(getErrorMessage(err, failure));
      return false;
    }
  };

  // --- Team stats ---

  const downloadPayroll = () =>
    runAction(() => downloadPayrollPdf(statsMonth), {
      success: `Pobrano raport PDF za ${formatMonthYearPl(statsMonth)}.`,
      failure: 'Nie udało się pobrać raportu PDF.',
      reload: null,
    });

  // --- Approval and swap queues ---

  const approveProposal = (item, changes) =>
    runAction(() => approveWorkday(item.id, changes), {
      success: `Zatwierdzono grafik ${item.employee_name} na ${item.date}.`,
      failure: 'Nie udało się zatwierdzić deklaracji.',
    });

  const rejectProposal = (item, reason) =>
    runAction(() => rejectWorkday(item.id, reason ? { rejection_reason: reason } : {}), {
      success: `Odrzucono deklarację ${item.employee_name} na ${item.date}.`,
      failure: 'Nie udało się odrzucić deklaracji.',
    });

  const bulkApproveProposals = (ids) =>
    runAction(() => bulkApproveWorkdays({ ids }), {
      success: (result) => {
        const counts = describeCounts({ approved_count: 'zatwierdzono', skipped_count: 'pominięto' }, result);
        return counts ? `Masowa akceptacja: ${counts}.` : 'Brak zmian.';
      },
      failure: 'Nie udało się zatwierdzić zaznaczonych deklaracji.',
    });

  const approveSwap = (swap) =>
    runAction(() => approveSwapRequest(swap.id), {
      success: `Zatwierdzono zamianę zmiany z dnia ${swap.work_day_details?.date}.`,
      failure: 'Nie udało się zatwierdzić zamiany.',
    });

  const rejectSwap = (swap, reason) =>
    runAction(() => rejectSwapRequest(swap.id, reason ? { rejection_reason: reason } : {}), {
      success: `Odrzucono zamianę zmiany z dnia ${swap.work_day_details?.date}.`,
      failure: 'Nie udało się odrzucić zamiany.',
    });

  // --- Accounts ---

  const createAccount = (payload) =>
    runAction(() => createUser(payload), {
      success: payload.is_manager ? 'Dodano kierownika.' : 'Dodano pracownika.',
      failure: 'Nie udało się dodać użytkownika.',
      reload: reloadUsers,
    });

  const updateAccount = (user, patch) => {
    const isRate = 'hourly_rate' in patch;
    return runAction(
      async () => {
        const updated = await updateUserProfile(user.id, patch);
        setAllUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...updated } : u)));
        if (selectedEmployee?.id === user.id) {
          // A manager or inactive account has no schedule to edit.
          const keepsSchedule = !updated.is_manager && updated.is_active !== false;
          setSelectedEmployee(keepsSchedule ? { ...selectedEmployee, ...updated } : null);
        }
      },
      {
        success: isRate ? 'Stawka godzinowa zaktualizowana.' : 'Konto zaktualizowane.',
        failure: isRate ? 'Nie udało się zaktualizować stawki' : 'Nie udało się zaktualizować konta.',
        reload: null,
      },
    );
  };

  const removeAccount = (user, { permanent }) =>
    runAction(
      async () => {
        await deleteUser(user.id, { permanent });
        if (selectedEmployee?.id === user.id) setSelectedEmployee(null);
      },
      {
        success: permanent ? `Usunięto konto „${displayName(user)}".` : `Dezaktywowano konto „${displayName(user)}".`,
        failure: permanent ? 'Nie udało się usunąć konta.' : 'Nie udało się dezaktywować konta.',
        reload: reloadUsers,
      },
    );

  // --- Employee schedule editor ---

  const openSchedule = (employee) => {
    if (employee.id === selectedEmployee?.id) reloadEmployeeWorkdays();
    setSelectedEmployee(employee); // the editor is keyed by employee, so its drafts reset on switch
  };

  /** Saves the editor drafts ({ date: shift }) of the selected employee. */
  const saveSchedule = (drafts) =>
    runAction(
      () =>
        Promise.all(
          Object.entries(drafts).map(([date, draft]) =>
            saveDay(
              workdays.find((day) => day.date === date),
              buildWorkdayPayload({ ...draft, date, employee: selectedEmployee.id, note: draft.note || '' }),
            ),
          ),
        ),
      { success: 'Grafik pracownika zapisany.', failure: 'Błąd połączenia z serwerem.' },
    );

  /** Copies the previous week into this week, or the previous month into the stats month. */
  const copySchedule = (mode) => {
    const thisMonday = formatDateStr(getMonday());
    const targetStart = mode === 'week' ? thisMonday : `${statsMonth}-01`;
    const sourceStart = mode === 'week' ? addDays(thisMonday, -7) : shiftMonth(targetStart, -1);
    return runAction(
      () =>
        copyWorkdays({
          mode,
          source_start: sourceStart,
          target_start: targetStart,
          employee: selectedEmployee.id,
          on_conflict: 'skip',
        }),
      {
        success: (result) => {
          const counts = describeCounts(
            { created_count: 'dodano', skipped_count: 'pominięto', updated_count: 'zaktualizowano' },
            result,
          );
          return counts
            ? `Skopiowano poprzedni ${mode === 'week' ? 'tydzień' : 'miesiąc'}: ${counts}.`
            : `Brak dni do skopiowania z poprzedniego ${mode === 'week' ? 'tygodnia' : 'miesiąca'}.`;
        },
        failure: 'Nie udało się skopiować grafiku.',
      },
    );
  };

  // --- Settings ---

  const saveDeadline = (changes) =>
    runAction(
      async () => {
        const saved = await updateScheduleSettings(changes);
        setScheduleSettings(saved);
        return saved;
      },
      {
        success: (saved) =>
          saved.declaration_close_label
            ? `Okno deklaracji zamyka się w: ${saved.declaration_close_label} (co tydzień).`
            : 'Usunięto termin deklaracji — pracownicy mogą deklarować bez limitu.',
        failure: 'Nie udało się zapisać terminu deklaracji.',
        reload: null,
      },
    );

  const clearDeadline = () =>
    runAction(
      async () => setScheduleSettings(await updateScheduleSettings({ declaration_close_weekday: null, declaration_close_time: null })),
      { success: 'Usunięto termin deklaracji.', failure: 'Nie udało się usunąć terminu.', reload: null },
    );

  /** Creates a template, or updates it when `id` is given. */
  const saveTemplate = (payload, id) =>
    runAction(() => (id ? updateShiftTemplate(id, payload) : createShiftTemplate(payload)), {
      success: id ? `Zaktualizowano zmianę „${payload.name}".` : `Dodano zmianę „${payload.name}".`,
      failure: 'Nie udało się zapisać szablonu zmiany.',
      reload: reloadShiftTemplates,
    });

  const deleteTemplate = (template) =>
    runAction(() => deleteShiftTemplate(template.id), {
      success: `Usunięto zmianę „${template.name}".`,
      failure: 'Nie udało się usunąć szablonu.',
      reload: reloadShiftTemplates,
    });

  return (
    <div className={`${styles.managerPage} lsFields`}>
      <div className={styles.pageHeader}>
        <h1 className={styles.managerTitle}>Panel Kierownika</h1>
        {currentUser ? (
          <UserMenu
            user={{
              name: `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim(),
              email: currentUser.email,
              username: currentUser.username,
            }}
            isManager={currentUser.is_manager}
            darkMode={darkMode}
            onToggleTheme={toggleTheme}
            onLogout={Auth.logout}
            notificationCount={notifications.total || 0}
          />
        ) : null}
      </div>

      <ToastStack
        items={[
          ...visibleNotices.map(({ entry, key }) => ({
            key: `notice-${key}`,
            message: entry.message,
            variant: entry.type === 'shortage' ? 'error' : 'warning',
            onClose: () => dismissNotice(key),
          })),
          { key: 'error', message: error, variant: 'error', onClose: () => setError('') },
          { key: 'success', message: success, variant: 'success', onClose: () => setSuccess('') },
        ]}
      />

      <TeamStatsBar
        month={statsMonth}
        onMonthChange={setStatsMonth}
        onDownloadPayroll={downloadPayroll}
        stats={teamStats}
        employeeCount={employees.length}
        pendingCount={pendingQueue.length}
        swapCount={swapQueue.length}
      />

      <TeamWeekOverview
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        employees={employees}
        workdays={teamWorkdays}
        shiftTemplates={shiftTemplates}
      />

      <ScheduleHolesCard holes={scheduleHoles} days={holesDays} onDaysChange={setHolesDays} />

      <div className={styles.queuesRow}>
        <ApprovalQueue
          items={pendingQueue}
          employees={employees}
          taskTypes={taskTypes}
          rejectionReasons={rejectionReasons}
          onApprove={approveProposal}
          onReject={rejectProposal}
          onBulkApprove={bulkApproveProposals}
        />
        <SwapQueue swaps={swapQueue} rejectionReasons={rejectionReasons} onApprove={approveSwap} onReject={rejectSwap} />
      </div>

      <div className={styles.managerBody}>
        <div className={styles.leftCol}>
          <AccountsCard
            users={allUsers}
            currentUserId={currentUser?.id}
            onCreate={createAccount}
            onUpdate={updateAccount}
            onRemove={removeAccount}
            onOpenSchedule={openSchedule}
            onError={setError}
          />
        </div>

        <div className={styles.rightCol}>
          <div className={`${styles.sectionCard} ${styles.detailCard}`}>
            <h3>Szczegóły pracownika</h3>
            {!selectedEmployee ? (
              <p className={styles.emptyQueue}>
                Wybierz pracownika z listy kont (przycisk Grafik), aby zarządzać jego zmianami.
              </p>
            ) : (
              <EmployeeScheduleEditor
                key={selectedEmployee.id}
                employee={selectedEmployee}
                workdays={workdays}
                shiftTemplates={shiftTemplates}
                taskTypes={taskTypes}
                coverageWorkdays={coverageWorkdays}
                copyMonth={statsMonth}
                onMonthChange={setCoverageMonth}
                onSave={saveSchedule}
                onCopy={copySchedule}
                onSuccess={notifySuccess}
                onError={setError}
              />
            )}
          </div>
        </div>
      </div>

      <ScheduleSettingsCard
        settings={scheduleSettings}
        onSaveDeadline={saveDeadline}
        onClearDeadline={clearDeadline}
        templates={shiftTemplates}
        onSaveTemplate={saveTemplate}
        onDeleteTemplate={deleteTemplate}
        onError={setError}
      />
    </div>
  );
};

export default Manager;
