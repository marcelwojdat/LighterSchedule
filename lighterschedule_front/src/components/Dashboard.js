import React, { captureOwnerStack, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Auth from './Auth';
import styles from './Dashboard.module.css';


const Dashboard = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDates, setSelectedDates] = useState({});
  const [timeFrom, setTimeFrom] = useState("00:00");
  const [timeTo, setTimeTo] = useState("22:00");
  const [workdays, setWorkdays] = useState([]); 
  const [error, setError] = useState('');
  const [date, setDate] = useState([]);
  const navigate = useNavigate();

  const fetchWorkdays = async () => {
        let token = localStorage.getItem('access');

        try {
            let response = await fetch('http://127.0.0.1:8000/api/workdays/', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.status === 401) {
                console.log("Token wygasł, próbuję odświeżyć...");
        
                try {
                    token = await Auth.refreshToken(); 
          
                    response = await fetch('http://127.0.0.1:8000/api/workdays/', {
                        method: 'GET',
                        headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                        }
                });
                } catch (refreshErr) {
            Auth.logout();
            return;
                }
            }
            if (!response.ok) {
                throw new Error('Nie udało się pobrać grafika. Może token wygasł?');
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

  const setChosenDate = (e) => {
    const year = e.getFullYear();
    const month = String(e.getMonth() + 1).padStart(2, '0');
    const day = String(e.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    setSelectedDate(dateStr);
    setError('');
    setTimeFrom(selectedDates[dateStr]?.start_time?.slice(0, 5) || '12:00');
    setTimeTo(selectedDates[dateStr]?.end_time?.slice(0, 5) || '22:00');

    const existing = workdays.find(d => d.date === dateStr);
    if (existing && isPastDate(dateStr)) {
      setError('');
    }
  };

  const setChoosedHours = () => {
    if (!selectedDate) {
      setError('Wybierz dzień, aby ustawić godziny.');
      return;
    }

    const newSelectedDates = {
      ...selectedDates,
      [selectedDate]: {
        start_time: `${timeFrom}:00`,
        end_time: `${timeTo}:00`
      }
    };

    setSelectedDates(newSelectedDates);
    if (!date.includes(selectedDate)) {
      setDate([...date, selectedDate]);
    }
    setSelectedDate('');
    setError('');
  };

  const removeDateFromSelection = async (dateStr) => {
    const existing = workdays.find(d => d.date === dateStr);
    if (existing && isPastDate(dateStr)) {
      return;
    }

    if (existing) {
      let token = localStorage.getItem('access');
      try {
        let response = await fetch(`http://127.0.0.1:8000/api/workdays/${existing.id}/`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.status === 401) {
          try {
            token = await Auth.refreshToken();
            response = await fetch(`http://127.0.0.1:8000/api/workdays/${existing.id}/`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            });
          } catch (refreshErr) {
            Auth.logout();
            return;
          }
        }

        if (!response.ok) {
          throw new Error('Nie udało się usunąć dyspozycyjności.');
        }

        setWorkdays(prev => prev.filter(d => d.date !== dateStr));
      } catch (err) {
        setError(err.message || 'Błąd przy usuwaniu dyspozycyjności.');
        return;
      }
    }

    setSelectedDates(prev => {
      const updated = { ...prev };
      delete updated[dateStr];
      return updated;
    });
    setDate(prev => prev.filter(d => d !== dateStr));
    if (selectedDate === dateStr) {
      setSelectedDate('');
    }
  };

  const cancelSelection = () => {
    const existing = workdays.some(d => d.date === selectedDate);
    setSelectedDate('');
    setError('');
    setSelectedDates(prev => {
      if (existing) return prev;
      const updated = { ...prev };
      delete updated[selectedDate];
      return updated;
    });
  };

  const setSchedule = async () => {
    let token = localStorage.getItem('access');
    const userId = getUserIdFromToken();
    const requests = Object.entries(selectedDates).map(([oneDate, times]) => {
        const existing = workdays.find(d => d.date === oneDate);
        if (existing) {
            return fetch(`http://127.0.0.1:8000/api/workdays/${existing.id}/`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            }).then(async response => {
                if (response.ok) {
                    removeDateFromSelection(oneDate);
                }
                return response;
            });
        }
        return fetch('http://127.0.0.1:8000/api/workdays/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                date: oneDate, 
                start_time: times.start_time,
                end_time: times.end_time,
                employee: userId
            }),
        });
    });

    try {
        const responses = await Promise.all(requests);
        if (responses.every(r => r.status === 201 || r.status === 204)) {
            alert("Grafik zapisany pomyślnie!");
            setDate([]);
            setSelectedDates({});
            fetchWorkdays();
        } else {
            setError("Część dni nie została zapisana. Sprawdź czy grafik się nie dubluje.");
        }
    } catch (err) {
        setError("Błąd połączenia z serwerem.");
    }
};

  const handleLogout = () => {
    localStorage.removeItem('access'); 
    navigate('/login'); 
  };
  
  const getTileClassName = ({ date: tileDate, view }) => {
    if (view === 'month') {
        const year = tileDate.getFullYear();
        const month = String(tileDate.getMonth() + 1).padStart(2, '0');
        const day = String(tileDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const isSaved = workdays.some(d => d.date === dateStr);
        const isSelected = date.includes(dateStr);

        if (isSelected) return 'custom-selected-day';
        if (isSaved) return 'custom-saved-day';
    }
    return null;
};

  const getTileContent = ({ date: tileDate, view }) => {
    if (view !== 'month') return null;

    const year = tileDate.getFullYear();
    const month = String(tileDate.getMonth() + 1).padStart(2, '0');
    const day = String(tileDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const selected = selectedDates[dateStr];
    if (selected) {
      return (
        <div className={styles.tileContent}>
          <div>
            {selected.start_time.slice(0, 5)} - {selected.end_time.slice(0, 5)}
          </div>
        </div>
      );
    }

    const saved = workdays.find(d => d.date === dateStr);
    if (saved) {
      return (
        <div className={styles.tileContent}>
          <div>
            {saved.start_time.slice(0, 5)} - {saved.end_time.slice(0, 5)}
          </div>
        </div>
      );
    }

    return null;
  };

const getUserIdFromToken = () => {
    const token = localStorage.getItem('access');
    if (!token) return null;
    try {
        const base64Url = token.split('.')[1]; 
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(window.atob(base64));
        return payload.user_id; 
    } catch (e) {
        return null;
    }
};
  
  useEffect(() => {
    fetchWorkdays();
  }, []); 
const selectedDayExists =
  selectedDates[selectedDate] ||
  workdays.some(d => d.date === selectedDate);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Twój Grafik Pracy</h1>
      {selectedDate ? (
        <div className={styles.popupBackdrop} onClick={cancelSelection}>
          <div className={styles.popupBox} onClick={(e) => e.stopPropagation()}>
            {selectedDayExists && !isPastDate(selectedDate) ? (
              <>
                <h2 className={styles.popupTitle}>Usuń grafik z {selectedDate}?</h2>
                <p>Jeśli klikniesz <strong>Usuń</strong>, dzień zostanie usunięty z deklaracji.</p>
                <div className={styles.popupButtons}>
                  <input type="button" className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} onClick={cancelSelection} value="Wróć"/>
                  <input type="button" className={`${styles.popupBtn} ${styles.popupBtnDanger}`} onClick={() => removeDateFromSelection(selectedDate)} value="Usuń" />
                </div>
              </>
            ) : selectedDayExists && isPastDate(selectedDate) ? (
              <>
                <h2 className={styles.popupTitle}>Nie można usuwać przeszłych dni</h2>
                <p>Wybrany dzień {selectedDate} już minął i nie można go usunąć.</p>
                <div className={styles.popupButtons}>
                  <input type="button" className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} onClick={cancelSelection} value="Wróć"/>
                </div>
              </>
            ) : (
              <>
                <h2 className={styles.popupTitle}>{selectedDate}</h2>
                <p>Wybierz godziny pracy</p>
                <div className={styles.popupField}>
                  <input type="time" onChange={e => setTimeFrom(e.target.value)} value={timeFrom} />
                  <input type="time" onChange={e => setTimeTo(e.target.value)} value={timeTo} />
                </div>
                <div className={styles.popupButtons}>
                  <button className={styles.popupBtn} onClick={setChoosedHours}>
                    Zatwierdź
                  </button>
                  <button className={`${styles.popupBtn} ${styles.popupBtnSecondary}`} onClick={cancelSelection}>
                    Wróć
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      
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
    <div className={styles.buttonContainer}>
      <input type='button' onClick={setSchedule} value="Zapisz grafik" className={styles.scheduleSetBtn}/>
      <input type='button' onClick={handleLogout} value="Wyloguj się" className={styles.scheduleSetBtn}/>
    </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* {workdays.length > 0 ? (
    <ul>
        {[...workdays]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map((day, index) => (
                <li key={index}>
                    <strong>{day.date}</strong> | {day.start_time} - {day.end_time} 
                    (Stawka: {day.rate_at_time} zł)
                </li>
            ))
        }
    </ul>
) : (
    <p>Brak zaplanowanych dni pracy lub trwa ładowanie...</p>
)} */}

    </div>
  );
};

export default Dashboard;