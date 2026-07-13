import React, { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import { useNavigate } from 'react-router-dom';
import 'react-calendar/dist/Calendar.css';
import Auth from './Auth';
import UserMenu from './UserMenu';
import styles from './Dashboard.module.css';

const STATUS_LABELS = {
  proposed: 'Oczekuje',
  approved: 'Zatwierdzony',
  rejected: 'Odrzucony',
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
  const [darkMode, setDarkMode] = useState(false);
  const navigate = useNavigate();

  const authFetch = async (url, options = {}) => {
    let token = localStorage.getItem('access');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    let response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      try {
        token = await Auth.refreshToken();
        response = await fetch(url, {
          ...options,
          headers: { ...headers, Authorization: `Bearer ${token}` },
        });
      } catch {
        Auth.logout();
        throw new Error('Sesja wygasła. Zaloguj się ponownie.');
      }
    }

    return response;
  };

  const fetchWorkdays = async () => {
    try {
      const response = await authFetch('http://127.0.0.1:8000/api/workdays/');
      if (!response.ok) {
        throw new Error('Nie udało się pobrać grafika.');
      }
      const data = await response.json();
      setWorkdays(data);
    } catch (err) {
      setError(err.message);
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
    } else if (existing) {
      setTimeFrom(existing.start_time.slice(0, 5));
      setTimeTo(existing.end_time.slice(0, 5));
    } else {
      setTimeFrom('12:00');
      setTimeTo('20:00');
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
        start_time: `${timeFrom}:00`,
        end_time: `${timeTo}:00`,
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
        const response = await authFetch(
          `http://127.0.0.1:8000/api/workdays/${existing.id}/`,
          { method: 'DELETE' }
        );
        if (!response.ok) {
          throw new Error('Nie udało się usunąć deklaracji.');
        }
        setWorkdays((prev) => prev.filter((d) => d.date !== dateStr));
      } catch (err) {
        setError(err.message || 'Błąd przy usuwaniu deklaracji.');
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

          if (existing?.status === 'approved') {
            return { ok: false, date: oneDate };
          }

          if (existing) {
            const response = await authFetch(
              `http://127.0.0.1:8000/api/workdays/${existing.id}/`,
              {
                method: 'PATCH',
                body: JSON.stringify({
                  start_time: times.start_time,
                  end_time: times.end_time,
                }),
              }
            );
            return { ok: response.ok, date: oneDate };
          }

          const response = await authFetch('http://127.0.0.1:8000/api/workdays/', {
            method: 'POST',
            body: JSON.stringify({
              date: oneDate,
              start_time: times.start_time,
              end_time: times.end_time,
            }),
          });
          return { ok: response.ok || response.status === 201, date: oneDate };
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
    } catch {
      setError('Błąd połączenia z serwerem.');
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
          <div className={styles.tileStatus}>{STATUS_LABELS[saved.status]}</div>
        </div>
      );
    }

    return null;
  };

  const existingWorkday = selectedDate ? getWorkdayForDate(selectedDate) : null;
  const pendingSelection = selectedDate ? selectedDates[selectedDate] : null;

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
        <div className={styles.popupButtons}>
          <input type="button" onClick={cancelSelection} value="Wróć" className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} />
          <input type="button" onClick={setChoosedHours} value="Dodaj deklarację" className={styles.popupBtn} />
        </div>
      </>
    );
  };

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
            onToggleTheme={() => setDarkMode((prev) => !prev)}
            onLogout={handleLogout}
          />
        ) : null}
      </div>
      {error ? <div className={styles.rejectionReason}>{error}</div> : null}
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
