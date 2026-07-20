import React, { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Auth from './Auth';
import UserMenu from './UserMenu';
import styles from './Manager.module.css';
import { getErrorMessage } from '../api/client';
import { getUsers, createUser, updateUserProfile } from '../api/users';
import {
  getWorkdays,
  createWorkday,
  updateWorkday,
  deleteWorkday,
  approveWorkday,
  rejectWorkday,
} from '../api/workdays';
import { getSwaps, approveSwap as approveSwapRequest, rejectSwap as rejectSwapRequest } from '../api/swaps';
import { getTaskTypes } from '../api/taskTypes';
import { downloadPayrollPdf, getTeamStats } from '../api/stats';
import { getNotifications } from '../api/notifications';
import { useTheme } from '../hooks/useTheme';
import { buildWorkdayPayload, toApiTime } from '../utils/time';

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

const formatDateStr = (dateObj) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonday = (baseDate = new Date()) => {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getWeekDates = (weekStartStr) => {
  const start = new Date(weekStartStr);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return formatDateStr(d);
  });
};

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
  const [taskTypes, setTaskTypes] = useState([]);
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
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [notifications, setNotifications] = useState({ total: 0, items: [] });
  const [newUserForm, setNewUserForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    is_manager: false,
    hourly_rate: '20',
  });
  const { darkMode, toggleTheme } = useTheme();

  const weekDates = getWeekDates(weekStart);

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
      fetchTaskTypes(),
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
    } else if (existing) {
      setTimeFrom(existing.start_time.slice(0, 5));
      setTimeTo(existing.end_time.slice(0, 5));
      setSelectedRoleId(existing.role ? String(existing.role) : '');
    } else {
      setTimeFrom('12:00');
      setTimeTo('20:00');
      setSelectedRoleId('');
    }
  };

  const addShift = () => {
    if (!selectedEmployee || !selectedDate) return;
    setSelectedDates({
      ...selectedDates,
      [selectedDate]: {
        start_time: toApiTime(timeFrom),
        end_time: toApiTime(timeTo),
        role: selectedRoleId ? Number(selectedRoleId) : null,
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
      setNewUserForm({
        username: '',
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        is_manager: false,
        hourly_rate: '20',
      });
      setSuccess(is_manager ? 'Dodano kierownika.' : 'Dodano pracownika.');
      setError('');
      await fetchEmployees();
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się dodać użytkownika.'));
    }
  };

  const startQueueEdit = (item) => {
    setEditingQueueId(item.id);
    setQueueEditTimes({
      start: item.start_time.slice(0, 5),
      end: item.end_time.slice(0, 5),
    });
    setQueueEditRole(item.role ? String(item.role) : '');
    setRejectingId(null);
    setError('');
  };

  const cancelQueueEdit = () => {
    setEditingQueueId(null);
    setRejectingId(null);
    setRejectionReason('');
    setQueueEditRole('');
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

  const rejectQueueItem = async (item) => {
    try {
      await rejectWorkday(item.id, { rejection_reason: rejectionReason });

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
      await refreshData(selectedEmployee?.id);
    } catch (e) {
      setError(getErrorMessage(e, 'Nie udało się zatwierdzić zamiany.'));
    }
  };

  const rejectSwap = async (swap) => {
    try {
      await rejectSwapRequest(swap.id);
      setSuccess(`Odrzucono zamianę zmiany z dnia ${swap.work_day_details?.date}.`);
      setError('');
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

  const changeWeek = (offset) => {
    const current = new Date(weekStart);
    current.setDate(current.getDate() + offset * 7);
    setWeekStart(formatDateStr(getMonday(current)));
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
    <div className={styles.managerPage}>
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
          {notifications.items.map((item) => (
            <div key={item.type} className={styles.notificationItem}>
              {item.message}
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.managerBody}>
        <div className={styles.leftCol}>
          <div className={styles.sectionCard}>
            <h3>Statystyki zespołu</h3>
            <div className={styles.statRow}>
              <strong>Pracownicy:</strong> {teamStats?.employee_count ?? employees.length}
            </div>
            <div className={styles.statRow}>
              <strong>Oczekujące deklaracje:</strong> {pendingQueue.length}
            </div>
            <div className={styles.statRow}>
              <strong>Zamiany do zatwierdzenia:</strong> {swapQueue.length}
            </div>
            <div className={styles.statRow}>
              <strong>Godziny (zatwierdzone):</strong> {(teamStats?.total_hours ?? 0).toFixed(2)}
            </div>
            <div className={styles.statRow}>
              <strong>Wypłaty (zatwierdzone):</strong> {(teamStats?.total_earnings ?? 0).toFixed(2)} zł
            </div>
            <div className={styles.statRow}>
              <strong>Zatwierdzone dni:</strong> {teamStats?.approved_days ?? 0}
            </div>
            <div className={styles.sectionFooter}>
              <label>Wybierz miesiąc</label>
              <input type="month" value={statsMonth} onChange={(e) => setStatsMonth(e.target.value)} />
            </div>
            <button type="button" className={styles.btnPrimary} onClick={handlePayrollDownload}>
              Pobierz raport PDF
            </button>
            <small className={styles.statHint}>
              Statystyki obejmują cały zespół i tylko zatwierdzone wpisy w wybranym miesiącu.
            </small>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3>Do akceptacji</h3>
              <span className={styles.queueBadge}>{pendingQueue.length}</span>
            </div>
            {pendingQueue.length === 0 ? (
              <p className={styles.emptyQueue}>Brak deklaracji oczekujących na akceptację.</p>
            ) : (
              <div className={styles.queueList}>
                {pendingQueue.map((item) => (
                  <div key={item.id} className={styles.queueItem}>
                    <div className={styles.queueItemHeader}>
                      <strong>{getEmployeeName(item)}</strong>
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
                    {rejectingId === item.id ? (
                      <input
                        className={styles.rejectionInput}
                        type="text"
                        placeholder="Powód odrzucenia (opcjonalnie)"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                      />
                    ) : null}
                    <div className={styles.queueActions}>
                      {rejectingId === item.id ? (
                        <>
                          <button className={styles.btnDanger} onClick={() => rejectQueueItem(item)}>
                            Potwierdź odrzucenie
                          </button>
                          <button className={styles.btnSecondary} onClick={cancelQueueEdit}>
                            Anuluj
                          </button>
                        </>
                      ) : editingQueueId === item.id ? (
                        <>
                          <button className={styles.btnSuccess} onClick={() => approveQueueItem(item)}>
                            Zatwierdź
                          </button>
                          <button className={styles.btnSecondary} onClick={cancelQueueEdit}>
                            Anuluj
                          </button>
                        </>
                      ) : (
                        <>
                          <button className={styles.btnSuccess} onClick={() => approveQueueItem(item, item)}>
                            Zatwierdź
                          </button>
                          <button className={styles.btnSecondary} onClick={() => startQueueEdit(item)}>
                            Edytuj godziny
                          </button>
                          <button
                            className={styles.btnDanger}
                            onClick={() => {
                              setRejectingId(item.id);
                              setEditingQueueId(null);
                              setRejectionReason('');
                            }}
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
                    <div className={styles.queueActions}>
                      <button className={styles.btnSuccess} onClick={() => approveSwap(swap)}>
                        Zatwierdź zamianę
                      </button>
                      <button className={styles.btnDanger} onClick={() => rejectSwap(swap)}>
                        Odrzuć
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.sectionCard}>
            <h3>Zarządzanie kontami</h3>
            <p className={styles.statHint}>
              Dodawaj pracowników i kierowników z panelu — bez konsoli i Django admina na co dzień.
            </p>
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
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={newUserForm.is_manager}
                  onChange={(e) => setNewUserForm((prev) => ({ ...prev, is_manager: e.target.checked }))}
                />
                Konto kierownika
              </label>
              <button type="submit" className={styles.btnPrimary}>
                Dodaj osobę
              </button>
            </form>

            <div className={styles.tableWrap}>
              <table className={styles.empTable}>
                <thead>
                  <tr>
                    <th>Osoba</th>
                    <th>Rola</th>
                    <th>Stawka</th>
                    <th>Aktywne</th>
                    <th>Grafik</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map((user) => (
                    <tr key={user.id} className={user.is_active === false ? styles.inactiveRow : undefined}>
                      <td>
                        <div>{user.first_name} {user.last_name}</div>
                        <small>{user.username} · {user.email || 'brak e-mail'}</small>
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
                      <td>
                        <input
                          type="checkbox"
                          checked={user.is_active !== false}
                          disabled={user.id === currentUser?.id}
                          onChange={(e) => updateUserFlags(user.id, { is_active: e.target.checked })}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={styles.rightCol}>
          <div className={styles.sectionCard}>
            <h3>Szczegóły pracownika</h3>
            {!selectedEmployee ? (
              <p>Wybierz pracownika z listy, aby zarządzać jego grafikiem.</p>
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
                  <Calendar onChange={setChosenDate} value={null} />
                </div>

                <div className={styles.shiftControls}>
                  <div>Wybrany dzień: {selectedDate || '—'}</div>
                  <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
                  <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
                  {renderRoleSelect(selectedRoleId, (e) => setSelectedRoleId(e.target.value))}
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
                    <p>Brak wpisów w grafiku.</p>
                  ) : (
                    <ul className={styles.scheduleList}>
                      {workdays.map((w) => (
                        <li key={w.id} className={styles.scheduleItem}>
                          <span>
                            {w.date} — {w.start_time.slice(0, 5)} - {w.end_time.slice(0, 5)}
                            {w.role_name ? ` (${w.role_name})` : ''}
                          </span>
                          <span
                            className={`${styles.statusBadge} ${
                              w.status === 'approved'
                                ? styles.statusApproved
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
        <div className={styles.teamTableWrap}>
          <table className={styles.teamTable}>
            <thead>
              <tr>
                <th>Pracownik</th>
                {weekDates.map((dateStr, index) => (
                  <th key={dateStr}>
                    <div>{DAY_LABELS[index]}</div>
                    <small>{dateStr.slice(5)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <th className={styles.teamEmployeeCell}>{getEmployeeDisplayName(employee)}</th>
                  {weekDates.map((dateStr) => {
                    const shifts = getShiftsForCell(employee.id, dateStr);
                    return (
                      <td key={`${employee.id}-${dateStr}`} className={styles.teamDayCell}>
                        {shifts.length === 0 ? (
                          <span className={styles.teamEmptyCell}>—</span>
                        ) : (
                          shifts.map((shift) => (
                            <div key={shift.id} className={styles.teamShift}>
                              <div>{shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}</div>
                              {shift.role_name ? <small>{shift.role_name}</small> : null}
                            </div>
                          ))
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
