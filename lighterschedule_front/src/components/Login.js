import React, { useState } from 'react';
import Auth from './Auth';
import { useNavigate, Link } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const navigate = useNavigate(); 

  const handleSubmit = async (e) => {
    e.preventDefault(); 
    setError('');

    try {
      await Auth.login(username, password);
      
      navigate('/dashboard');
    } catch (err) {
      setError('Błędny login lub hasło!');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Zaloguj się</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Login: </label>
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
          />
        </div>
        <br />
        <div>
          <label>Hasło: </label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
          />
        </div>
        <br />
        <button type="submit">Zaloguj</button>
      </form>
    <p>Nie masz konta? <Link to="/register">Zarejestruj się tutaj</Link></p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};

export default Login;