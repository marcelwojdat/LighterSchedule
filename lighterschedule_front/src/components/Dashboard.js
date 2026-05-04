import React, { captureOwnerStack, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import Auth from './Auth';
import styles from './Dashboard.module.css';

const Dashboard = () => {
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

  const setChosenDate = (e) => {
    const year = e.getFullYear();
    const month = String(e.getMonth() + 1).padStart(2, '0');
    const day = String(e.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    if (date.includes(dateStr)) {
        setDate(date.filter(d => d !== dateStr));
    } else {
        setDate([...date, dateStr]);    
    }
};

    const setSchedule = async () => {
    let token = localStorage.getItem('access');
    const userId = getUserIdFromToken();
    const requests = date.map(oneDate => {
        return fetch('http://127.0.0.1:8000/api/workdays/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                date: oneDate, 
                start_time: "12:00:00",
                end_time: "22:00:00",
                employee: userId
            }),
        });
    });

    try {
        const responses = await Promise.all(requests);
        if (responses.every(r => r.status === 201)) {
            alert("Grafik zapisany pomyślnie!");
            setDate([]); 
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


  return (
    <div style={{ padding: '20px' }}>
      <h1>Twój Grafik Pracy</h1>
      <div className={styles.calendarWrapper}>
        <div className={styles.calendarContainer}>
            <Calendar 
                onChange={setChosenDate} 
                value={null} 
                tileClassName={getTileClassName} 
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