import React, { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Auth from './Auth';
import UserMenu from './UserMenu';
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
  createRejectionReason,
  deleteRejectionReason,
} from '../api/rejectionReasons';
import { getScheduleHoles } from '../api/scheduleHoles';
import { useTheme } from '../hooks/useTheme';
import { useAutoDismiss } from '../hooks/useAutoDismiss';
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

const STATUS_LABELS = {
  proposed: 'Oczekuje',
  approved: 'Zatwierdzony',
  rejected: 'Odrzucony',
};

const SWAP_STATUS_LABELS = {
  pending_target: 'Oczekuje na kolegę',
  pending_manager: 'Oczekuje na kierownika',
  approved: 'Zatwierdzona',
  rejected: 'Odrzucona',
};

const DAY_LABELS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'];

const EMPTY_USER_FORM = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  is_manager: false,
  hourly_rate: '20',
};

const USERS_PREVIEW_COUNT = 5;

const Manager = () => {
  const [employees, setEmployees] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [statsMonth, setStatsMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [workdays, setWorkdays] = useState([]);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [swapQueue, setSwapQueue] = useState([]);
  const [teamStats, setTeamStats] = useState(null);
  const [teamWorkdays, setTeamWorkdays] = useState([]);
  const [coverageWorkdays, setCoverageWorkdays] = useState([]);
  const [coverageMonth, setCoverageMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [taskTypes, setTaskTypes] = useState([]);
  const [shiftTemplates, setShiftTemplates] = useState([]);
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
  const [queueEditRole, setQueueEditRole] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [timeFrom, setTimeFrom] = useState('12:00');
  const [timeTo, setTimeTo] = useState('20:00');
  const [selectedDates, setSelectedDates] = useState({});
  const [editingQueueId, setEditingQueueId] = useState(null);
  const [queueEditTimes, setQueueEditTimes] = useState({ start: '12:00', end: '20:00' });
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectingSwapId, setRejectingSwapId] = useState(null);
  const [showRejectNote, setShowRejectNote] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [notifications, setNotifications] = useState({ total: 0, items: [] });
  const [dayNote, setDayNote] = useState('');
  const [showShiftTemplates, setShowShiftTemplates] = useState(false);
  const [declarationDeadline, setDeclarationDeadline] = useState('');
  const [rejectionReasons, setRejectionReasons] = useState([]);
  const [newRejectionReason, setNewRejectionReason] = useState('');
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [moreOptionsUserId, setMoreOptionsUserId] = useState(null);
  const [newUserForm, setNewUserForm] = useState(() => ({ ...EMPTY_USER_FORM }));
  const [copyBusy, setCopyBusy] = useState(false);
  const [holesDays, setHolesDays] = useState(7);
  const [scheduleHoles, setScheduleHoles] = useState({ count: 0, items: [] });
  const [selectedApproveIds, setSelectedApproveIds] = useState([]);
  const [bulkApproveBusy, setBulkApproveBusy] = useState(false);
  const { darkMode, toggleTheme } = useTheme();
  useAutoDismiss(success, setSuccess);
  useAutoDismiss(error, setError);

  const weekDates = getWeekDates(weekStart);

  const resetTemplateForm = () => {
    setTemplateForm({
      id: null,
      name: '',
      is_active: true,
      max_slots: 1,
      hours: buildEmptyTemplateHours(),
    });
  };

  const fetchShiftTemplates = async () => {
    try {
      const data = await getShiftTemplates();
      setShiftTemplates(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać szablonów zmian'));
    }
  };

  const fetchRejectionReasons = async () => {
    try {
      const data = await getRejectionReasons({ active: '1' });
      setRejectionReasons(Array.isArray(data) ? data : []);
    } catch {
      setRejectionReasons([]);
    }
  };

  const fetchScheduleHoles = async (days = holesDays) => {
    try {
      const data = await getScheduleHoles({ days });
      setScheduleHoles(data);
    } catch {
      setScheduleHoles({ count: 0, items: [] });
    }
  };

  const fetchScheduleSettings = async () => {
    try {
      const data = await getScheduleSettings();
      setDeclarationDeadline(data.declaration_deadline || '');
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać ustawień grafiku'));
    }
  };

  const handleSaveDeclarationDeadline = async (e) => {
    e.preventDefault();
    try {
      const data = await updateScheduleSettings({
        declaration_deadline: declarationDeadline || null,
      });
      setDeclarationDeadline(data.declaration_deadline || '');
      setSuccess(
        data.declaration_deadline
          ? `Termin deklaracji ustawiony na ${data.declaration_deadline}.`
          : 'Usunięto termin deklaracji — pracownicy mogą deklarować bez limitu.'
      );
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się zapisać terminu deklaracji.'));
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await getUsers();
      setAllUsers(data);
      setEmployees(data.filter((emp) => !emp.is_manager && emp.is_active !== false));
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać listy pracowników'));
    }
  };

  const fetchPendingQueue = async () => {
    try {
      const data = await getWorkdays({ status: 'proposed' });
      const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
      setPendingQueue(sorted);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać kolejki akceptacji'));
    }
  };

  const fetchTeamStats = async () => {
    try {
      const data = await getTeamStats(statsMonth);
      setTeamStats(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać statystyk zespołu'));
    }
  };

  const fetchTeamWorkdays = async () => {
    try {
      const weekEnd = weekDates[6];
      const data = await getWorkdays({
        status: 'approved',
        date_from: weekStart,
        date_to: weekEnd,
      });
      setTeamWorkdays(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać grafiku zespołu'));
    }
  };

  const fetchMonthCoverage = async (month = coverageMonth) => {
    try {
      const { dateFrom, dateTo } = monthBounds(month.year, month.month);
      const data = await getWorkdays({
        status: 'approved',
        date_from: dateFrom,
        date_to: dateTo,
      });
      setCoverageWorkdays(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać obsadzenia zmian'));
    }
  };

  const fetchTaskTypes = async () => {
    try {
      const data = await getTaskTypes();
      setTaskTypes(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać stanowisk'));
    }
  };

  const fetchSwapQueue = async () => {
    try {
      const data = await getSwaps({ pending_manager: 'true' });
      setSwapQueue(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać zamian do zatwierdzenia'));
    }
  };

  const fetchWorkdaysForEmployee = async (employeeId) => {
    try {
      const data = await getWorkdays({ employee: employeeId });
      setWorkdays(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać grafiku pracownika'));
    }
  };

  const fetchNotifications = async () => {
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch {
      setNotifications({ total: 0, items: [] });
    }
  };

  const refreshData = async (employeeId = selectedEmployee?.id) => {
    await Promise.all([
      fetchEmployees(),
      fetchPendingQueue(),
      fetchSwapQueue(),
      fetchTeamStats(),
      fetchTeamWorkdays(),
      fetchMonthCoverage(),
      fetchTaskTypes(),
      fetchShiftTemplates(),
      fetchScheduleSettings(),
      fetchRejectionReasons(),
      fetchScheduleHoles(),
      fetchNotifications(),
      employeeId ? fetchWorkdaysForEmployee(employeeId) : Promise.resolve(),
    ]);
  };

  useEffect(() => {
    refreshData();
    Auth.fetchCurrentUser()
      .then(setCurrentUser)
      .catch(() => Auth.logout());
  }, []);

  const handlePayrollDownload = async () => {
    try {
      await downloadPayrollPdf(statsMonth);
      setSuccess(`Pobrano raport PDF za ${statsMonth}.`);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się pobrać raportu PDF.'));
    }
  };

  useEffect(() => {
    fetchTeamStats();
  }, [statsMonth]);

  useEffect(() => {
    fetchTeamWorkdays();
  }, [weekStart]);

  useEffect(() => {
    fetchMonthCoverage(coverageMonth);
  }, [coverageMonth.year, coverageMonth.month]);

  useEffect(() => {
    fetchScheduleHoles(holesDays);
  }, [holesDays]);

  useEffect(() => {
    const validIds = new Set(
      pendingQueue
        .filter((item) => !item.shift_slots?.is_full)
        .map((item) => item.id)
    );
    setSelectedApproveIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [pendingQueue]);

  const openManage = (employee) => {
    setSelectedEmployee(employee);
    setSelectedDates({});
    setSelectedDate('');
    fetchWorkdaysForEmployee(employee.id);
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
          <div className={styles.tileStatus}>{STATUS_LABELS[saved.status]}</div>
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
        await refreshData(selectedEmployee.id);
      } else {
        setError('Część zapisów nie powiodła się.');
      }
    } catch (e) {
      setError(getErrorMessage(e, 'Błąd połączenia z serwerem.'));
    }
  };

  const updateRate = async (employeeId, value) => {
    if (value === '' || Number.isNaN(Number(value))) return;

    try {
      const updated = await updateUserProfile(employeeId, { hourly_rate: value });
      setAllUsers((prev) =>
        prev.map((emp) => (emp.id === employeeId ? { ...emp, hourly_rate: updated.hourly_rate } : emp))
      );
      setEmployees((prev) =>
        prev.map((emp) => (emp.id === employeeId ? { ...emp, hourly_rate: updated.hourly_rate } : emp))
      );
      if (selectedEmployee?.id === employeeId) {
        setSelectedEmployee((prev) => ({ ...prev, hourly_rate: updated.hourly_rate }));
      }
      setSuccess('Stawka godzinowa zaktualizowana.');
      setError('');
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się zaktualizować stawki'));
    }
  };

  const updateUserFlags = async (userId, patch) => {
    try {
      const updated = await updateUserProfile(userId, patch);
      setAllUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      setEmployees((prev) => {
        const next = prev.filter((u) => u.id !== userId || (!updated.is_manager && updated.is_active !== false));
        if (!updated.is_manager && updated.is_active !== false && !next.some((u) => u.id === userId)) {
          return [...next, updated];
        }
        return next.map((u) => (u.id === userId ? { ...u, ...updated } : u)).filter((u) => !u.is_manager);
      });
      if (selectedEmployee?.id === userId) {
        if (updated.is_manager || updated.is_active === false) {
          setSelectedEmployee(null);
        } else {
          setSelectedEmployee((prev) => ({ ...prev, ...updated }));
        }
      }
      setSuccess('Konto zaktualizowane.');
      setError('');
      await fetchEmployees();
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się zaktualizować konta.'));
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const { username, first_name, last_name, email, password, is_manager, hourly_rate } = newUserForm;
    if (!username.trim() || !first_name.trim() || !last_name.trim() || !email.trim() || !password) {
      setError('Uzupełnij wszystkie pola formularza nowej osoby.');
      return;
    }
    if (password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków.');
      return;
    }

    try {
      await createUser({
        username: username.trim(),
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.trim(),
        password,
        is_manager,
        hourly_rate: hourly_rate === '' ? 0 : Number(hourly_rate),
      });
      setNewUserForm({ ...EMPTY_USER_FORM });
      setShowAddUserForm(false);
      setSuccess(is_manager ? 'Dodano kierownika.' : 'Dodano pracownika.');
      setError('');
      await fetchEmployees();
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się dodać użytkownika.'));
    }
  };

  const cancelAddUserForm = () => {
    setShowAddUserForm(false);
    setNewUserForm({ ...EMPTY_USER_FORM });
    setError('');
  };

  const deactivateUserAccount = async (user) => {
    if (user.id === currentUser?.id) {
      setError('Nie możesz dezaktywować własnego konta.');
      return;
    }
    const label = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    if (!window.confirm(`Dezaktywować konto „${label}"? Osoba nie będzie mogła się logować, historia grafiku zostanie.`)) {
      return;
    }
    try {
      await deleteUser(user.id);
      setSuccess(`Dezaktywowano konto „${label}".`);
      setError('');
      if (selectedEmployee?.id === user.id) {
        setSelectedEmployee(null);
      }
      await fetchEmployees();
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się dezaktywować konta.'));
    }
  };

  const permanentlyDeleteUser = async (user) => {
    if (user.id === currentUser?.id) {
      setError('Nie możesz usunąć własnego konta.');
      return;
    }
    const label = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    if (
      !window.confirm(
        `Trwale usunąć konto „${label}"?\n\nTo możliwe tylko bez historii grafiku/zamian. W przeciwnym razie użyj dezaktywacji.`
      )
    ) {
      return;
    }
    try {
      await deleteUser(user.id, { permanent: true });
      setSuccess(`Usunięto konto „${label}".`);
      setError('');
      if (selectedEmployee?.id === user.id) {
        setSelectedEmployee(null);
      }
      await fetchEmployees();
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się usunąć konta.'));
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
      await fetchShiftTemplates();
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
      await fetchShiftTemplates();
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

  const startQueueEdit = (item) => {
    setEditingQueueId(item.id);
    setQueueEditTimes({
      start: item.start_time.slice(0, 5),
      end: item.end_time.slice(0, 5),
    });
    setQueueEditRole(item.role ? String(item.role) : '');
    setRejectingId(null);
    setRejectingSwapId(null);
    setShowRejectNote(false);
    setRejectionReason('');
    setError('');
  };

  const beginRejectWorkday = (item) => {
    setRejectingId(item.id);
    setRejectingSwapId(null);
    setEditingQueueId(null);
    setShowRejectNote(false);
    setRejectionReason('');
  };

  const beginRejectSwap = (swap) => {
    setRejectingSwapId(swap.id);
    setRejectingId(null);
    setEditingQueueId(null);
    setShowRejectNote(false);
    setRejectionReason('');
  };

  const cancelQueueEdit = () => {
    setEditingQueueId(null);
    setRejectingId(null);
    setRejectingSwapId(null);
    setShowRejectNote(false);
    setRejectionReason('');
    setQueueEditRole('');
  };

  const approvableQueueItems = pendingQueue.filter((item) => !item.shift_slots?.is_full);

  const toggleApproveSelection = (itemId) => {
    setSelectedApproveIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const selectAllApprovable = () => {
    setSelectedApproveIds(approvableQueueItems.map((item) => item.id));
  };

  const clearApproveSelection = () => setSelectedApproveIds([]);

  const runBulkApprove = async (ids) => {
    if (!ids.length) {
      setError('Nie wybrano żadnych deklaracji do zatwierdzenia.');
      return;
    }
    if (!window.confirm(`Zatwierdzić ${ids.length} deklaracji bez zmian godzin?`)) {
      return;
    }
    setBulkApproveBusy(true);
    try {
      const result = await bulkApproveWorkdays({ ids });
      const parts = [];
      if (result.approved_count) parts.push(`zatwierdzono ${result.approved_count}`);
      if (result.skipped_count) parts.push(`pominięto ${result.skipped_count}`);
      setSuccess(parts.length ? `Masowa akceptacja: ${parts.join(', ')}.` : 'Brak zmian.');
      setError('');
      setSelectedApproveIds([]);
      cancelQueueEdit();
      await refreshData(selectedEmployee?.id);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się zatwierdzić zaznaczonych deklaracji.'));
    } finally {
      setBulkApproveBusy(false);
    }
  };

  const approveQueueItem = async (item, times = null) => {
    const startTime = toApiTime(times?.start_time || queueEditTimes.start);
    const endTime = toApiTime(times?.end_time || queueEditTimes.end);
    const role = editingQueueId === item.id
      ? (queueEditRole ? Number(queueEditRole) : null)
      : (item.role || null);

    try {
      await approveWorkday(item.id, {
        start_time: startTime,
        end_time: endTime,
        role,
      });

      setSuccess(`Zatwierdzono grafik ${item.employee_name} na ${item.date}.`);
      setError('');
      cancelQueueEdit();
      await refreshData(selectedEmployee?.id);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się zatwierdzić deklaracji.'));
    }
  };

  const pickRejectionReason = (text) => {
    setShowRejectNote(true);
    setRejectionReason(text);
  };

  const handleAddRejectionReason = async (event) => {
    event.preventDefault();
    const text = newRejectionReason.trim();
    if (!text) return;
    try {
      await createRejectionReason({ text });
      setNewRejectionReason('');
      await fetchRejectionReasons();
      setSuccess('Dodano szablon uwagi.');
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się dodać szablonu.'));
    }
  };

  const handleDeleteRejectionReason = async (reason) => {
    if (!window.confirm(`Usunąć szablon „${reason.text}”?`)) return;
    try {
      await deleteRejectionReason(reason.id);
      await fetchRejectionReasons();
      setSuccess('Usunięto szablon uwagi.');
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się usunąć szablonu.'));
    }
  };

  const renderRejectionReasonPicker = () => (
    <div className={styles.rejectReasonBlock}>
      {rejectionReasons.length ? (
        <div className={styles.reasonChips} role="list" aria-label="Szablony uwag">
          {rejectionReasons.map((reason) => (
            <button
              key={reason.id}
              type="button"
              role="listitem"
              className={`${styles.reasonChip}${
                rejectionReason === reason.text ? ` ${styles.reasonChipActive}` : ''
              }`}
              onClick={() => pickRejectionReason(reason.text)}
            >
              {reason.text}
            </button>
          ))}
        </div>
      ) : null}
      {showRejectNote ? (
        <input
          className={styles.rejectionInput}
          type="text"
          placeholder="Uwaga dla pracownika (opcjonalnie)"
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          maxLength={255}
        />
      ) : null}
    </div>
  );

  const rejectQueueItem = async (item) => {
    try {
      const reason = rejectionReason.trim();
      await rejectWorkday(item.id, reason ? { rejection_reason: reason } : {});

      setSuccess(`Odrzucono deklarację ${item.employee_name} na ${item.date}.`);
      setError('');
      cancelQueueEdit();
      await refreshData(selectedEmployee?.id);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się odrzucić deklaracji.'));
    }
  };

  const approveSwap = async (swap) => {
    try {
      await approveSwapRequest(swap.id);
      setSuccess(`Zatwierdzono zamianę zmiany z dnia ${swap.work_day_details?.date}.`);
      setError('');
      setRejectingSwapId(null);
      setShowRejectNote(false);
      setRejectionReason('');
      await refreshData(selectedEmployee?.id);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się zatwierdzić zamiany.'));
    }
  };

  const rejectSwap = async (swap) => {
    try {
      const reason = rejectionReason.trim();
      await rejectSwapRequest(swap.id, reason ? { rejection_reason: reason } : {});
      setSuccess(`Odrzucono zamianę zmiany z dnia ${swap.work_day_details?.date}.`);
      setError('');
      cancelQueueEdit();
      await refreshData(selectedEmployee?.id);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się odrzucić zamiany.'));
    }
  };

  const handleLogout = () => {
    Auth.logout();
  };

  const getEmployeeName = (item) => {
    const emp = employees.find((e) => e.id === item.employee);
    if (emp) return `${emp.first_name} ${emp.last_name}`.trim() || emp.username;
    return item.employee_name;
  };

  const getEmployeeDisplayName = (employee) =>
    `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.username;

  const getShiftsForCell = (employeeId, dateStr) =>
    teamWorkdays.filter((day) => day.employee === employeeId && day.date === dateStr);

  const getCoverageForDate = (dateStr, approvedSource = coverageWorkdays) =>
    getDayShiftCoverage(dateStr, shiftTemplates, approvedSource);

  const coverageClass = (status, closedCls, openCls, noneCls) => {
    if (status === 'closed') return closedCls;
    if (status === 'open') return openCls;
    return noneCls;
  };

  const renderCoverageLegend = (extraClass = '') => (
    <div className={`${styles.coverageLegend} ${extraClass}`.trim()}>
      <div className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles.legendCoverageClosed}`} />
        Dzień zamknięty (pełne obsadzenie)
      </div>
      <div className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles.legendCoverageOpen}`} />
        Dzień otwarty (brakuje osób)
      </div>
      <div className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles.legendCoverageNone}`} />
        Brak szablonów na ten dzień
      </div>
    </div>
  );

  const coverageSlotSummary = (coverage) => {
    if (!coverage?.slots?.length) return '';
    const filled = coverage.slots.reduce((sum, slot) => sum + slot.filled, 0);
    const max = coverage.slots.reduce((sum, slot) => sum + slot.max, 0);
    return `${filled}/${max}`;
  };

  const changeWeek = (offset) => {
    setWeekStart(addDays(weekStart, offset * 7));
  };

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
      await refreshData(selectedEmployee.id);
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

  const renderRoleSelect = (value, onChange) => (
    <select value={value} onChange={onChange} className={styles.roleSelect}>
      <option value="">Stanowisko</option>
      {taskTypes.map((type) => (
        <option key={type.id} value={type.id}>
          {type.name}
        </option>
      ))}
    </select>
  );

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

      {error ? <div className={styles.errorBox}>{error}</div> : null}
      {success ? <div className={styles.successBox}>{success}</div> : null}
      {notifications.items?.length ? (
        <div className={styles.notificationsBanner}>
          {notifications.items.map((item, index) => (
            <div
              key={`${item.type}-${item.shift_template_id || item.date || index}`}
              className={`${styles.notificationItem}${
                item.type === 'shortage' ? ` ${styles.notificationShortage}` : ''
              }`}
            >
              {item.message}
            </div>
          ))}
        </div>
      ) : null}

      <section className={styles.statsBar}>
        <div className={styles.statsBarHeader}>
          <div>
            <h3>Statystyki zespołu</h3>
            <p className={styles.statHint}>
              Zatwierdzone wpisy w wybranym miesiącu — cały zespół.
            </p>
          </div>
          <div className={styles.statsBarActions}>
            <label htmlFor="manager-stats-month">Miesiąc</label>
            <input
              id="manager-stats-month"
              type="month"
              value={statsMonth}
              onChange={(e) => setStatsMonth(e.target.value)}
            />
            <button type="button" className={styles.btnPrimary} onClick={handlePayrollDownload}>
              Raport PDF
            </button>
          </div>
        </div>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Pracownicy</span>
            <strong>{teamStats?.employee_count ?? employees.length}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Oczekujące deklaracje</span>
            <strong>{pendingQueue.length}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Zamiany do zatwierdzenia</span>
            <strong>{swapQueue.length}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Godziny</span>
            <strong>{(teamStats?.total_hours ?? 0).toFixed(2)}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Wypłaty</span>
            <strong>{(teamStats?.total_earnings ?? 0).toFixed(2)} zł</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Zatwierdzone dni</span>
            <strong>{teamStats?.approved_days ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className={styles.holesSection}>
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Dziury w grafiku</h3>
              <p className={styles.statHint}>
                Wolne miejsca na aktywnych zmianach
                {scheduleHoles.date_from && scheduleHoles.date_to
                  ? ` · ${scheduleHoles.date_from} – ${scheduleHoles.date_to}`
                  : ''}
              </p>
            </div>
            <div className={styles.holesControls}>
              <div className={styles.holesToggle}>
                <button
                  type="button"
                  className={`${styles.btnSecondary}${holesDays === 7 ? ` ${styles.holesToggleActive}` : ''}`}
                  onClick={() => setHolesDays(7)}
                >
                  7 dni
                </button>
                <button
                  type="button"
                  className={`${styles.btnSecondary}${holesDays === 14 ? ` ${styles.holesToggleActive}` : ''}`}
                  onClick={() => setHolesDays(14)}
                >
                  14 dni
                </button>
              </div>
              <span className={styles.queueBadge}>{scheduleHoles.count ?? 0}</span>
            </div>
          </div>
          {!scheduleHoles.items?.length ? (
            <p className={styles.emptyQueue}>Brak dziur — wszystkie zaplanowane zmiany są obsadzone.</p>
          ) : (
            <ul className={styles.holesList}>
              {scheduleHoles.items.map((hole) => (
                <li
                  key={`${hole.date}-${hole.shift_template_id}`}
                  className={styles.holesItem}
                >
                  <div className={styles.holesItemMain}>
                    <strong>{hole.date}</strong>
                    <span className={styles.holesShiftName}>{hole.shift_template_name}</span>
                    <span className={styles.holesHours}>
                      {hole.start_time?.slice(0, 5)} – {hole.end_time?.slice(0, 5)}
                    </span>
                  </div>
                  <div className={styles.holesItemMeta}>
                    <span className={styles.holesNeeded}>
                      brakuje {hole.needed} / {hole.max_slots}
                    </span>
                    <small>
                      Obsada: {hole.filled}
                      {hole.holders?.length
                        ? ` · ${hole.holders.map((h) => h.name).join(', ')}`
                        : ' · nikt'}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className={styles.queuesRow}>
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h3>Do akceptacji</h3>
            <span className={styles.queueBadge}>{pendingQueue.length}</span>
          </div>
          {pendingQueue.length === 0 ? (
            <p className={styles.emptyQueue}>Brak deklaracji oczekujących na akceptację.</p>
          ) : (
            <div className={styles.queueList}>
              {approvableQueueItems.length > 0 ? (
                <div className={styles.bulkApproveBar}>
                  <div className={styles.bulkApproveActions}>
                    <button
                      type="button"
                      className={styles.btnLink}
                      onClick={selectAllApprovable}
                      disabled={bulkApproveBusy}
                    >
                      Zaznacz dostępne ({approvableQueueItems.length})
                    </button>
                    {selectedApproveIds.length ? (
                      <button
                        type="button"
                        className={styles.btnLink}
                        onClick={clearApproveSelection}
                        disabled={bulkApproveBusy}
                      >
                        Odznacz
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={styles.btnSuccess}
                    disabled={bulkApproveBusy || selectedApproveIds.length === 0}
                    onClick={() => runBulkApprove(selectedApproveIds)}
                  >
                    {bulkApproveBusy
                      ? 'Zatwierdzanie…'
                      : `Zatwierdź zaznaczone (${selectedApproveIds.length})`}
                  </button>
                </div>
              ) : null}
              {pendingQueue.map((item) => (
                <div key={item.id} className={styles.queueItem}>
                  <div className={styles.queueItemHeader}>
                    <label className={styles.queueSelectLabel}>
                      <input
                        type="checkbox"
                        checked={selectedApproveIds.includes(item.id)}
                        disabled={Boolean(item.shift_slots?.is_full) || bulkApproveBusy}
                        onChange={() => toggleApproveSelection(item.id)}
                        aria-label={`Zaznacz ${getEmployeeName(item)} ${item.date}`}
                      />
                      <strong>{getEmployeeName(item)}</strong>
                    </label>
                    <span>{item.date}</span>
                  </div>
                  {editingQueueId === item.id ? (
                    <div className={styles.queueEditRow}>
                      <input
                        type="time"
                        value={queueEditTimes.start}
                        onChange={(e) => setQueueEditTimes((prev) => ({ ...prev, start: e.target.value }))}
                      />
                      <input
                        type="time"
                        value={queueEditTimes.end}
                        onChange={(e) => setQueueEditTimes((prev) => ({ ...prev, end: e.target.value }))}
                      />
                      {renderRoleSelect(queueEditRole, (e) => setQueueEditRole(e.target.value))}
                    </div>
                  ) : (
                    <div className={styles.queueHours}>
                      {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
                      {item.role_name ? ` (${item.role_name})` : ''}
                    </div>
                  )}
                  {item.note?.trim() ? (
                    <div className={styles.dayNoteBox}>Notatka: {item.note}</div>
                  ) : null}
                  {item.shift_template_name ? (
                    <div className={styles.queueHours}>
                      Zmiana: {item.shift_template_name}
                      {item.shift_slots
                        ? ` · ${item.shift_slots.filled}/${item.shift_slots.max_slots} miejsc`
                        : ''}
                    </div>
                  ) : null}
                  {item.shift_slots?.is_full ? (
                    <div className={styles.slotFullHint}>
                      Zmiana obsadzona
                      {item.shift_slots.holders?.length
                        ? `: ${item.shift_slots.holders.map((h) => h.name).join(', ')}`
                        : ''}
                    </div>
                  ) : null}
                  {rejectingId === item.id ? renderRejectionReasonPicker() : null}
                  <div className={styles.queueActions}>
                    {rejectingId === item.id ? (
                      <>
                        <button className={styles.btnDanger} onClick={() => rejectQueueItem(item)}>
                          Potwierdź odrzucenie
                        </button>
                        <button className={styles.btnSecondary} onClick={cancelQueueEdit}>
                          Anuluj
                        </button>
                        {!showRejectNote ? (
                          <button
                            type="button"
                            className={styles.btnLink}
                            onClick={() => setShowRejectNote(true)}
                          >
                            Własna uwaga
                          </button>
                        ) : null}
                      </>
                    ) : editingQueueId === item.id ? (
                      <>
                        <button
                          className={styles.btnSuccess}
                          onClick={() => approveQueueItem(item)}
                          disabled={item.shift_slots?.is_full}
                          title={
                            item.shift_slots?.is_full
                              ? `Zmiana ${item.shift_template_name || ''} jest już obsadzona`
                              : undefined
                          }
                        >
                          Zatwierdź
                        </button>
                        <button className={styles.btnSecondary} onClick={cancelQueueEdit}>
                          Anuluj
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={styles.btnSuccess}
                          onClick={() => approveQueueItem(item, item)}
                          disabled={item.shift_slots?.is_full}
                          title={
                            item.shift_slots?.is_full
                              ? `Zmiana ${item.shift_template_name || ''} jest już obsadzona`
                              : undefined
                          }
                        >
                          {item.shift_slots?.is_full ? 'Brak miejsc' : 'Zatwierdź'}
                        </button>
                        <button className={styles.btnSecondary} onClick={() => startQueueEdit(item)}>
                          Edytuj godziny
                        </button>
                        <button
                          className={styles.btnDanger}
                          onClick={() => beginRejectWorkday(item)}
                        >
                          Odrzuć
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h3>Zamiany do zatwierdzenia</h3>
            <span className={styles.queueBadge}>{swapQueue.length}</span>
          </div>
          {swapQueue.length === 0 ? (
            <p className={styles.emptyQueue}>Brak zamian oczekujących na zatwierdzenie.</p>
          ) : (
            <div className={styles.queueList}>
              {swapQueue.map((swap) => (
                <div key={swap.id} className={styles.swapQueueItem}>
                  <div className={styles.queueItemHeader}>
                    <strong>{swap.work_day_details?.date}</strong>
                    <span>{SWAP_STATUS_LABELS[swap.status]}</span>
                  </div>
                  <div className={styles.queueHours}>
                    {swap.work_day_details?.start_time?.slice(0, 5)} - {swap.work_day_details?.end_time?.slice(0, 5)}
                    {swap.is_two_way ? ' · dwustronna' : ' · przekazanie'}
                  </div>
                  <div className={styles.swapTransfer}>
                    <span>{swap.requested_by_name}</span>
                    <span>{swap.is_two_way ? '⇄' : '→'}</span>
                    <span>{swap.target_user_name}</span>
                  </div>
                  {swap.target_work_day_details ? (
                    <div className={styles.queueHours}>
                      Za: {swap.target_work_day_details.date}{' '}
                      ({swap.target_work_day_details.start_time?.slice(0, 5)} -{' '}
                      {swap.target_work_day_details.end_time?.slice(0, 5)})
                    </div>
                  ) : null}
                  {rejectingSwapId === swap.id ? renderRejectionReasonPicker() : null}
                  <div className={styles.queueActions}>
                    {rejectingSwapId === swap.id ? (
                      <>
                        <button className={styles.btnDanger} onClick={() => rejectSwap(swap)}>
                          Potwierdź odrzucenie
                        </button>
                        <button className={styles.btnSecondary} onClick={cancelQueueEdit}>
                          Anuluj
                        </button>
                        {!showRejectNote ? (
                          <button
                            type="button"
                            className={styles.btnLink}
                            onClick={() => setShowRejectNote(true)}
                          >
                            Własna uwaga
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <button className={styles.btnSuccess} onClick={() => approveSwap(swap)}>
                          Zatwierdź zamianę
                        </button>
                        <button className={styles.btnDanger} onClick={() => beginRejectSwap(swap)}>
                          Odrzuć
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.managerBody}>
        <div className={styles.leftCol}>
          <div className={styles.sectionCard}>
            <div className={styles.settingsToggleRow}>
              <div>
                <h3>Zarządzanie kontami</h3>
                <p className={styles.statHint}>
                  Lista kont zespołu — dodawaj pracowników i kierowników z panelu.
                </p>
              </div>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  if (showAddUserForm) {
                    cancelAddUserForm();
                  } else {
                    setShowAddUserForm(true);
                  }
                }}
                aria-expanded={showAddUserForm}
              >
                {showAddUserForm ? 'Anuluj' : 'Dodaj pracownika'}
              </button>
            </div>

            {showAddUserForm ? (
              <form className={styles.userCreateForm} onSubmit={handleCreateUser}>
                <div className={styles.userCreateGrid}>
                  <input
                    type="text"
                    placeholder="Login"
                    value={newUserForm.username}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, username: e.target.value }))}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Imię"
                    value={newUserForm.first_name}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, first_name: e.target.value }))}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Nazwisko"
                    value={newUserForm.last_name}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, last_name: e.target.value }))}
                    required
                  />
                  <input
                    type="email"
                    placeholder="E-mail"
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, email: e.target.value }))}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Hasło (min. 8 znaków)"
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, password: e.target.value }))}
                    minLength={8}
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Stawka zł/h"
                    value={newUserForm.hourly_rate}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, hourly_rate: e.target.value }))}
                  />
                </div>
                <label className="checkboxRow">
                  <input
                    type="checkbox"
                    checked={newUserForm.is_manager}
                    onChange={(e) => setNewUserForm((prev) => ({ ...prev, is_manager: e.target.checked }))}
                  />
                  Konto kierownika
                </label>
                <div className={styles.queueActions}>
                  <button type="submit" className={styles.btnPrimary}>
                    Dodaj osobę
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={cancelAddUserForm}>
                    Anuluj
                  </button>
                </div>
              </form>
            ) : null}

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
                  {(showAllUsers ? allUsers : allUsers.slice(0, USERS_PREVIEW_COUNT)).map((user) => (
                    <tr key={user.id} className={user.is_active === false ? styles.inactiveRow : undefined}>
                      <td>
                        <div className={styles.empName}>
                          {user.first_name} {user.last_name}
                        </div>
                        <small>{user.username}</small>
                      </td>
                      <td>
                        <select
                          value={user.is_manager ? 'manager' : 'employee'}
                          onChange={(e) =>
                            updateUserFlags(user.id, { is_manager: e.target.value === 'manager' })
                          }
                          disabled={user.id === currentUser?.id}
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
                          onBlur={(e) => updateRate(user.id, e.target.value)}
                        />
                      </td>
                      <td className={styles.empActiveCell}>
                        <input
                          type="checkbox"
                          checked={user.is_active !== false}
                          disabled={user.id === currentUser?.id}
                          onChange={(e) => updateUserFlags(user.id, { is_active: e.target.checked })}
                          aria-label={`Aktywne: ${user.username}`}
                        />
                      </td>
                      <td>
                        {!user.is_manager && user.is_active !== false ? (
                          <button type="button" className={styles.btnPrimary} onClick={() => openManage(user)}>
                            Grafik
                          </button>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td>
                        {user.id === currentUser?.id ? (
                          <span>—</span>
                        ) : (
                          <div className={styles.empActions}>
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              onClick={() =>
                                setMoreOptionsUserId((prev) => (prev === user.id ? null : user.id))
                              }
                              aria-expanded={moreOptionsUserId === user.id}
                            >
                              {moreOptionsUserId === user.id ? 'Ukryj opcje' : 'Więcej opcji'}
                            </button>
                            {moreOptionsUserId === user.id ? (
                              <div className={styles.empMoreOptions}>
                                {user.is_active !== false ? (
                                  <button
                                    type="button"
                                    className={styles.btnSecondary}
                                    onClick={() => deactivateUserAccount(user)}
                                  >
                                    Dezaktywuj
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={styles.btnDanger}
                                  onClick={() => permanentlyDeleteUser(user)}
                                >
                                  Usuń
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {allUsers.length > USERS_PREVIEW_COUNT ? (
              <button
                type="button"
                className={`${styles.btnSecondary} ${styles.usersExpandBtn}`}
                onClick={() => setShowAllUsers((prev) => !prev)}
                aria-expanded={showAllUsers}
              >
                {showAllUsers
                  ? 'Zwiń listę'
                  : `Pokaż wszystkich (${allUsers.length})`}
              </button>
            ) : null}
          </div>
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
                  <strong>Email:</strong> {selectedEmployee.email || '—'}
                </div>
                <div className={styles.empInfo}>
                  <strong>Stawka:</strong> {selectedEmployee.hourly_rate ?? '—'} zł/h
                </div>

                <div className={styles.calendarContainer}>
                  <Calendar
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
                {renderCoverageLegend()}
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
                    title={`Na miesiąc ${statsMonth}`}
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
                  {renderRoleSelect(selectedRoleId, (e) => setSelectedRoleId(e.target.value))}
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
                            {STATUS_LABELS[w.status]}
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
              <label htmlFor="declaration-deadline" className={styles.deadlineLabel}>
                Deklaruj do dnia
              </label>
              <p className={styles.statHint}>
                Po tym terminie pracownicy nie mogą składać ani edytować deklaracji — tylko kierownik.
              </p>
            </div>
            <div className={styles.deadlineControls}>
              <input
                id="declaration-deadline"
                type="date"
                value={declarationDeadline}
                onChange={(e) => setDeclarationDeadline(e.target.value)}
              />
              <button type="submit" className={styles.btnPrimary}>
                Zapisz termin
              </button>
              {declarationDeadline ? (
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={async () => {
                    setDeclarationDeadline('');
                    try {
                      await updateScheduleSettings({ declaration_deadline: null });
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

          <div className={styles.rejectionReasonsSettings}>
            <div>
              <h4 className={styles.rejectionReasonsTitle}>Szablony uwag przy odrzuceniu</h4>
              <p className={styles.statHint}>
                Szybki wybór przy odrzucaniu deklaracji i zamian. Użyte uwagi zapamiętują się automatycznie.
              </p>
            </div>
            <form className={styles.deadlineControls} onSubmit={handleAddRejectionReason}>
              <input
                type="text"
                maxLength={255}
                placeholder="Np. Za dużo osób"
                value={newRejectionReason}
                onChange={(e) => setNewRejectionReason(e.target.value)}
              />
              <button type="submit" className={styles.btnPrimary} disabled={!newRejectionReason.trim()}>
                Dodaj
              </button>
            </form>
            {rejectionReasons.length ? (
              <ul className={styles.rejectionReasonsList}>
                {rejectionReasons.map((reason) => (
                  <li key={reason.id}>
                    <span>{reason.text}</span>
                    <button
                      type="button"
                      className={styles.btnLink}
                      onClick={() => handleDeleteRejectionReason(reason)}
                    >
                      Usuń
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyQueue}>Brak szablonów — dodaj pierwszy powyżej.</p>
            )}
          </div>

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
                  <span>Max. osób na zmianę</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
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

      <section className={styles.teamOverviewSection}>
        <div className={styles.teamOverviewHeader}>
          <div>
            <h3>Widok zbiorczy zespołu</h3>
            <p className={styles.teamOverviewHint}>Zatwierdzone zmiany — tydzień od {weekDates[0]} do {weekDates[6]}</p>
          </div>
          <div className={styles.weekNav}>
            <button type="button" className={styles.btnSecondary} onClick={() => changeWeek(-1)}>
              Poprzedni tydzień
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => setWeekStart(formatDateStr(getMonday()))}>
              Bieżący tydzień
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => changeWeek(1)}>
              Następny tydzień
            </button>
          </div>
        </div>
        {renderCoverageLegend()}
        <div className={styles.teamTableWrap}>
          <table className={styles.teamTable}>
            <thead>
              <tr>
                <th>Pracownik</th>
                {weekDates.map((dateStr, index) => {
                  const coverage = getCoverageForDate(dateStr, teamWorkdays);
                  const summary = coverageSlotSummary(coverage);
                  return (
                    <th
                      key={dateStr}
                      className={`${styles.teamDayHeader} ${coverageClass(
                        coverage.status,
                        styles.teamDayHeaderClosed,
                        styles.teamDayHeaderOpen,
                        styles.teamDayHeaderNone
                      )}`}
                      title={coverage.tooltip || undefined}
                    >
                      <div>{DAY_LABELS[index]}</div>
                      <small>{dateStr.slice(5)}</small>
                      {summary ? <div className={styles.teamDayHeaderMeta}>{summary}</div> : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <th className={styles.teamEmployeeCell}>{getEmployeeDisplayName(employee)}</th>
                  {weekDates.map((dateStr) => {
                    const shifts = getShiftsForCell(employee.id, dateStr);
                    const coverage = getCoverageForDate(dateStr, teamWorkdays);
                    return (
                      <td
                        key={`${employee.id}-${dateStr}`}
                        className={`${styles.teamDayCell} ${coverageClass(
                          coverage.status,
                          styles.teamDayCellClosed,
                          styles.teamDayCellOpen,
                          styles.teamDayCellNone
                        )}`}
                        title={coverage.tooltip || undefined}
                      >
                        {shifts.length === 0 ? (
                          <span className={styles.teamEmptyCell}>—</span>
                        ) : (
                          shifts.map((shift) => {
                            const slot = coverage.slots.find(
                              (item) => Number(item.id) === Number(shift.shift_template)
                            );
                            const incomplete = slot && !slot.isFull;
                            return (
                              <div
                                key={shift.id}
                                className={`${styles.teamShift} ${incomplete ? styles.teamShiftIncomplete : ''}`}
                              >
                                <div>
                                  {shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}
                                </div>
                                {shift.shift_template_name ? (
                                  <small>{shift.shift_template_name}</small>
                                ) : null}
                                {shift.role_name ? <small>{shift.role_name}</small> : null}
                                {incomplete ? <span className={styles.teamShiftDot} aria-hidden="true" /> : null}
                              </div>
                            );
                          })
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Manager;
