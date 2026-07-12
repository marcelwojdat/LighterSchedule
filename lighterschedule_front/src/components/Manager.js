import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Auth from './Auth';
import styles from './Manager.module.css';

const Manager = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [statsMonth, setStatsMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [workdays, setWorkdays] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [timeFrom, setTimeFrom] = useState('12:00');
  const [timeTo, setTimeTo] = useState('20:00');
  const [selectedDates, setSelectedDates] = useState({});
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchEmployees = async () => {
    let token = localStorage.getItem('access');
    try {
      let res = await fetch('http://127.0.0.1:8000/api/users/', {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        token = await Auth.refreshToken();
        res = await fetch('http://127.0.0.1:8000/api/users/', {
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
      }
      if (!res.ok) throw new Error('Nie udało się pobrać listy pracowników');
      const data = await res.json();
      setEmployees(data);
    } catch (e) {
      setError(e.message);
    }
  };

  const fetchWorkdaysForEmployee = async (employeeId) => {
    let token = localStorage.getItem('access');
    try {
      let res = await fetch(`http://127.0.0.1:8000/api/workdays/?employee=${employeeId}`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        token = await Auth.refreshToken();
        res = await fetch(`http://127.0.0.1:8000/api/workdays/?employee=${employeeId}`, {
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
      }
      if (!res.ok) throw new Error('Nie udało się pobrać grafiku pracownika');
      const data = await res.json();
      setWorkdays(data);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const openManage = (employee) => {
    setSelectedEmployee(employee);
    setSelectedDates({});
    fetchWorkdaysForEmployee(employee.id);
  };

  const setChosenDate = (e) => {
    const year = e.getFullYear();
    const month = String(e.getMonth() + 1).padStart(2, '0');
    const day = String(e.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    setSelectedDate(dateStr);
    setTimeFrom(selectedDates[dateStr]?.start_time?.slice(0,5) || '12:00');
    setTimeTo(selectedDates[dateStr]?.end_time?.slice(0,5) || '20:00');
  };

  const addShift = () => {
    if (!selectedEmployee || !selectedDate) return;
    const newSel = {
      ...selectedDates,
      [selectedDate]: { start_time: `${timeFrom}:00`, end_time: `${timeTo}:00` }
    };
    setSelectedDates(newSel);
  };

  const saveShifts = async () => {
    if (!selectedEmployee) return;
    let token = localStorage.getItem('access');
    const requests = Object.entries(selectedDates).map(([d, times]) => {
      return fetch('http://127.0.0.1:8000/api/workdays/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ date: d, start_time: times.start_time, end_time: times.end_time, employee: selectedEmployee.id })
      });
    });
    try {
      const res = await Promise.all(requests);
      if (res.every(r => r.ok || r.status === 201)) {
        fetchWorkdaysForEmployee(selectedEmployee.id);
        setSelectedDates({});
        setSelectedDate('');
        alert('Grafik pracownika zapisany.');
      } else {
        setError('Część zapisów nie powiodła się.');
      }
    } catch (e) { setError(e.message); }
  };

  const updateRate = async (employeeId, value) => {
    let token = localStorage.getItem('access');
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/users/${employeeId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ hourly_rate: value })
      });
      if (res.status === 401) {
        token = await Auth.refreshToken();
      }
      if (!res.ok) throw new Error('Nie udało się zaktualizować stawki');
      fetchEmployees();
      if (selectedEmployee && selectedEmployee.id === employeeId) {
        const updated = await res.json();
        setSelectedEmployee(prev => ({ ...prev, hourly_rate: updated.hourly_rate }));
      }
    } catch (e) { setError(e.message); }
  };

  const totalForMonth = () => {
    const [year, month] = statsMonth.split('-');
    const prefix = `${year}-${month}-`;
    const monthWorkdays = workdays.filter(d => d.date.startsWith(prefix));
    const totalHours = monthWorkdays.reduce((s, d) => s + Number(d.total_hours || 0), 0);
    const totalEarnings = monthWorkdays.reduce((s, d) => s + Number(d.earnings || 0), 0);
    return { totalHours, totalEarnings };
  };

  const monthStats = totalForMonth();

  const handleLogout = () => { localStorage.removeItem('access'); navigate('/login'); };

  return (
    <div className={styles.managerPage}>
      <h1 className={styles.managerTitle}>Panel Menadżera — Zarządzanie Pracownikami</h1>

      <div className={styles.managerBody}>
        <div className={styles.leftCol}>
          <div className={styles.sectionCard}>
            <h3>Statystyki ogólne</h3>
            <div className={styles.statRow}><strong>Pracownicy:</strong> {employees.length}</div>
            <div className={styles.statRow}><strong>Godziny w miesiącu:</strong> {monthStats.totalHours.toFixed(2)}</div>
            <div className={styles.statRow}><strong>Wypłaty w miesiącu:</strong> {monthStats.totalEarnings.toFixed(2)} zł</div>
            <div className={styles.sectionFooter}>
              <label>Wybierz miesiąc</label>
              <input type="month" value={statsMonth} onChange={(e) => setStatsMonth(e.target.value)} />
            </div>
          </div>

          <div className={styles.sectionCard}>
            <h3>Lista pracowników</h3>
            <div className={styles.tableWrap}>
              <table className={styles.empTable}>
                <thead>
                  <tr><th>Imię</th><th>Email</th><th>Stawka (zł/h)</th><th>Akcje</th></tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.id}>
                      <td>{emp.first_name} {emp.last_name}</td>
                      <td>{emp.email}</td>
                      <td>
                        <input type="number" step="0.01" defaultValue={emp.hourly_rate || ''} onBlur={(e) => updateRate(emp.id, e.target.value)} />
                      </td>
                      <td>
                        <button className={styles.btnPrimary} onClick={() => openManage(emp)}>Zarządzaj grafik</button>
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
            {!selectedEmployee ? <p>Wybierz pracownika z listy, aby zarządzać jego grafikiem i stawką.</p> : (
              <>
                <div className={styles.empHeader}>{selectedEmployee.first_name} {selectedEmployee.last_name}</div>
                <div className={styles.empInfo}><strong>Email:</strong> {selectedEmployee.email}</div>
                <div className={styles.empInfo}><strong>Stawka:</strong> {selectedEmployee.hourly_rate || '—'} zł/h</div>

                <div className={styles.calendarContainer}>
                  <Calendar onChange={setChosenDate} value={null} />
                </div>

                <div className={styles.shiftControls}>
                  <div>Wybrany dzień: {selectedDate || '—'}</div>
                  <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
                  <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
                  <button className={styles.btnPrimary} onClick={addShift}>Dodaj zmianę</button>
                  <button className={styles.btnPrimary} onClick={saveShifts}>Zapisz zmiany</button>
                </div>

                <div className={styles.sectionCard}>
                  <h4>Aktualny grafik</h4>
                  <ul>
                    {workdays.map(w => (
                      <li key={w.id}>{w.date} — {w.start_time.slice(0,5)} - {w.end_time.slice(0,5)}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={styles.footerActions}>
        <button className={styles.scheduleSetBtn} onClick={handleLogout}>Wyloguj się</button>
      </div>
      {error && <div className={styles.errorBox}>{error}</div>}
    </div>
  );
};

export default Manager;
