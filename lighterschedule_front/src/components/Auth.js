const BASE_URL = 'http://127.0.0.1:8000/api';

const Auth = {
  async register(username, password) {
    try {
      const response = await fetch(`${BASE_URL}/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('Błąd podczas rejestracji');
      }

      return await response.json();
    } catch (error) {
      console.error('Register Error:', error);
      throw error;
    }
  },
 
  async login(username, password) {
    try {
      const response = await fetch(`${BASE_URL}/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('Nieprawidłowe dane logowania');
      }

      const data = await response.json();

      if (data.access) {
        localStorage.setItem('access', data.access);
        localStorage.setItem('refresh', data.refresh);
        console.log('Token został zapisany!');
      }

      return data;
    } catch (error) {
      console.error('Login Error:', error);
      throw error;
    }
  },

  async refreshToken() {
  const refresh = localStorage.getItem('refresh');
  const response = await fetch(`${BASE_URL}/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh })
  });
  const data = await response.json();
  if (data.access) {
    localStorage.setItem('access', data.access);
    return data.access;
  }
  throw new Error("Sesja wygasła całkowicie");
  },

  async fetchCurrentUser() {
    let token = localStorage.getItem('access');
    if (!token) {
      throw new Error('Brak tokenu');
    }

    let response = await fetch(`${BASE_URL}/me/`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      token = await this.refreshToken();
      response = await fetch(`${BASE_URL}/me/`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
    }

    if (!response.ok) {
      throw new Error('Nie udało się pobrać profilu użytkownika');
    }

    return response.json();
  },

  logout() {
    localStorage.removeItem('access');
    window.location.href = '/login'; 
  },

  isAuthenticated() {
    return !!localStorage.getItem('access');
  }
};

export default Auth;