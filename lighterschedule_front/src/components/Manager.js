import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { updateScheduleSettings } from '../api/scheduleSettings';
import { createShiftTemplate, deleteShiftTemplate, updateShiftTemplate } from '../api/shiftTemplates';
import { downloadPayrollPdf } from '../api/stats';
import { approveSwap as approveSwapRequest, rejectSwap as rejectSwapRequest } from '../api/swaps';
import { createTaskType, deleteTaskType, updateTaskType } from '../api/taskTypes';
import { createUser, deleteUser, updateUserProfile } from '../api/users';
import {
  approveWorkday,
  bulkApproveWorkdays,
  copyWorkdays,
  rejectWorkday,
  saveWorkdaysBatch,
} from '../api/workdays';
import { useMessages } from '../hooks/useMessages';
import { useDismissibleList } from '../hooks/useDismissibleList';
import { useManagerData } from '../hooks/useManagerData';
import { useTheme } from '../hooks/useTheme';
import { addDays, formatDateStr, getMonday, shiftMonth } from '../utils/dates';
import { formatMonthYearPl } from '../utils/locale';
import { displayName } from '../utils/people';
import { buildWorkdayPayload } from '../utils/time';


const NOTICE_TIMEOUT_MS = 7000;

// Notice after an on/off setting is saved: [when turned on, when turned off].
const SETTING_TOGGLE_MESSAGES = {
  notify_hour_changes: ['Komunikat w panelu o zmianie godzin włączony.', 'Komunikat w panelu o zmianie godzin wyłączony.'],
  email_hour_changes: ['E-mail o zmianie godzin włączony.', 'E-mail o zmianie godzin wyłączony.'],
  team_schedule_visible: ['Pracownicy widzą teraz grafik zespołu.', 'Grafik zespołu jest ukryty przed pracownikami.'],
};

const currentMonthValue = () => formatDateStr(new Date()).slice(0, 7);

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
 * Manager panel: loads the organization's data, runs the actions of every section
 * and lays the sections out. Sections own their UI state; this component owns data and messages.
 */
const Manager = () => {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  // Whether the schedule editor holds unsaved drafts; read only on click, so a ref (no re-render).
  const editorDirtyRef = useRef(false);
  const setEditorDirty = useCallback((dirty) => {
    editorDirtyRef.current = dirty;
  }, []);
  const [statsMonth, setStatsMonth] = useState(currentMonthValue);
  const [coverageMonth, setCoverageMonth] = useState(currentCalendarMonth);
  const [weekStart, setWeekStart] = useState(() => formatDateStr(getMonday()));
  const [holesDays, setHolesDays] = useState(7);
  const [currentUser, setCurrentUser] = useState(null);
  const { error, success, setError, setSuccess, notifySuccess, runAction: run } = useMessages();
  const { darkMode, toggleTheme } = useTheme();

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
    NOTICE_TIMEOUT_MS,
  );

  useEffect(() => {
    Auth.fetchCurrentUser()
      .then(setCurrentUser)
      .catch(() => Auth.logout());
  }, []);

  /** Runs a server action (see useMessages); by default reloads everything afterwards. */
  const runAction = (action, options) => run(action, { after: refreshData, ...options });

  // --- Team stats ---

  const downloadPayroll = () =>
    runAction(() => downloadPayrollPdf(statsMonth), {
      success: `Pobrano raport PDF za ${formatMonthYearPl(statsMonth)}.`,
      failure: 'Nie udało się pobrać raportu PDF.',
      after: null,
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
      after: reloadUsers,
    });

  const updateAccount = (user, patch) => {
    const isRate = 'hourly_rate' in patch;
    return runAction(
      async () => {
        const updated = await updateUserProfile(user.id, patch);
        setAllUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...updated } : u)));
        if (selectedEmployee?.id === user.id) {
          // Only an inactive account has no schedule to edit (managers have one too).
          const keepsSchedule = updated.is_active !== false;
          setSelectedEmployee(keepsSchedule ? { ...selectedEmployee, ...updated } : null);
        }
      },
      {
        success: isRate ? 'Stawka godzinowa zaktualizowana.' : 'Konto zaktualizowane.',
        failure: isRate ? 'Nie udało się zaktualizować stawki' : 'Nie udało się zaktualizować konta.',
        after: null,
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
        after: reloadUsers,
      },
    );

  // --- Employee schedule editor ---

  const openSchedule = (employee) => {
    if (employee.id === selectedEmployee?.id) {
      reloadEmployeeWorkdays(); // same editor stays mounted, so its drafts are kept
      return;
    }
    // The editor is keyed by employee: switching drops the drafts of the previous one.
    // Drafts exist only while the editor is open, so selectedEmployee is set here.
    if (editorDirtyRef.current) {
      const question = `Masz niezapisane zmiany w grafiku: ${displayName(selectedEmployee)}. `
        + 'Przełączyć na innego pracownika i je odrzucić?';
      if (!window.confirm(question)) return;
    }
    setSelectedEmployee(employee);
  };

  /** Saves the editor drafts ({ date: shift }) of the selected employee. */
  const saveSchedule = (drafts) =>
    // One request, all or nothing. Manager edits always end up approved: the server approves
    // a pending proposal with these hours and replaces a rejected day with a new entry.
    runAction(
      () =>
        saveWorkdaysBatch(
          Object.entries(drafts).map(([date, draft]) =>
            buildWorkdayPayload({ ...draft, date, employee: selectedEmployee.id, note: draft.note || '' }),
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
        after: null,
      },
    );

  /** `change` is a single on/off setting, e.g. { email_hour_changes: false }, saved on click. */
  const saveSettingToggle = (change) => {
    const [[field, enabled]] = Object.entries(change);
    return runAction(
      async () => setScheduleSettings(await updateScheduleSettings(change)),
      {
        success: SETTING_TOGGLE_MESSAGES[field][enabled ? 0 : 1],
        failure: 'Nie udało się zapisać ustawienia.',
        after: null,
      },
    );
  };

  const clearDeadline = () =>
    runAction(
      async () => setScheduleSettings(await updateScheduleSettings({ declaration_close_weekday: null, declaration_close_time: null })),
      { success: 'Usunięto termin deklaracji.', failure: 'Nie udało się usunąć terminu.', after: null },
    );

  /** Creates a template, or updates it when `id` is given. */
  const saveTemplate = (payload, id) =>
    runAction(() => (id ? updateShiftTemplate(id, payload) : createShiftTemplate(payload)), {
      success: id ? `Zaktualizowano zmianę „${payload.name}".` : `Dodano zmianę „${payload.name}".`,
      failure: 'Nie udało się zapisać szablonu zmiany.',
      after: reloadShiftTemplates,
    });

  const deleteTemplate = (template) =>
    runAction(() => deleteShiftTemplate(template.id), {
      success: `Usunięto zmianę „${template.name}".`,
      failure: 'Nie udało się usunąć szablonu.',
      after: reloadShiftTemplates,
    });

  // Renaming or deleting a role changes `role_name` on saved shifts, so these reload everything.
  const saveTaskType = (payload, id) =>
    runAction(() => (id ? updateTaskType(id, payload) : createTaskType(payload)), {
      success: id ? `Zmieniono nazwę stanowiska na „${payload.name}".` : `Dodano stanowisko „${payload.name}".`,
      failure: 'Nie udało się zapisać stanowiska.',
    });

  const removeTaskType = (taskType) =>
    runAction(() => deleteTaskType(taskType.id), {
      success: `Usunięto stanowisko „${taskType.name}".`,
      failure: 'Nie udało się usunąć stanowiska.',
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
                Wybierz osobę z listy kont (przycisk Grafik), aby zarządzać jej zmianami. Swoje zmiany dodasz
                przyciskiem „Mój grafik”.
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
                onDirtyChange={setEditorDirty}
              />
            )}
          </div>
        </div>
      </div>

      <ScheduleSettingsCard
        settings={scheduleSettings}
        onSaveDeadline={saveDeadline}
        onClearDeadline={clearDeadline}
        onSaveToggle={saveSettingToggle}
        templates={shiftTemplates}
        onSaveTemplate={saveTemplate}
        onDeleteTemplate={deleteTemplate}
        taskTypes={taskTypes}
        onSaveTaskType={saveTaskType}
        onDeleteTaskType={removeTaskType}
        onError={setError}
      />
    </div>
  );
};

export default Manager;
