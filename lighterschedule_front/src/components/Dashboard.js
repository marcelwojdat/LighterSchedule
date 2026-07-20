import React, { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Auth from './Auth';
import UserMenu from './UserMenu';
import styles from './Dashboard.module.css';
import { getErrorMessage } from '../api/client';
import {
  getWorkdays,
  createWorkday,
  updateWorkday,
  deleteWorkday,
} from '../api/workdays';
import {
  getSwaps,
  createSwap,
  acceptSwap as acceptSwapRequest,
  rejectSwap as rejectSwapRequest,
} from '../api/swaps';
import { getUsers, getSwappableWorkdays } from '../api/users';
import { getTaskTypes } from '../api/taskTypes';
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

const Dashboard = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDates, setSelectedDates] = useState({});
  const [timeFrom, setTimeFrom] = useState('12:00');
  const [timeTo, setTimeTo] = useState('20:00');
  const [workdays, setWorkdays] = useState([]);
  const [error, setError] = useState('');
  const [showPastDateWarning, setShowPastDateWarning] = useState(false);
  const [pendingDates, setPendingDates] = useState([]);
  const [statsMonth, setStatsMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [currentUser, setCurrentUser] = useState(null);
  const { darkMode, toggleTheme } = useTheme();
  const [swaps, setSwaps] = useState([]);
  const [colleagues, setColleagues] = useState([]);
  const [swapWorkDayId, setSwapWorkDayId] = useState('');
  const [swapTargetId, setSwapTargetId] = useState('');
  const [swapTargetWorkDayId, setSwapTargetWorkDayId] = useState('');
  const [targetSwappableDays, setTargetSwappableDays] = useState([]);
  const [swapSuccess, setSwapSuccess] = useState('');
  const [notifications, setNotifications] = useState({ total: 0, items: [] });
  const [taskTypes, setTaskTypes] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');

  const fetchTaskTypes = async () => {
    try {
      const data = await getTaskTypes();
      setTaskTypes(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się pobrać stanowisk.'));
    }
  };

  const fetchSwaps = async () => {
    try {
      const data = await getSwaps();
      setSwaps(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się pobrać zamian.'));
    }
  };

  const fetchColleagues = async () => {
    try {
      const data = await getUsers();
      setColleagues(data.filter((user) => !user.is_manager));
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się pobrać listy pracowników.'));
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

  const loadTargetSwappableDays = async (colleagueId) => {
    setSwapTargetWorkDayId('');
    if (!colleagueId) {
      setTargetSwappableDays([]);
      return;
    }
    try {
      const data = await getSwappableWorkdays(colleagueId);
      setTargetSwappableDays(data);
    } catch (err) {
      setTargetSwappableDays([]);
      setError(getErrorMessage(err, 'Nie udało się pobrać zmian kolegi.'));
    }
  };

  const isActiveSwap = (swap) => !swap.is_rejected && !swap.approved_by_manager;

  const hasActiveSwapForWorkday = (workdayId) =>
    swaps.some((swap) => swap.work_day === workdayId && isActiveSwap(swap));

  const swappableWorkdays = workdays.filter(
    (day) =>
      day.status === 'approved' &&
      !isPastDate(day.date) &&
      !hasActiveSwapForWorkday(day.id)
  );

  const createSwapRequest = async () => {
    if (!swapWorkDayId || !swapTargetId) {
      setError('Wybierz zmianę i pracownika, do którego wysyłasz prośbę.');
      return;
    }

    try {
      const payload = {
        work_day: Number(swapWorkDayId),
        target_user: Number(swapTargetId),
      };
      if (swapTargetWorkDayId) {
        payload.target_work_day = Number(swapTargetWorkDayId);
      }

      await createSwap(payload);

      setSwapWorkDayId('');
      setSwapTargetId('');
      setSwapTargetWorkDayId('');
      setTargetSwappableDays([]);
      setSwapSuccess(
        swapTargetWorkDayId
          ? 'Prośba o dwustronną zamianę została wysłana.'
          : 'Prośba o przejęcie zmiany została wysłana.'
      );
      setError('');
      await fetchSwaps();
      await fetchNotifications();
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się wysłać prośby.'));
    }
  };

  const acceptSwap = async (swapId) => {
    try {
      await acceptSwapRequest(swapId);
      setSwapSuccess('Zaakceptowano prośbę. Czeka na zatwierdzenie kierownika.');
      setError('');
      await fetchSwaps();
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się zaakceptować prośby.'));
    }
  };

  const rejectSwap = async (swapId) => {
    try {
      await rejectSwapRequest(swapId);
      setSwapSuccess('Prośba została odrzucona.');
      setError('');
      await fetchSwaps();
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się odrzucić prośby.'));
    }
  };

  const fetchWorkdays = async () => {
    try {
      const data = await getWorkdays();
      setWorkdays(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się pobrać grafika.'));
    }
  };

  const isPastDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const selectedDateObj = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selectedDateObj < today;
  };

  const getWorkdayForDate = (dateStr) => workdays.find((d) => d.date === dateStr);

  const isEditableStatus = (status) => status === 'proposed' || status === 'rejected';

  const setChosenDate = (e) => {
    const year = e.getFullYear();
    const month = String(e.getMonth() + 1).padStart(2, '0');
    const day = String(e.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    setSelectedDate(dateStr);
    setError('');
    setShowPastDateWarning(false);

    const pending = selectedDates[dateStr];
    const existing = getWorkdayForDate(dateStr);

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

  const setChoosedHours = () => {
    if (!selectedDate) {
      setError('Wybierz dzień, aby ustawić godziny.');
      return;
    }

    const existing = getWorkdayForDate(selectedDate);
    if (existing?.status === 'approved') {
      setError('Nie możesz edytować zatwierdzonego grafiku.');
      return;
    }

    if (!existing && isPastDate(selectedDate)) {
      setShowPastDateWarning(true);
      return;
    }

    const newSelectedDates = {
      ...selectedDates,
      [selectedDate]: {
        start_time: toApiTime(timeFrom),
        end_time: toApiTime(timeTo),
        role: selectedRoleId ? Number(selectedRoleId) : null,
      },
    };

    setSelectedDates(newSelectedDates);
    if (!pendingDates.includes(selectedDate)) {
      setPendingDates((prev) => [...prev, selectedDate]);
    }
    setSelectedDate('');
    setError('');
  };

  const removeDateFromSelection = async (dateStr) => {
    const existing = getWorkdayForDate(dateStr);

    if (existing?.status === 'approved') {
      setError('Nie możesz usuwać zatwierdzonego grafiku.');
      return;
    }

    if (existing && isPastDate(dateStr)) {
      return;
    }

    if (existing) {
      try {
        await deleteWorkday(existing.id);
        setWorkdays((prev) => prev.filter((d) => d.date !== dateStr));
      } catch (err) {
        setError(getErrorMessage(err, 'Błąd przy usuwaniu deklaracji.'));
        return;
      }
    }

    setSelectedDates((prev) => {
      const updated = { ...prev };
      delete updated[dateStr];
      return updated;
    });
    setPendingDates((prev) => prev.filter((d) => d !== dateStr));
    if (selectedDate === dateStr) {
      setSelectedDate('');
    }
  };

  const cancelSelection = () => {
    setSelectedDate('');
    setError('');
    setShowPastDateWarning(false);
  };

  const formatCurrency = (value) => {
    const amount = Number(value) || 0;
    return `${amount.toFixed(2).replace('.', ',')} zł`;
  };

  const getMonthStats = (monthValue) => {
    const [year, month] = monthValue.split('-');
    const prefix = `${year}-${month}-`;
    const monthWorkdays = workdays.filter((d) => d.date.startsWith(prefix));
    const approvedWorkdays = monthWorkdays.filter((d) => d.status === 'approved');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const workedDays = approvedWorkdays.filter((d) => d.date <= todayStr);

    const totalHoursToDate = workedDays.reduce((sum, day) => sum + Number(day.total_hours || 0), 0);
    const earnedToDate = workedDays.reduce((sum, day) => sum + Number(day.earnings || 0), 0);
    const totalDays = approvedWorkdays.length;
    const totalEarnings = approvedWorkdays.reduce((sum, day) => sum + Number(day.earnings || 0), 0);
    const pendingCount = monthWorkdays.filter((d) => d.status === 'proposed').length;

    const monthName = new Date(Number(year), Number(month) - 1).toLocaleString('pl-PL', { month: 'long' });

    return {
      totalHoursToDate,
      earnedToDate,
      totalDays,
      totalEarnings,
      pendingCount,
      monthTitle: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`,
    };
  };

  const monthStats = getMonthStats(statsMonth);

  const setSchedule = async () => {
    const entries = Object.entries(selectedDates);
    if (entries.length === 0) {
      setError('Dodaj przynajmniej jedną deklarację przed wysłaniem.');
      return;
    }

    try {
      const responses = await Promise.all(
        entries.map(async ([oneDate, times]) => {
          const existing = getWorkdayForDate(oneDate);
          const payload = buildWorkdayPayload({
            date: oneDate,
            start_time: times.start_time,
            end_time: times.end_time,
            role: times.role,
          });

          if (existing?.status === 'approved') {
            return { ok: false, date: oneDate };
          }

          if (existing) {
            await updateWorkday(existing.id, payload);
            return { ok: true, date: oneDate };
          }

          const response = await createWorkday(payload);
          return { ok: response.status === 201, date: oneDate };
        })
      );

      if (responses.every((r) => r.ok)) {
        setPendingDates([]);
        setSelectedDates({});
        await fetchWorkdays();
        setError('');
      } else {
        const failed = responses.filter((r) => !r.ok).map((r) => r.date);
        setError(`Nie udało się zapisać deklaracji dla: ${failed.join(', ')}`);
        await fetchWorkdays();
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Błąd połączenia z serwerem.'));
    }
  };

  const handleLogout = () => {
    Auth.logout();
  };

  const fetchCurrentUser = async () => {
    try {
      const data = await Auth.fetchCurrentUser();
      setCurrentUser(data);
    } catch {
      Auth.logout();
    }
  };

  useEffect(() => {
    fetchWorkdays();
    fetchCurrentUser();
    fetchSwaps();
    fetchColleagues();
    fetchTaskTypes();
    fetchNotifications();
  }, []);

  const getTileClassName = ({ date: tileDate, view }) => {
    if (view !== 'month') return null;

    const year = tileDate.getFullYear();
    const month = String(tileDate.getMonth() + 1).padStart(2, '0');
    const day = String(tileDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    if (pendingDates.includes(dateStr)) return 'custom-selected-day';

    const saved = getWorkdayForDate(dateStr);
    if (!saved) return null;

    if (saved.status === 'approved') return 'custom-approved-day';
    if (saved.status === 'rejected') return 'custom-rejected-day';
    return 'custom-proposed-day';
  };

  const getTileContent = ({ date: tileDate, view }) => {
    if (view !== 'month') return null;

    const year = tileDate.getFullYear();
    const month = String(tileDate.getMonth() + 1).padStart(2, '0');
    const day = String(tileDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const pending = selectedDates[dateStr];
    if (pending) {
      return (
        <div className={styles.tileContent}>
          <div className={styles.tileHours}>
            {pending.start_time.slice(0, 5)} - {pending.end_time.slice(0, 5)}
          </div>
          <div className={styles.tileStatus}>Do wysłania</div>
        </div>
      );
    }

    const saved = getWorkdayForDate(dateStr);
    if (saved) {
      return (
        <div className={styles.tileContent}>
          <div className={styles.tileHours}>
            {saved.start_time.slice(0, 5)} - {saved.end_time.slice(0, 5)}
          </div>
          {saved.role_name ? <div className={styles.tileStatus}>{saved.role_name}</div> : null}
          <div className={styles.tileStatus}>{STATUS_LABELS[saved.status]}</div>
        </div>
      );
    }

    return null;
  };

  const existingWorkday = selectedDate ? getWorkdayForDate(selectedDate) : null;
  const pendingSelection = selectedDate ? selectedDates[selectedDate] : null;

  const renderRoleSelect = () => (
    <select
      value={selectedRoleId}
      onChange={(e) => setSelectedRoleId(e.target.value)}
      className={styles.roleSelect}
    >
      <option value="">Stanowisko (opcjonalnie)</option>
      {taskTypes.map((type) => (
        <option key={type.id} value={type.id}>
          {type.name}
        </option>
      ))}
    </select>
  );

  const renderStatusBadge = (status) => (
    <span
      className={`${styles.statusBadge} ${
        status === 'approved'
          ? styles.statusApproved
          : status === 'rejected'
            ? styles.statusRejected
            : styles.statusProposed
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  );

  const renderPopup = () => {
    if (!selectedDate) return null;

    if (showPastDateWarning) {
      return (
        <>
          <h2 className={styles.popupTitle}>Nie można dodawać przeszłych dni</h2>
          <p className={styles.popupInfo}>Wybrany dzień {selectedDate} już minął i nie można go dodać.</p>
          <div className={styles.popupButtons}>
            <input type="button" className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} onClick={cancelSelection} value="Wróć" />
          </div>
        </>
      );
    }

    if (existingWorkday?.status === 'approved') {
      return (
        <>
          <h2 className={styles.popupTitle}>Zatwierdzony grafik</h2>
          <p className={styles.popupInfo}>{selectedDate}</p>
          <p className={styles.popupInfo}>
            {existingWorkday.start_time.slice(0, 5)} - {existingWorkday.end_time.slice(0, 5)}
            {existingWorkday.role_name ? ` (${existingWorkday.role_name})` : ''}
          </p>
          {renderStatusBadge('approved')}
          <p className={styles.popupInfo}>Ten dzień został zatwierdzony przez kierownika. Nie możesz go edytować.</p>
          <div className={styles.popupButtons}>
            <input type="button" className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} onClick={cancelSelection} value="Wróć" />
          </div>
        </>
      );
    }

    if (existingWorkday?.status === 'rejected' && !pendingSelection) {
      return (
        <>
          <h2 className={styles.popupTitle}>Odrzucona deklaracja</h2>
          <p className={styles.popupInfo}>{selectedDate}</p>
          {renderStatusBadge('rejected')}
          {existingWorkday.rejection_reason ? (
            <div className={styles.rejectionReason}>
              Powód odrzucenia: {existingWorkday.rejection_reason}
            </div>
          ) : null}
          <p className={styles.popupInfo}>Możesz złożyć nową deklarację na ten dzień.</p>
          <div className={styles.popupField}>
            <input type="time" onChange={(e) => setTimeFrom(e.target.value)} value={timeFrom} />
            <input type="time" onChange={(e) => setTimeTo(e.target.value)} value={timeTo} />
          </div>
          {renderRoleSelect()}
          <div className={styles.popupButtons}>
            <input type="button" className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} onClick={cancelSelection} value="Wróć" />
            <input type="button" className={styles.popupBtn} onClick={setChoosedHours} value="Złóż ponownie" />
          </div>
        </>
      );
    }

    if (existingWorkday?.status === 'proposed' && !pendingSelection) {
      const canModify = !isPastDate(selectedDate);

      return (
        <>
          <h2 className={styles.popupTitle}>Oczekująca deklaracja</h2>
          <p className={styles.popupInfo}>{selectedDate}</p>
          <p className={styles.popupInfo}>
            {existingWorkday.start_time.slice(0, 5)} - {existingWorkday.end_time.slice(0, 5)}
          </p>
          {renderStatusBadge('proposed')}
          <p className={styles.popupInfo}>Deklaracja czeka na akceptację kierownika.</p>
          {canModify ? (
            <>
              <div className={styles.popupField}>
                <input type="time" onChange={(e) => setTimeFrom(e.target.value)} value={timeFrom} />
                <input type="time" onChange={(e) => setTimeTo(e.target.value)} value={timeTo} />
              </div>
              {renderRoleSelect()}
              <div className={styles.popupButtons}>
                <input type="button" className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} onClick={cancelSelection} value="Wróć" />
                <input type="button" className={`${styles.popupBtn} ${styles.popupBtnDanger}`} onClick={() => removeDateFromSelection(selectedDate)} value="Usuń" />
                <input type="button" className={styles.popupBtn} onClick={setChoosedHours} value="Edytuj" />
              </div>
            </>
          ) : (
            <div className={styles.popupButtons}>
              <input type="button" className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} onClick={cancelSelection} value="Wróć" />
            </div>
          )}
        </>
      );
    }

    if (existingWorkday && isPastDate(selectedDate) && isEditableStatus(existingWorkday.status)) {
      return (
        <>
          <h2 className={styles.popupTitle}>Dzień z przeszłości</h2>
          <p className={styles.popupInfo}>
            {selectedDate}: {existingWorkday.start_time.slice(0, 5)} - {existingWorkday.end_time.slice(0, 5)}
          </p>
          {renderStatusBadge(existingWorkday.status)}
          <p className={styles.popupInfo}>Przeszłych deklaracji nie można już edytować ani usuwać.</p>
          <div className={styles.popupButtons}>
            <input type="button" className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} onClick={cancelSelection} value="Wróć" />
          </div>
        </>
      );
    }

    return (
      <>
        <h2 className={styles.popupTitle}>{selectedDate}</h2>
        <p className={styles.popupInfo}>Wybierz godziny dyspozycyjności</p>
        <div className={styles.popupField}>
          <input type="time" onChange={(e) => setTimeFrom(e.target.value)} value={timeFrom} />
          <input type="time" onChange={(e) => setTimeTo(e.target.value)} value={timeTo} />
        </div>
        {renderRoleSelect()}
        <div className={styles.popupButtons}>
          <input type="button" onClick={cancelSelection} value="Wróć" className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} />
          <input type="button" onClick={setChoosedHours} value="Dodaj deklarację" className={styles.popupBtn} />
        </div>
      </>
    );
  };

  const sentSwaps = swaps.filter((swap) => swap.requested_by === currentUser?.id);
  const receivedSwaps = swaps.filter((swap) => swap.target_user === currentUser?.id);

  return (
    <div className={styles.dashboardPage}>
      <div className={styles.pageHeader}>
        <h1 className={styles.dashboardTitle}>Twój Grafik Pracy</h1>
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
      {error ? <div className={styles.rejectionReason}>{error}</div> : null}
      {swapSuccess ? <div className={styles.swapSuccess}>{swapSuccess}</div> : null}
      {notifications.items?.length ? (
        <div className={styles.notificationsBanner}>
          {notifications.items.map((item) => (
            <div key={item.type} className={styles.notificationItem}>
              {item.message}
            </div>
          ))}
        </div>
      ) : null}
      <div className={styles.dashboardBody}>
        <div className={styles.statsWrapper}>
          <div className={styles.statsHeader}>
            <div>
              <div className={styles.statsLabel}>Statystyki miesiąca</div>
              <div className={styles.statsTitle}>{monthStats.monthTitle}</div>
            </div>
            <div className={styles.statsMonthPicker}>
              <label htmlFor="stats-month">Wybierz miesiąc</label>
              <input
                id="stats-month"
                type="month"
                value={statsMonth}
                onChange={(e) => setStatsMonth(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <h3>Godziny przepracowane</h3>
              <p>{monthStats.totalHoursToDate.toFixed(2)}</p>
              <small>zatwierdzone dni do dziś</small>
            </div>
            <div className={styles.statCard}>
              <h3>Zarobki do dziś</h3>
              <p>{formatCurrency(monthStats.earnedToDate)}</p>
              <small>za zatwierdzone dni</small>
            </div>
            <div className={styles.statCard}>
              <h3>Zatwierdzone dni</h3>
              <p>{monthStats.totalDays}</p>
              <small>w wybranym miesiącu</small>
            </div>
            <div className={styles.statCard}>
              <h3>Oczekujące deklaracje</h3>
              <p>{monthStats.pendingCount}</p>
              <small>czekają na kierownika</small>
            </div>
          </div>
        </div>

        <div className={styles.calendarPanel}>
          <div className={styles.calendarHeader}>
            <div>
              <p className={styles.calendarLabel}>Kalendarz</p>
              <div className={styles.calendarHeaderTitle}>Deklaruj swoją dyspozycyjność</div>
            </div>
          </div>
          <div className={styles.calendarWrapper}>
            <div className={styles.calendarContainer}>
              <Calendar
                onChange={setChosenDate}
                value={null}
                tileClassName={getTileClassName}
                tileContent={getTileContent}
              />
            </div>
          </div>
          <div className={styles.statusLegend}>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendProposed}`} />
              Oczekuje na akceptację
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendApproved}`} />
              Zatwierdzony przez kierownika
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendRejected}`} />
              Odrzucony
            </div>
            <div className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendSelected}`} />
              Do wysłania
            </div>
          </div>
          <input
            type="button"
            onClick={setSchedule}
            value="Wyślij deklaracje"
            className={`${styles.scheduleSetBtn} ${styles.saveScheduleBtn}`}
          />
        </div>
      </div>

      <section className={styles.swapsSection}>
        <h3 className={styles.swapsTitle}>Zamiany zmian</h3>
        <p className={styles.swapsHint}>
          Przekazanie: kolega przejmuje Twoją zmianę. Dwustronna zamiana: wybierz też zmianę kolegi — wtedy
          wymienicie się. Obie opcje wymagają akceptacji kolegi i zatwierdzenia kierownika.
        </p>

        <div className={styles.swapForm}>
          <select value={swapWorkDayId} onChange={(e) => setSwapWorkDayId(e.target.value)}>
            <option value="">Wybierz swoją zmianę</option>
            {swappableWorkdays.map((day) => (
              <option key={day.id} value={day.id}>
                {day.date} ({day.start_time.slice(0, 5)} - {day.end_time.slice(0, 5)})
              </option>
            ))}
          </select>
          <select
            value={swapTargetId}
            onChange={(e) => {
              setSwapTargetId(e.target.value);
              loadTargetSwappableDays(e.target.value);
            }}
          >
            <option value="">Wybierz kolegę</option>
            {colleagues
              .filter((colleague) => colleague.id !== currentUser?.id)
              .map((colleague) => (
                <option key={colleague.id} value={colleague.id}>
                  {`${colleague.first_name || ''} ${colleague.last_name || ''}`.trim() || colleague.username}
                </option>
              ))}
          </select>
          <select
            value={swapTargetWorkDayId}
            onChange={(e) => setSwapTargetWorkDayId(e.target.value)}
            disabled={!swapTargetId}
          >
            <option value="">Bez zamiany zwrotnej (tylko przekazanie)</option>
            {targetSwappableDays.map((day) => (
              <option key={day.id} value={day.id}>
                Zamiana za: {day.date} ({day.start_time.slice(0, 5)} - {day.end_time.slice(0, 5)})
              </option>
            ))}
          </select>
          <button type="button" className={styles.swapSubmitBtn} onClick={createSwapRequest}>
            Wyślij prośbę
          </button>
        </div>

        <div className={styles.swapLists}>
          <div className={styles.swapListCard}>
            <h4>Wysłane prośby</h4>
            {sentSwaps.length === 0 ? (
              <p className={styles.swapEmpty}>Brak wysłanych próśb.</p>
            ) : (
              <ul className={styles.swapList}>
                {sentSwaps.map((swap) => (
                  <li key={swap.id} className={styles.swapListItem}>
                    <div>
                      <strong>{swap.work_day_details?.date}</strong>
                      <div>
                        {swap.work_day_details?.start_time?.slice(0, 5)} - {swap.work_day_details?.end_time?.slice(0, 5)}
                      </div>
                      <small>
                        Do: {swap.target_user_name}
                        {swap.is_two_way ? ' · dwustronna' : ' · przekazanie'}
                      </small>
                      {swap.target_work_day_details ? (
                        <small>
                          Za: {swap.target_work_day_details.date} (
                          {swap.target_work_day_details.start_time?.slice(0, 5)} -{' '}
                          {swap.target_work_day_details.end_time?.slice(0, 5)})
                        </small>
                      ) : null}
                    </div>
                    <div className={styles.swapListActions}>
                      <span className={styles.swapStatusTag}>{SWAP_STATUS_LABELS[swap.status]}</span>
                      {swap.status === 'pending_target' ? (
                        <button type="button" className={styles.swapRejectBtn} onClick={() => rejectSwap(swap.id)}>
                          Anuluj
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.swapListCard}>
            <h4>Otrzymane prośby</h4>
            {receivedSwaps.length === 0 ? (
              <p className={styles.swapEmpty}>Brak otrzymanych próśb.</p>
            ) : (
              <ul className={styles.swapList}>
                {receivedSwaps.map((swap) => (
                  <li key={swap.id} className={styles.swapListItem}>
                    <div>
                      <strong>{swap.work_day_details?.date}</strong>
                      <div>
                        {swap.work_day_details?.start_time?.slice(0, 5)} - {swap.work_day_details?.end_time?.slice(0, 5)}
                      </div>
                      <small>
                        Od: {swap.requested_by_name}
                        {swap.is_two_way ? ' · dwustronna' : ' · przekazanie'}
                      </small>
                      {swap.target_work_day_details ? (
                        <small>
                          Oddajesz: {swap.target_work_day_details.date} (
                          {swap.target_work_day_details.start_time?.slice(0, 5)} -{' '}
                          {swap.target_work_day_details.end_time?.slice(0, 5)})
                        </small>
                      ) : null}
                    </div>
                    <div className={styles.swapListActions}>
                      <span className={styles.swapStatusTag}>{SWAP_STATUS_LABELS[swap.status]}</span>
                      {swap.status === 'pending_target' ? (
                        <>
                          <button type="button" className={styles.swapAcceptBtn} onClick={() => acceptSwap(swap.id)}>
                            Akceptuję
                          </button>
                          <button type="button" className={styles.swapRejectBtn} onClick={() => rejectSwap(swap.id)}>
                            Odrzucam
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {selectedDate ? (
        <div className={styles.popupBackdrop} onClick={cancelSelection}>
          <div className={styles.popupBox} onClick={(e) => e.stopPropagation()}>
            {renderPopup()}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Dashboard;
