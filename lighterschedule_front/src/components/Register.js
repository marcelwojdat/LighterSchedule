import React, { useState } from 'react';
import Auth from './Auth';
import { useNavigate } from 'react-router-dom';

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await Auth.register(username, password);
      setMessage('Rejestracja udana! Teraz możesz się zalogować.');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setMessage('Błąd rejestracji. Może taki użytkownik już istnieje?');
      console.log(err)
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Zarejestruj się</h2>
      <form onSubmit={handleRegister}>
        <input 
          type="text" 
          placeholder="Nowy login" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)} 
        />
        <br /><br />
        <input 
          type="password" 
          placeholder="Nowe hasło" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
        />
        <br /><br />
        <button type="submit">Załóż konto</button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
};

export default Register;