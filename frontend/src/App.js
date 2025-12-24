import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

const API_URL = 'http://localhost:5000/api';

// Set up axios interceptor for token
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function StudentManagement() {
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', studentId: '', course: '', year: '' });
  const [editing, setEditing] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const response = await axios.get(`${API_URL}/students`);
      setStudents(response.data);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await axios.put(`${API_URL}/students/${editing}`, form);
        setEditing(null);
      } else {
        await axios.post(`${API_URL}/students`, form);
      }
      setForm({ name: '', email: '', studentId: '', course: '', year: '' });
      fetchStudents();
    } catch (error) {
      console.error('Error saving student:', error);
    }
  };

  const handleEdit = (student) => {
    setForm(student);
    setEditing(student._id);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_URL}/students/${id}`);
      fetchStudents();
    } catch (error) {
      console.error('Error deleting student:', error);
    }
  };

  const canModify = user?.role === 'admin' || user?.role === 'teacher';
  const canDelete = user?.role === 'admin';

  return (
    <div>
      <h2>Student Management</h2>
      
      <ProtectedRoute allowedRoles={['admin', 'teacher']}>
        <form onSubmit={handleSubmit} className="form">
          <input
            type="text"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({...form, name: e.target.value})}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({...form, email: e.target.value})}
            required
          />
          <input
            type="text"
            placeholder="Student ID"
            value={form.studentId}
            onChange={(e) => setForm({...form, studentId: e.target.value})}
            required
          />
          <input
            type="text"
            placeholder="Course"
            value={form.course}
            onChange={(e) => setForm({...form, course: e.target.value})}
          />
          <input
            type="number"
            placeholder="Year"
            value={form.year}
            onChange={(e) => setForm({...form, year: e.target.value})}
          />
          <button type="submit">{editing ? 'Update' : 'Add'} Student</button>
          {editing && <button type="button" onClick={() => {setEditing(null); setForm({ name: '', email: '', studentId: '', course: '', year: '' });}}>Cancel</button>}
        </form>
      </ProtectedRoute>

      <div className="students">
        <h3>Students ({students.length})</h3>
        {students.map(student => (
          <div key={student._id} className="student-card">
            <h4>{student.name}</h4>
            <p>ID: {student.studentId}</p>
            <p>Email: {student.email}</p>
            <p>Course: {student.course}</p>
            <p>Year: {student.year}</p>
            <div className="actions">
              {canModify && <button onClick={() => handleEdit(student)}>Edit</button>}
              {canDelete && <button onClick={() => handleDelete(student._id)}>Delete</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { user, logout } = useAuth();

  return (
    <div className="App">
      <header className="header">
        <h1>Student Management Portal</h1>
        <div className="user-info">
          <span>Welcome, {user?.firstName} ({user?.role})</span>
          <button onClick={logout} className="logout-btn">Logout</button>
        </div>
      </header>
      
      <ProtectedRoute>
        <StudentManagement />
      </ProtectedRoute>
    </div>
  );
}

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="auth-page">
      <div className="auth-container">
        {isLogin ? (
          <Login onToggle={() => setIsLogin(false)} />
        ) : (
          <Register onToggle={() => setIsLogin(true)} />
        )}
      </div>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return isAuthenticated ? <AuthenticatedApp /> : <AuthPage />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
