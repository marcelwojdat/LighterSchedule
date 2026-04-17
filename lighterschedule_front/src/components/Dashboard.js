import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Auth from './Auth';

const Dashboard = () => {
  const [workdays, setWorkdays] = useState([]); 
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
      
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

    fetchWorkdays();
  }, []); 

  const handleLogout = () => {
    localStorage.removeItem('access'); 
    navigate('/login'); 
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Twój Grafik Pracy</h1>
      <button onClick={handleLogout} style={{ marginBottom: '20px' }}>Wyloguj się</button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {workdays.length > 0 ? (
       <ul>
        {workdays.map((day, index) => (
            <li key={index}>
                <strong>{day.date}</strong> | {day.start_time} - {day.end_time} 
                (Stawka: {day.rate_at_time} zł)
            </li>
  ))}
</ul>
      ) : (
        <p>Brak zaplanowanych dni pracy lub trwa ładowanie...</p>
      )}
    </div>
  );
};

export default Dashboard;