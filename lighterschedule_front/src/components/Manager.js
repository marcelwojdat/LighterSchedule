import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Auth from './Auth';
import UserMenu from './UserMenu';
import TeamStatsBar from './manager/TeamStatsBar';
import CoverageLegend from './manager/CoverageLegend';
import TeamWeekOverview from './manager/TeamWeekOverview';
import ScheduleHolesCard from './manager/ScheduleHolesCard';
import AccountsCard from './manager/AccountsCard';
import { WORKDAY_STATUS_LABELS } from '../constants/statusLabels';
import ApprovalQueue from './manager/ApprovalQueue';
import RoleSelect from './manager/RoleSelect';
import SwapQueue from './manager/SwapQueue';
import styles from './Manager.module.css';
import { getErrorMessage } from '../api/client';
import { getUsers, createUser, updateUserProfile, deleteUser } from '../api/users';
import {
  getWorkdays,
  createWorkday,
  updateWorkday,
  deleteWorkday,
  approveWorkday,
  bulkApproveWorkdays,
  rejectWorkday,
  copyWorkdays,
} from '../api/workdays';
import { getSwaps, approveSwap as approveSwapRequest, rejectSwap as rejectSwapRequest } from '../api/swaps';
import { getTaskTypes } from '../api/taskTypes';
import {
  getShiftTemplates,
  createShiftTemplate,
  updateShiftTemplate,
  deleteShiftTemplate,
} from '../api/shiftTemplates';
import { downloadPayrollPdf, getTeamStats } from '../api/stats';
import { getNotifications } from '../api/notifications';
import { getScheduleSettings, updateScheduleSettings } from '../api/scheduleSettings';
import {
  getRejectionReasons,
} from '../api/rejectionReasons';
import { getScheduleHoles } from '../api/scheduleHoles';
import { useApiResource } from '../hooks/useApiResource';
import { useTheme } from '../hooks/useTheme';
import { useAutoDismiss } from '../hooks/useAutoDismiss';
import { useDismissibleList } from '../hooks/useDismissibleList';
import ToastStack from './ToastStack';
import {
  buildWorkdayPayload,
  toApiTime,
  toDisplayTime,
  resolveTemplateHours,
  WEEKDAY_SHORT,
  buildEmptyTemplateHours,
} from '../utils/time';
import { getDayShiftCoverage, monthBounds } from '../utils/shiftCoverage';
import { formatDateStr, getMonday, getWeekDates, addDays, shiftMonth } from '../utils/dates';
import { formatMonthYearPl } from '../utils/locale';

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const Manager = () => {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [statsMonth, setStatsMonth] = useState(currentMonthValue);
  const [coverageMonth, setCoverageMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [templateForm, setTemplateForm] = useState({
    id: null,
    name: '',
    is_active: true,
    max_slots: 1,
    hours: buildEmptyTemplateHours(),
  });
  const [weekStart, setWeekStart] = useState(() => formatDateStr(getMonday()));
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [timeFrom, setTimeFrom] = useState('12:00');
  const [timeTo, setTimeTo] = useState('20:00');
  const [selectedDates, setSelectedDates] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [dayNote, setDayNote] = useState('');
  const [showShiftTemplates, setShowShiftTemplates] = useState(false);
  const [declarationCloseWeekday, setDeclarationCloseWeekday] = useState('');
  const [declarationCloseTime, setDeclarationCloseTime] = useState('23:59');
  const [copyBusy, setCopyBusy] = useState(false);
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

  // The deadline form is editable, so it mirrors the loaded settings instead of rendering them directly.
  useEffect(() => {
    if (!scheduleSettings) return;
    const weekday = scheduleSettings.declaration_close_weekday;
    setDeclarationCloseWeekday(weekday === null || weekday === undefined ? '' : String(weekday));
    setDeclarationCloseTime(
      scheduleSettings.declaration_close_time ? String(scheduleSettings.declaration_close_time).slice(0, 5) : '23:59'
    );
  }, [scheduleSettings]);

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

  const resetTemplateForm = () => {
    setTemplateForm({
      id: null,
      name: '',
      is_active: true,
      max_slots: 1,
      hours: buildEmptyTemplateHours(),
    });
  };

  const handleSaveDeclarationDeadline = async (e) => {
    e.preventDefault();
    try {
      const weekday =
        declarationCloseWeekday === '' ? null : Number(declarationCloseWeekday);
      const data = await updateScheduleSettings({
        declaration_close_weekday: weekday,
        declaration_close_time: weekday === null ? null : `${declarationCloseTime || '23:59'}:00`,
      });
      setScheduleSettings(data);
      setSuccess(
        data.declaration_close_label
          ? `Okno deklaracji zamyka się w: ${data.declaration_close_label} (co tydzień).`
          : 'Usunięto termin deklaracji — pracownicy mogą deklarować bez limitu.'
      );
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się zapisać terminu deklaracji.'));
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
    setSelectedEmployee(employee);
    setSelectedDates({});
    setSelectedDate('');
  };

  const setChosenDate = (e) => {
    const year = e.getFullYear();
    const month = String(e.getMonth() + 1).padStart(2, '0');
    const day = String(e.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    setSelectedDate(dateStr);

    const existing = workdays.find((d) => d.date === dateStr);
    const pending = selectedDates[dateStr];

    if (pending) {
      setTimeFrom(pending.start_time.slice(0, 5));
      setTimeTo(pending.end_time.slice(0, 5));
      setSelectedRoleId(pending.role ? String(pending.role) : '');
      setDayNote(pending.note || '');
      setSelectedShiftId(pending.shift_template ? String(pending.shift_template) : '');
    } else if (existing) {
      setTimeFrom(existing.start_time.slice(0, 5));
      setTimeTo(existing.end_time.slice(0, 5));
      setSelectedRoleId(existing.role ? String(existing.role) : '');
      setDayNote(existing.note || '');
      setSelectedShiftId(existing.shift_template ? String(existing.shift_template) : '');
    } else {
      setTimeFrom('12:00');
      setTimeTo('20:00');
      setSelectedRoleId('');
      setDayNote('');
      setSelectedShiftId('');
    }
  };

  const getTileClassName = ({ date: tileDate, view }) => {
    if (view !== 'month') return null;

    const dateStr = formatDateStr(tileDate);
    const classes = [];

    if (selectedDates[dateStr]) {
      classes.push('custom-selected-day');
    } else {
      const saved = workdays.find((d) => d.date === dateStr);
      if (saved) {
        if (saved.status === 'approved') {
          classes.push(saved.note?.trim() ? 'custom-approved-note-day' : 'custom-approved-day');
        } else if (saved.status === 'rejected') {
          classes.push('custom-rejected-day');
        } else {
          classes.push('custom-proposed-day');
        }
      }
    }

    const coverage = getCoverageForDate(dateStr);
    if (coverage.status === 'closed') classes.push('day-coverage-closed');
    else if (coverage.status === 'open') classes.push('day-coverage-open');
    else classes.push('day-coverage-none');

    return classes.length ? classes.join(' ') : null;
  };

  const getTileContent = ({ date: tileDate, view }) => {
    if (view !== 'month') return null;

    const dateStr = formatDateStr(tileDate);
    const coverage = getCoverageForDate(dateStr);
    const pending = selectedDates[dateStr];
    const saved = workdays.find((d) => d.date === dateStr);

    let body = null;
    if (pending) {
      body = (
        <>
          <div className={styles.tileHours}>
            {pending.start_time.slice(0, 5)} - {pending.end_time.slice(0, 5)}
          </div>
          <div className={styles.tileStatus}>Do zapisu</div>
          {pending.note?.trim() ? <div className={styles.tileStatus}>nota</div> : null}
        </>
      );
    } else if (saved) {
      body = (
        <>
          <div className={styles.tileHours}>
            {saved.start_time.slice(0, 5)} - {saved.end_time.slice(0, 5)}
          </div>
          {saved.role_name ? <div className={styles.tileStatus}>{saved.role_name}</div> : null}
          <div className={styles.tileStatus}>{WORKDAY_STATUS_LABELS[saved.status]}</div>
          {saved.note?.trim() ? <div className={styles.tileStatus}>nota</div> : null}
        </>
      );
    }

    if (!body && coverage.status === 'none') return null;

    return (
      <div className={styles.tileContent} title={coverage.tooltip || undefined}>
        {coverage.status !== 'none' ? (
          <span
            className={`${styles.coverageMark} ${
              coverage.status === 'closed' ? styles.coverageClosed : styles.coverageOpen
            }`}
            aria-hidden="true"
          />
        ) : null}
        {body}
      </div>
    );
  };

  const addShift = () => {
    if (!selectedEmployee || !selectedDate) return;

    let start = toApiTime(timeFrom);
    let end = toApiTime(timeTo);
    if (selectedShiftId) {
      const template = shiftTemplates.find((t) => String(t.id) === String(selectedShiftId));
      const hours = resolveTemplateHours(template, selectedDate);
      if (!hours) {
        setError('Wybrana zmiana nie ma godzin na ten dzień tygodnia.');
        return;
      }
      start = toApiTime(hours.start_time);
      end = toApiTime(hours.end_time);
    }

    setSelectedDates({
      ...selectedDates,
      [selectedDate]: {
        start_time: start,
        end_time: end,
        role: selectedRoleId ? Number(selectedRoleId) : null,
        note: dayNote.trim(),
        shift_template: selectedShiftId ? Number(selectedShiftId) : null,
      },
    });
    setSuccess('Zmiana dodana do zapisu.');
    setError('');
  };

  const saveShifts = async () => {
    if (!selectedEmployee || Object.keys(selectedDates).length === 0) return;

    try {
      const results = await Promise.all(
        Object.entries(selectedDates).map(async ([date, times]) => {
          const existing = workdays.find((d) => d.date === date);
          const payload = buildWorkdayPayload({
            date,
            start_time: times.start_time,
            end_time: times.end_time,
            role: times.role,
            employee: selectedEmployee.id,
            note: times.note || '',
            shift_template: times.shift_template,
          });

          if (existing?.status === 'proposed') {
            await approveWorkday(existing.id, payload);
            return true;
          }

          if (existing?.status === 'rejected') {
            await deleteWorkday(existing.id);
          }

          if (existing?.status === 'approved') {
            await updateWorkday(existing.id, payload);
            return true;
          }

          const response = await createWorkday(payload);
          return response.status === 201;
        })
      );

      if (results.every(Boolean)) {
        setSelectedDates({});
        setSelectedDate('');
        setSuccess('Grafik pracownika zapisany.');
        setError('');
        await refreshData();
      } else {
        setError('Część zapisów nie powiodła się.');
      }
    } catch (e) {
      setError(getErrorMessage(e, 'Błąd połączenia z serwerem.'));
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

  const startEditTemplate = (template) => {
    const hours = buildEmptyTemplateHours().map((row) => {
      const match = template.hours.find((h) => Number(h.weekday) === row.weekday);
      if (!match) return row;
      return {
        weekday: row.weekday,
        enabled: true,
        start: toDisplayTime(match.start_time),
        end: toDisplayTime(match.end_time),
      };
    });
    setTemplateForm({
      id: template.id,
      name: template.name,
      is_active: template.is_active !== false,
      max_slots: template.max_slots ?? 1,
      hours,
    });
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!templateForm.name.trim()) {
      setError('Podaj nazwę zmiany (np. Poranna).');
      return;
    }
    const hours = templateForm.hours
      .filter((row) => row.enabled)
      .map((row) => ({
        weekday: row.weekday,
        start_time: toApiTime(row.start),
        end_time: toApiTime(row.end),
      }));
    if (hours.length === 0) {
      setError('Włącz godziny przynajmniej dla jednego dnia tygodnia.');
      return;
    }

    const maxSlots = Number(templateForm.max_slots);
    if (!Number.isInteger(maxSlots) || maxSlots < 1) {
      setError('Max. osób na zmianę musi być liczbą całkowitą ≥ 1.');
      return;
    }

    const payload = {
      name: templateForm.name.trim(),
      is_active: templateForm.is_active,
      max_slots: maxSlots,
      hours,
    };

    try {
      if (templateForm.id) {
        await updateShiftTemplate(templateForm.id, payload);
        setSuccess(`Zaktualizowano zmianę „${payload.name}".`);
      } else {
        await createShiftTemplate(payload);
        setSuccess(`Dodano zmianę „${payload.name}".`);
      }
      setError('');
      resetTemplateForm();
      await reloadShiftTemplates();
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się zapisać szablonu zmiany.'));
    }
  };

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Usunąć zmianę „${template.name}"?`)) return;
    try {
      await deleteShiftTemplate(template.id);
      setSuccess(`Usunięto zmianę „${template.name}".`);
      setError('');
      if (templateForm.id === template.id) resetTemplateForm();
      await reloadShiftTemplates();
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się usunąć szablonu.'));
    }
  };

  const applySelectedTemplate = (templateId) => {
    setSelectedShiftId(templateId);
    if (!templateId || !selectedDate) return;
    const template = shiftTemplates.find((t) => String(t.id) === String(templateId));
    const hours = resolveTemplateHours(template, selectedDate);
    if (hours) {
      setTimeFrom(toDisplayTime(hours.start_time));
      setTimeTo(toDisplayTime(hours.end_time));
    }
  };

  const templatesForSelectedDate = selectedDate
    ? shiftTemplates.filter((t) => resolveTemplateHours(t, selectedDate))
    : [];

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

  const getCoverageForDate = (dateStr) => getDayShiftCoverage(dateStr, shiftTemplates, coverageWorkdays);

  const handleCopySchedule = async (mode) => {
    if (!selectedEmployee) return;
    const thisMonday = formatDateStr(getMonday());
    const targetStart = mode === 'week' ? thisMonday : `${statsMonth}-01`;
    const sourceStart = mode === 'week' ? addDays(thisMonday, -7) : shiftMonth(targetStart, -1);
    const periodLabel = mode === 'week' ? 'tygodnia' : 'miesiąca';

    if (
      !window.confirm(
        `Skopiować grafik ${selectedEmployee.first_name || selectedEmployee.username} z poprzedniego ${periodLabel}? Istniejące dni zostaną pominięte; nowe wpisy będą od razu zatwierdzone.`
      )
    ) {
      return;
    }

    setCopyBusy(true);
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
      setSuccess(
        parts.length
          ? `Skopiowano poprzedni ${mode === 'week' ? 'tydzień' : 'miesiąc'}: ${parts.join(', ')}.`
          : `Brak dni do skopiowania z poprzedniego ${periodLabel}.`
      );
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się skopiować grafiku.'));
    } finally {
      setCopyBusy(false);
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
              <>
                <div className={styles.empHeader}>
                  {selectedEmployee.first_name} {selectedEmployee.last_name}
                </div>
                <div className={styles.empInfo}>
                  <strong>E-mail:</strong> {selectedEmployee.email || '—'}
                </div>
                <div className={styles.empInfo}>
                  <strong>Stawka:</strong> {selectedEmployee.hourly_rate ?? '—'} zł/h
                </div>

                <div className={styles.calendarContainer}>
                  <Calendar
                    locale="pl-PL"
                    onChange={setChosenDate}
                    value={null}
                    tileClassName={getTileClassName}
                    tileContent={getTileContent}
                    onActiveStartDateChange={({ activeStartDate }) => {
                      if (!activeStartDate) return;
                      setCoverageMonth({
                        year: activeStartDate.getFullYear(),
                        month: activeStartDate.getMonth(),
                      });
                    }}
                  />
                </div>
                <CoverageLegend />
                <div className={styles.statusLegend}>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.legendProposed}`} />
                    Oczekuje
                  </div>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.legendApproved}`} />
                    Zatwierdzony
                  </div>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.legendApprovedNote}`} />
                    Z notatką
                  </div>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.legendRejected}`} />
                    Odrzucony
                  </div>
                  <div className={styles.legendItem}>
                    <span className={`${styles.legendDot} ${styles.legendSelected}`} />
                    Do zapisu
                  </div>
                </div>

                <div className={styles.copyScheduleRow}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    disabled={copyBusy}
                    onClick={() => handleCopySchedule('week')}
                  >
                    Kopiuj poprzedni tydzień
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    disabled={copyBusy}
                    onClick={() => handleCopySchedule('month')}
                    title={`Na miesiąc ${formatMonthYearPl(statsMonth)}`}
                  >
                    Kopiuj poprzedni miesiąc
                  </button>
                </div>

                <div className={styles.shiftControls}>
                  <div>Wybrany dzień: {selectedDate || '—'}</div>
                  <select
                    className={styles.roleSelect}
                    value={selectedShiftId}
                    onChange={(e) => applySelectedTemplate(e.target.value)}
                    disabled={!selectedDate}
                  >
                    <option value="">Szablon zmiany (opcjonalnie)</option>
                    {templatesForSelectedDate.map((template) => {
                      const hours = resolveTemplateHours(template, selectedDate);
                      return (
                        <option key={template.id} value={template.id}>
                          {template.name}
                          {hours
                            ? ` (${toDisplayTime(hours.start_time)}-${toDisplayTime(hours.end_time)})`
                            : ''}
                        </option>
                      );
                    })}
                  </select>
                  <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
                  <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
                  <RoleSelect taskTypes={taskTypes} value={selectedRoleId} onChange={setSelectedRoleId} />
                  <textarea
                    className={styles.noteInput}
                    rows={2}
                    maxLength={500}
                    placeholder="Notatka (opcjonalnie)"
                    value={dayNote}
                    onChange={(e) => setDayNote(e.target.value)}
                  />
                  <button className={styles.btnPrimary} onClick={addShift}>
                    Dodaj zmianę
                  </button>
                  <button className={styles.btnPrimary} onClick={saveShifts}>
                    Zapisz zmiany
                  </button>
                </div>

                <div className={styles.scheduleSection}>
                  <h4>Aktualny grafik</h4>
                  {workdays.length === 0 ? (
                    <p className={styles.emptyQueue}>Brak wpisów w grafiku.</p>
                  ) : (
                    <ul className={styles.scheduleList}>
                      {workdays.map((w) => (
                        <li
                          key={w.id}
                          className={`${styles.scheduleItem} ${
                            w.status === 'approved' && w.note?.trim() ? styles.scheduleItemWithNote : ''
                          }`}
                        >
                          <span>
                            {w.date} — {w.start_time.slice(0, 5)} - {w.end_time.slice(0, 5)}
                            {w.role_name ? ` (${w.role_name})` : ''}
                            {w.note?.trim() ? (
                              <small className={styles.scheduleNote}> — {w.note}</small>
                            ) : null}
                          </span>
                          <span
                            className={`${styles.statusBadge} ${
                              w.status === 'approved'
                                ? w.note?.trim()
                                  ? styles.statusApprovedNote
                                  : styles.statusApproved
                                : w.status === 'rejected'
                                  ? styles.statusRejected
                                  : styles.statusProposed
                            }`}
                          >
                            {WORKDAY_STATUS_LABELS[w.status]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <section className={styles.settingsSection}>
        <div className={styles.sectionCard}>
          <div className={styles.settingsToggleRow}>
            <h3>Ustawienia</h3>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setShowShiftTemplates((prev) => !prev)}
              aria-expanded={showShiftTemplates}
            >
              {showShiftTemplates ? 'Ukryj szablony zmian' : 'Szablony zmian'}
            </button>
          </div>

          <form className={styles.deadlineForm} onSubmit={handleSaveDeclarationDeadline}>
            <div>
              <label htmlFor="declaration-close-weekday" className={styles.deadlineLabel}>
                Zamknięcie deklaracji (co tydzień)
              </label>
              <p className={styles.statHint}>
                Po wybranym dniu i godzinie pracownicy nie składają deklaracji do kolejnego
                poniedziałku — tylko kierownik może zmieniać grafik.
              </p>
            </div>
            <div className={styles.deadlineControls}>
              <select
                id="declaration-close-weekday"
                value={declarationCloseWeekday}
                onChange={(e) => setDeclarationCloseWeekday(e.target.value)}
                aria-label="Dzień tygodnia zamknięcia"
              >
                <option value="">Bez limitu</option>
                <option value="0">Poniedziałek</option>
                <option value="1">Wtorek</option>
                <option value="2">Środa</option>
                <option value="3">Czwartek</option>
                <option value="4">Piątek</option>
                <option value="5">Sobota</option>
                <option value="6">Niedziela</option>
              </select>
              <input
                id="declaration-close-time"
                type="time"
                value={declarationCloseTime}
                onChange={(e) => setDeclarationCloseTime(e.target.value || '23:59')}
                disabled={declarationCloseWeekday === ''}
                aria-label="Godzina zamknięcia"
              />
              <button type="submit" className={styles.btnPrimary}>
                Zapisz termin
              </button>
              {declarationCloseWeekday !== '' ? (
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={async () => {
                    setDeclarationCloseWeekday('');
                    setDeclarationCloseTime('23:59');
                    try {
                      await updateScheduleSettings({
                        declaration_close_weekday: null,
                        declaration_close_time: null,
                      });
                      setSuccess('Usunięto termin deklaracji.');
                      setError('');
                    } catch (err) {
                      setError(getErrorMessage(err, 'Nie udało się usunąć terminu.'));
                    }
                  }}
                >
                  Wyczyść
                </button>
              ) : null}
            </div>
          </form>

          {showShiftTemplates ? (
            <div className={styles.shiftTemplatesPanel}>
              <p className={styles.statHint}>
                Zdefiniuj zmiany (np. Poranna, Późniejsza) z godzinami na wybrane dni tygodnia.
                Pracownicy wybierają tylko nazwę zmiany — bez wpisywania godzin.
              </p>
              <form className={styles.userCreateForm} onSubmit={handleSaveTemplate}>
                <input
                  type="text"
                  placeholder="Nazwa zmiany (np. Poranna)"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
                <label className="checkboxRow">
                  <input
                    type="checkbox"
                    checked={templateForm.is_active}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  Aktywna (widoczna dla pracowników)
                </label>
                <label className={styles.maxSlotsRow}>
                  <span className={styles.maxSlotsLabel}>Max. osób na zmianę</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={styles.maxSlotsInput}
                    value={templateForm.max_slots}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({ ...prev, max_slots: e.target.value }))
                    }
                    required
                  />
                </label>
                <div className={styles.templateHoursGrid}>
                  {templateForm.hours.map((row) => (
                    <div key={row.weekday} className={styles.templateHourRow}>
                      <label className="checkboxRow">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={(e) => {
                            const enabled = e.target.checked;
                            setTemplateForm((prev) => ({
                              ...prev,
                              hours: prev.hours.map((h) =>
                                h.weekday === row.weekday ? { ...h, enabled } : h
                              ),
                            }));
                          }}
                        />
                        {WEEKDAY_SHORT[row.weekday]}
                      </label>
                      <input
                        type="time"
                        disabled={!row.enabled}
                        value={row.start}
                        onChange={(e) => {
                          const start = e.target.value;
                          setTemplateForm((prev) => ({
                            ...prev,
                            hours: prev.hours.map((h) =>
                              h.weekday === row.weekday ? { ...h, start } : h
                            ),
                          }));
                        }}
                      />
                      <input
                        type="time"
                        disabled={!row.enabled}
                        value={row.end}
                        onChange={(e) => {
                          const end = e.target.value;
                          setTemplateForm((prev) => ({
                            ...prev,
                            hours: prev.hours.map((h) =>
                              h.weekday === row.weekday ? { ...h, end } : h
                            ),
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className={styles.queueActions}>
                  <button type="submit" className={styles.btnPrimary}>
                    {templateForm.id ? 'Zapisz zmiany szablonu' : 'Dodaj szablon'}
                  </button>
                  {templateForm.id ? (
                    <button type="button" className={styles.btnSecondary} onClick={resetTemplateForm}>
                      Anuluj edycję
                    </button>
                  ) : null}
                </div>
              </form>

              {shiftTemplates.length === 0 ? (
                <p className={styles.emptyQueue}>Brak szablonów — dodaj pierwszą zmianę powyżej.</p>
              ) : (
                <ul className={styles.templateList}>
                  {shiftTemplates.map((template) => (
                    <li key={template.id} className={styles.templateListItem}>
                      <div>
                        <strong>{template.name}</strong>
                        {!template.is_active ? <span className={styles.inactiveTag}> nieaktywna</span> : null}
                        <span className={styles.inactiveTag}>
                          {' '}· max {template.max_slots ?? 1}{' '}
                          {(template.max_slots ?? 1) === 1 ? 'osoba' : 'osób'}
                        </span>
                        <div className={styles.templateHoursSummary}>
                          {template.hours
                            .map((h) => `${WEEKDAY_SHORT[h.weekday]} ${toDisplayTime(h.start_time)}-${toDisplayTime(h.end_time)}`)
                            .join(' · ')}
                        </div>
                      </div>
                      <div className={styles.queueActions}>
                        <button type="button" className={styles.btnSecondary} onClick={() => startEditTemplate(template)}>
                          Edytuj
                        </button>
                        <button type="button" className={styles.btnDanger} onClick={() => handleDeleteTemplate(template)}>
                          Usuń
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </section>

      
    </div>
  );
};

export default Manager;
