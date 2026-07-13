import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Auth from './Auth';
import styles from './Manager.module.css';

const STATUS_LABELS = {
  proposed: 'Oczekuje',
  approved: 'Zatwierdzony',
  rejected: 'Odrzucony',
};

const Manager = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [statsMonth, setStatsMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [workdays, setWorkdays] = useState([]);
  const [pendingQueue, setPendingQueue] = useState([]);
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

  const fetchEmployees = async () => {
    try {
      const res = await authFetch('http://127.0.0.1:8000/api/users/');
      if (!res.ok) throw new Error('Nie udało się pobrać listy pracowników');
      const data = await res.json();
      setEmployees(data.filter((emp) => !emp.is_manager));
    } catch (e) {
      setError(e.message);
    }
  };

  const fetchPendingQueue = async () => {
    try {
      const res = await authFetch('http://127.0.0.1:8000/api/workdays/?status=proposed');
      if (!res.ok) throw new Error('Nie udało się pobrać kolejki akceptacji');
      const data = await res.json();
      const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
      setPendingQueue(sorted);
    } catch (e) {
      setError(e.message);
    }
  };

  const fetchWorkdaysForEmployee = async (employeeId) => {
    try {
      const res = await authFetch(`http://127.0.0.1:8000/api/workdays/?employee=${employeeId}`);
      if (!res.ok) throw new Error('Nie udało się pobrać grafiku pracownika');
      const data = await res.json();
      setWorkdays(data);
    } catch (e) {
      setError(e.message);
    }
  };

  const refreshData = async (employeeId = selectedEmployee?.id) => {
    await Promise.all([
      fetchEmployees(),
      fetchPendingQueue(),
      employeeId ? fetchWorkdaysForEmployee(employeeId) : Promise.resolve(),
    ]);
  };

  useEffect(() => {
    refreshData();
  }, []);

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
    } else if (existing) {
      setTimeFrom(existing.start_time.slice(0, 5));
      setTimeTo(existing.end_time.slice(0, 5));
    } else {
      setTimeFrom('12:00');
      setTimeTo('20:00');
    }
  };

  const addShift = () => {
    if (!selectedEmployee || !selectedDate) return;
    setSelectedDates({
      ...selectedDates,
      [selectedDate]: {
        start_time: `${timeFrom}:00`,
        end_time: `${timeTo}:00`,
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

          if (existing?.status === 'proposed') {
            const res = await authFetch(
              `http://127.0.0.1:8000/api/workdays/${existing.id}/approve/`,
              {
                method: 'POST',
                body: JSON.stringify({
                  start_time: times.start_time,
                  end_time: times.end_time,
                }),
              }
            );
            return res.ok;
          }

          if (existing?.status === 'rejected') {
            await authFetch(`http://127.0.0.1:8000/api/workdays/${existing.id}/`, {
              method: 'DELETE',
            });
          }

          if (existing?.status === 'approved') {
            const res = await authFetch(`http://127.0.0.1:8000/api/workdays/${existing.id}/`, {
              method: 'PATCH',
              body: JSON.stringify({
                start_time: times.start_time,
                end_time: times.end_time,
              }),
            });
            return res.ok;
          }

          const res = await authFetch('http://127.0.0.1:8000/api/workdays/', {
            method: 'POST',
            body: JSON.stringify({
              date,
              start_time: times.start_time,
              end_time: times.end_time,
              employee: selectedEmployee.id,
            }),
          });
          return res.ok || res.status === 201;
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
      setError(e.message);
    }
  };

  const updateRate = async (employeeId, value) => {
    if (value === '' || Number.isNaN(Number(value))) return;

    try {
      const res = await authFetch(`http://127.0.0.1:8000/api/users/${employeeId}/profile/`, {
        method: 'PATCH',
        body: JSON.stringify({ hourly_rate: value }),
      });
      if (!res.ok) throw new Error('Nie udało się zaktualizować stawki');

      const updated = await res.json();
      setEmployees((prev) =>
        prev.map((emp) => (emp.id === employeeId ? { ...emp, hourly_rate: updated.hourly_rate } : emp))
      );
      if (selectedEmployee?.id === employeeId) {
        setSelectedEmployee((prev) => ({ ...prev, hourly_rate: updated.hourly_rate }));
      }
      setSuccess('Stawka godzinowa zaktualizowana.');
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  const startQueueEdit = (item) => {
    setEditingQueueId(item.id);
    setQueueEditTimes({
      start: item.start_time.slice(0, 5),
      end: item.end_time.slice(0, 5),
    });
    setRejectingId(null);
    setError('');
  };

  const cancelQueueEdit = () => {
    setEditingQueueId(null);
    setRejectingId(null);
    setRejectionReason('');
  };

  const approveQueueItem = async (item, times = null) => {
    const startTime = times?.start_time || `${queueEditTimes.start}:00`;
    const endTime = times?.end_time || `${queueEditTimes.end}:00`;

    try {
      const res = await authFetch(`http://127.0.0.1:8000/api/workdays/${item.id}/approve/`, {
        method: 'POST',
        body: JSON.stringify({
          start_time: startTime,
          end_time: endTime,
        }),
      });
      if (!res.ok) throw new Error('Nie udało się zatwierdzić deklaracji.');

      setSuccess(`Zatwierdzono grafik ${item.employee_name} na ${item.date}.`);
      setError('');
      cancelQueueEdit();
      await refreshData(selectedEmployee?.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const rejectQueueItem = async (item) => {
    try {
      const res = await authFetch(`http://127.0.0.1:8000/api/workdays/${item.id}/reject/`, {
        method: 'POST',
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      });
      if (!res.ok) throw new Error('Nie udało się odrzucić deklaracji.');

      setSuccess(`Odrzucono deklarację ${item.employee_name} na ${item.date}.`);
      setError('');
      cancelQueueEdit();
      await refreshData(selectedEmployee?.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const totalForMonth = () => {
    const [year, month] = statsMonth.split('-');
    const prefix = `${year}-${month}-`;
    const approved = workdays.filter((d) => d.date.startsWith(prefix) && d.status === 'approved');
    const totalHours = approved.reduce((s, d) => s + Number(d.total_hours || 0), 0);
    const totalEarnings = approved.reduce((s, d) => s + Number(d.earnings || 0), 0);
    return { totalHours, totalEarnings };
  };

  const monthStats = totalForMonth();

  const handleLogout = () => {
    localStorage.removeItem('access');
    navigate('/login');
  };

  const getEmployeeName = (item) => {
    const emp = employees.find((e) => e.id === item.employee);
    if (emp) return `${emp.first_name} ${emp.last_name}`.trim() || emp.username;
    return item.employee_name;
  };

  return (
    <div className={styles.managerPage}>
      <h1 className={styles.managerTitle}>Panel Kierownika</h1>

      {error ? <div className={styles.errorBox}>{error}</div> : null}
      {success ? <div className={styles.successBox}>{success}</div> : null}

      <div className={styles.managerBody}>
        <div className={styles.leftCol}>
          <div className={styles.sectionCard}>
            <h3>Statystyki pracownika</h3>
            <div className={styles.statRow}>
              <strong>Pracownicy:</strong> {employees.length}
            </div>
            <div className={styles.statRow}>
              <strong>Oczekujące deklaracje:</strong> {pendingQueue.length}
            </div>
            <div className={styles.statRow}>
              <strong>Godziny (zatwierdzone):</strong> {monthStats.totalHours.toFixed(2)}
            </div>
            <div className={styles.statRow}>
              <strong>Wypłaty (zatwierdzone):</strong> {monthStats.totalEarnings.toFixed(2)} zł
            </div>
            <div className={styles.sectionFooter}>
              <label>Wybierz miesiąc</label>
              <input type="month" value={statsMonth} onChange={(e) => setStatsMonth(e.target.value)} />
            </div>
            <small className={styles.statHint}>
              Godziny i wypłaty dotyczą wybranego pracownika i tylko zatwierdzonych dni.
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
                      </div>
                    ) : (
                      <div className={styles.queueHours}>
                        {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
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
            <h3>Lista pracowników</h3>
            <div className={styles.tableWrap}>
              <table className={styles.empTable}>
                <thead>
                  <tr>
                    <th>Imię</th>
                    <th>Email</th>
                    <th>Stawka (zł/h)</th>
                    <th>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id}>
                      <td>
                        {emp.first_name} {emp.last_name}
                      </td>
                      <td>{emp.email || '—'}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={emp.hourly_rate ?? ''}
                          onBlur={(e) => updateRate(emp.id, e.target.value)}
                        />
                      </td>
                      <td>
                        <button className={styles.btnPrimary} onClick={() => openManage(emp)}>
                          Zarządzaj grafikiem
                        </button>
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

      <div className={styles.footerActions}>
        <button className={styles.scheduleSetBtn} onClick={handleLogout}>
          Wyloguj się
        </button>
      </div>
    </div>
  );
};

export default Manager;
