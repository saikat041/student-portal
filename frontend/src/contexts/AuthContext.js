import React, { createContext, useContext, useReducer, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      localStorage.setItem('token', action.payload.token);
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        loading: false
      };
    case 'LOGOUT':
      localStorage.removeItem('token');
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false
      };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'AUTH_ERROR':
      localStorage.removeItem('token');
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: action.payload
      };
    default:
      return state;
  }
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, {
    isAuthenticated: false,
    user: null,
    token: localStorage.getItem('token'),
    loading: true,
    error: null
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      loadUser();
    } else {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const loadUser = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/profile');
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user: response.data, token: localStorage.getItem('token') }
      });
    } catch (error) {
      dispatch({ type: 'AUTH_ERROR', payload: error.response?.data?.error });
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', {
        email,
        password
      });
      
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      dispatch({ type: 'LOGIN_SUCCESS', payload: response.data });
      return { success: true };
    } catch (error) {
      dispatch({ type: 'AUTH_ERROR', payload: error.response?.data?.error });
      return { success: false, error: error.response?.data?.error };
    }
  };

  const register = async (userData) => {
    try {
      const response = await axios.post('http://localhost:5000/api/auth/register', userData);
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      dispatch({ type: 'LOGIN_SUCCESS', payload: response.data });
      return { success: true };
    } catch (error) {
      dispatch({ type: 'AUTH_ERROR', payload: error.response?.data?.error });
      return { success: false, error: error.response?.data?.error };
    }
  };

  const logout = () => {
    delete axios.defaults.headers.common['Authorization'];
    dispatch({ type: 'LOGOUT' });
  };

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      register,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
