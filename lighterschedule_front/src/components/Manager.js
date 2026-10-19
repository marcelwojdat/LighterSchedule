import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Auth from './Auth';
import ToastStack from './ToastStack';
import UserMenu from './UserMenu';
import AccountsCard from './manager/AccountsCard';
import ApprovalQueue from './manager/ApprovalQueue';
import EmployeeScheduleEditor from './manager/EmployeeScheduleEditor';
import ScheduleHolesCard from './manager/ScheduleHolesCard';
import SwapQueue from './manager/SwapQueue';
import ScheduleSettingsCard from './manager/ScheduleSettingsCard';
import TeamStatsBar from './manager/TeamStatsBar';
import TeamWeekOverview from './manager/TeamWeekOverview';
import styles from './Manager.module.css';
import { getErrorMessage } from '../api/client';
import { getNotifications } from '../api/notifications';
import { getRejectionReasons } from '../api/rejectionReasons';
import { getScheduleHoles } from '../api/scheduleHoles';
import { getScheduleSettings, updateScheduleSettings } from '../api/scheduleSettings';
import { createShiftTemplate, deleteShiftTemplate, getShiftTemplates, updateShiftTemplate } from '../api/shiftTemplates';
import { downloadPayrollPdf, getTeamStats } from '../api/stats';
import { approveSwap as approveSwapRequest, getSwaps, rejectSwap as rejectSwapRequest } from '../api/swaps';
import { getTaskTypes } from '../api/taskTypes';
import { createUser, deleteUser, getUsers, updateUserProfile } from '../api/users';
import {
  approveWorkday,
  bulkApproveWorkdays,
  copyWorkdays,
  createWorkday,
  deleteWorkday,
  getWorkdays,
  rejectWorkday,
  updateWorkday,
} from '../api/workdays';
import { useApiResource } from '../hooks/useApiResource';
import { useAutoDismiss } from '../hooks/useAutoDismiss';
import { useDismissibleList } from '../hooks/useDismissibleList';
import { useTheme } from '../hooks/useTheme';
import { addDays, formatDateStr, getMonday, getWeekDates, shiftMonth } from '../utils/dates';
import { formatMonthYearPl } from '../utils/locale';
import { monthBounds } from '../utils/shiftCoverage';
import { buildWorkdayPayload } from '../utils/time';

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

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

const Manager = () => {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [statsMonth, setStatsMonth] = useState(currentMonthValue);
  const [coverageMonth, setCoverageMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [weekStart, setWeekStart] = useState(() => formatDateStr(getMonday()));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [holesDays, setHolesDays] = useState(7);
  const { darkMode, toggleTheme } = useTheme();
  useAutoDismiss(success, setSuccess, 7000);
  useAutoDismiss(error, setError, 7000);

  // --- Server data (each resource reloads itself when its params change) ---

  const weekDates = getWeekDates(weekStart);
  const coverageRange = monthBounds(coverageMonth.year, coverageMonth.month);

  const { data: allUsers, setData: setAllUsers, reload: reloadUsers } = useApiResource(getUsers, undefined, {
    initial: [], errorMessage: 'Nie udało się pobrać listy pracowników', onError: setError,
  });
  const { data: proposals, reload: reloadPendingQueue } = useApiResource(getWorkdays, { status: 'proposed' }, {
    initial: [], errorMessage: 'Nie udało się pobrać kolejki akceptacji', onError: setError,
  });
  const { data: swapQueue, reload: reloadSwapQueue } = useApiResource(getSwaps, { pending_manager: 'true' }, {
    initial: [], errorMessage: 'Nie udało się pobrać zamian do zatwierdzenia', onError: setError,
  });
  const { data: teamStats, reload: reloadTeamStats } = useApiResource(getTeamStats, statsMonth, {
    initial: null, errorMessage: 'Nie udało się pobrać statystyk zespołu', onError: setError,
  });
  const { data: teamWorkdays, reload: reloadTeamWorkdays } = useApiResource(
    getWorkdays,
    { status: 'approved', date_from: weekStart, date_to: weekDates[6] },
    { initial: [], errorMessage: 'Nie udało się pobrać grafiku zespołu', onError: setError },
  );
  const { data: coverageWorkdays, reload: reloadCoverage } = useApiResource(
    getWorkdays,
    { status: 'approved', date_from: coverageRange.dateFrom, date_to: coverageRange.dateTo },
    { initial: [], errorMessage: 'Nie udało się pobrać obsadzenia zmian', onError: setError },
  );
  const { data: workdays, reload: reloadEmployeeWorkdays } = useApiResource(
    getWorkdays,
    { employee: selectedEmployee?.id },
    {
      initial: [],
      enabled: Boolean(selectedEmployee),
      errorMessage: 'Nie udało się pobrać grafiku pracownika',
      onError: setError,
    },
  );
  const { data: taskTypes, reload: reloadTaskTypes } = useApiResource(getTaskTypes, undefined, {
    initial: [], errorMessage: 'Nie udało się pobrać stanowisk', onError: setError,
  });
  const { data: shiftTemplates, reload: reloadShiftTemplates } = useApiResource(getShiftTemplates, undefined, {
    initial: [], errorMessage: 'Nie udało się pobrać szablonów zmian', onError: setError,
  });
  const {
    data: scheduleSettings,
    setData: setScheduleSettings,
    reload: reloadScheduleSettings,
  } = useApiResource(getScheduleSettings, undefined, {
    initial: null, errorMessage: 'Nie udało się pobrać ustawień grafiku', onError: setError,
  });
  const { data: rejectionReasons, reload: reloadRejectionReasons } = useApiResource(
    getRejectionReasons,
    { active: '1' },
    { initial: [] },
  );
  const { data: scheduleHoles, reload: reloadScheduleHoles } = useApiResource(
    getScheduleHoles,
    { days: holesDays },
    { initial: { count: 0, items: [] } },
  );
  const { data: notifications, reload: reloadNotifications } = useApiResource(getNotifications, undefined, {
    initial: { total: 0, items: [] },
  });

  const employees = useMemo(
    () => allUsers.filter((user) => !user.is_manager && user.is_active !== false),
    [allUsers],
  );
  const pendingQueue = useMemo(
    () => [...proposals].sort((a, b) => a.date.localeCompare(b.date)),
    [proposals],
  );

  /** Reload everything an approval or schedule change can affect. */
  const refreshData = () =>
    Promise.all([
      reloadUsers(),
      reloadPendingQueue(),
      reloadSwapQueue(),
      reloadTeamStats(),
      reloadTeamWorkdays(),
      reloadCoverage(),
      reloadTaskTypes(),
      reloadShiftTemplates(),
      reloadScheduleSettings(),
      reloadRejectionReasons(),
      reloadScheduleHoles(),
      reloadNotifications(),
      selectedEmployee ? reloadEmployeeWorkdays() : null,
    ]);

  useEffect(() => {
    Auth.fetchCurrentUser()
      .then(setCurrentUser)
      .catch(() => Auth.logout());
  }, []);

  const notificationKey = useCallback(
    (item, index) =>
      `${item.type}|${item.shift_template_id || ''}|${item.date || ''}|${item.message || ''}|${index}`,
    [],
  );
  const { visible: visibleNotices, dismiss: dismissNotice } = useDismissibleList(
    notifications.items,
    notificationKey,
    7000,
  );

  const saveDeadline = async (changes) => {
    try {
      const data = await updateScheduleSettings(changes);
      setScheduleSettings(data);
      notifySuccess(
        data.declaration_close_label
          ? `Okno deklaracji zamyka się w: ${data.declaration_close_label} (co tydzień).`
          : 'Usunięto termin deklaracji — pracownicy mogą deklarować bez limitu.'
      );
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się zapisać terminu deklaracji.'));
    }
  };

  const clearDeadline = async () => {
    try {
      setScheduleSettings(await updateScheduleSettings({ declaration_close_weekday: null, declaration_close_time: null }));
      notifySuccess('Usunięto termin deklaracji.');
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się usunąć terminu.'));
    }
  };

  const handlePayrollDownload = async () => {
    try {
      await downloadPayrollPdf(statsMonth);
      setSuccess(`Pobrano raport PDF za ${formatMonthYearPl(statsMonth)}.`);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać raportu PDF.'));
    }
  };

  const openManage = (employee) => {
    if (employee.id === selectedEmployee?.id) reloadEmployeeWorkdays();
    setSelectedEmployee(employee); // the editor is keyed by employee, so its drafts reset on switch
  };

  const notifySuccess = (message) => {
    setSuccess(message);
    setError('');
  };

  /** Saves the editor drafts ({ date: shift }) of the selected employee; resolves to true on success. */
  const saveSchedule = async (drafts) => {
    try {
      await Promise.all(
        Object.entries(drafts).map(([date, draft]) =>
          saveDay(
            workdays.find((day) => day.date === date),
            buildWorkdayPayload({ ...draft, date, employee: selectedEmployee.id, note: draft.note || '' }),
          ),
        ),
      );
      notifySuccess('Grafik pracownika zapisany.');
      await refreshData();
      return true;
    } catch (e) {
      setError(getErrorMessage(e, 'Błąd połączenia z serwerem.'));
      return false;
    }
  };

  const updateAccount = async (user, patch) => {
    const isRate = 'hourly_rate' in patch;
    try {
      const updated = await updateUserProfile(user.id, patch);
      setAllUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...updated } : u)));
      if (selectedEmployee?.id === user.id) {
        // A manager or inactive account has no schedule to edit.
        setSelectedEmployee(updated.is_manager || updated.is_active === false ? null : { ...selectedEmployee, ...updated });
      }
      setSuccess(isRate ? 'Stawka godzinowa zaktualizowana.' : 'Konto zaktualizowane.');
      setError('');
    } catch (e) {
      setError(getErrorMessage(e, isRate ? 'Nie udało się zaktualizować stawki' : 'Nie udało się zaktualizować konta.'));
    }
  };

  /** Resolves to true on success, so the accounts card knows whether to close its form. */
  const createAccount = async (payload) => {
    try {
      await createUser(payload);
      setSuccess(payload.is_manager ? 'Dodano kierownika.' : 'Dodano pracownika.');
      setError('');
      await reloadUsers();
      return true;
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się dodać użytkownika.'));
      return false;
    }
  };

  const removeAccount = async (user, { permanent }) => {
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    try {
      await deleteUser(user.id, { permanent });
      setSuccess(permanent ? `Usunięto konto „${name}".` : `Dezaktywowano konto „${name}".`);
      setError('');
      if (selectedEmployee?.id === user.id) setSelectedEmployee(null);
      await reloadUsers();
    } catch (e) {
      setError(getErrorMessage(e, permanent ? 'Nie udało się usunąć konta.' : 'Nie udało się dezaktywować konta.'));
    }
  };

  /** Creates a template, or updates it when `id` is given; resolves to true on success. */
  const saveTemplate = async (payload, id) => {
    try {
      if (id) {
        await updateShiftTemplate(id, payload);
        notifySuccess(`Zaktualizowano zmianę „${payload.name}".`);
      } else {
        await createShiftTemplate(payload);
        notifySuccess(`Dodano zmianę „${payload.name}".`);
      }
      await reloadShiftTemplates();
      return true;
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się zapisać szablonu zmiany.'));
      return false;
    }
  };

  const deleteTemplate = async (template) => {
    try {
      await deleteShiftTemplate(template.id);
      notifySuccess(`Usunięto zmianę „${template.name}".`);
      await reloadShiftTemplates();
      return true;
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się usunąć szablonu.'));
      return false;
    }
  };

  // Queue callbacks resolve to true on success, so the queue knows whether to close its form.
  const approveProposal = async (item, changes) => {
    try {
      await approveWorkday(item.id, changes);
      setSuccess(`Zatwierdzono grafik ${item.employee_name} na ${item.date}.`);
      setError('');
      await refreshData();
      return true;
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się zatwierdzić deklaracji.'));
      return false;
    }
  };

  const rejectProposal = async (item, reason) => {
    try {
      await rejectWorkday(item.id, reason ? { rejection_reason: reason } : {});
      setSuccess(`Odrzucono deklarację ${item.employee_name} na ${item.date}.`);
      setError('');
      await refreshData();
      return true;
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się odrzucić deklaracji.'));
      return false;
    }
  };

  const bulkApproveProposals = async (ids) => {
    try {
      const result = await bulkApproveWorkdays({ ids });
      const parts = [];
      if (result.approved_count) parts.push(`zatwierdzono ${result.approved_count}`);
      if (result.skipped_count) parts.push(`pominięto ${result.skipped_count}`);
      setSuccess(parts.length ? `Masowa akceptacja: ${parts.join(', ')}.` : 'Brak zmian.');
      setError('');
      await refreshData();
      return true;
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się zatwierdzić zaznaczonych deklaracji.'));
      return false;
    }
  };

  const approveSwap = async (swap) => {
    try {
      await approveSwapRequest(swap.id);
      setSuccess(`Zatwierdzono zamianę zmiany z dnia ${swap.work_day_details?.date}.`);
      setError('');
      await refreshData();
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się zatwierdzić zamiany.'));
    }
  };

  /** Resolves to true on success, so the queue knows whether to close its form. */
  const rejectSwap = async (swap, reason) => {
    try {
      await rejectSwapRequest(swap.id, reason ? { rejection_reason: reason } : {});
      setSuccess(`Odrzucono zamianę zmiany z dnia ${swap.work_day_details?.date}.`);
      setError('');
      await refreshData();
      return true;
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się odrzucić zamiany.'));
      return false;
    }
  };

  const handleLogout = () => {
    Auth.logout();
  };

  /** Copy the previous week into this week, or the previous month into the stats month. */
  const copySchedule = async (mode) => {
    const thisMonday = formatDateStr(getMonday());
    const targetStart = mode === 'week' ? thisMonday : `${statsMonth}-01`;
    const sourceStart = mode === 'week' ? addDays(thisMonday, -7) : shiftMonth(targetStart, -1);
    try {
      const result = await copyWorkdays({
        mode,
        source_start: sourceStart,
        target_start: targetStart,
        employee: selectedEmployee.id,
        on_conflict: 'skip',
      });
      await refreshData();
      const parts = [];
      if (result.created_count) parts.push(`dodano ${result.created_count}`);
      if (result.skipped_count) parts.push(`pominięto ${result.skipped_count}`);
      if (result.updated_count) parts.push(`zaktualizowano ${result.updated_count}`);
      notifySuccess(
        parts.length
          ? `Skopiowano poprzedni ${mode === 'week' ? 'tydzień' : 'miesiąc'}: ${parts.join(', ')}.`
          : `Brak dni do skopiowania z poprzedniego ${mode === 'week' ? 'tygodnia' : 'miesiąca'}.`
      );
      return true;
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się skopiować grafiku.'));
      return false;
    }
  };

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
            onLogout={handleLogout}
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
        onDownloadPayroll={handlePayrollDownload}
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

        <SwapQueue
          swaps={swapQueue}
          rejectionReasons={rejectionReasons}
          onApprove={approveSwap}
          onReject={rejectSwap}
        />
      </div>

      <div className={styles.managerBody}>
        <div className={styles.leftCol}>
          <AccountsCard
            users={allUsers}
            currentUserId={currentUser?.id}
            onCreate={createAccount}
            onUpdate={updateAccount}
            onRemove={removeAccount}
            onOpenSchedule={openManage}
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
