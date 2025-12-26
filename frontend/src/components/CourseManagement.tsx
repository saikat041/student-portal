import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Course, CourseFormData, User } from '../types';

// Interface for enrolled student data from API
interface EnrolledStudentInfo {
  _id: string;
  studentId: string;
  major?: string;
  year?: number;
  gpa?: number;
  user?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface EnrollmentRecord {
  _id: string;
  student: EnrolledStudentInfo;
  enrollmentDate: string;
  status: string;
  credits: number;
  semester: string;
}

interface CourseEnrollmentResponse {
  course: {
    _id: string;
    courseCode: string;
    courseName: string;
    maxStudents: number;
    enrolledCount: number;
    availableSpots: number;
  };
  enrollments: EnrollmentRecord[];
}

const CourseManagement: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState<CourseFormData>({
    courseCode: '',
    courseName: '',
    description: '',
    credits: '',
    department: '',
    semester: '',
    maxStudents: ''
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [enrollmentData, setEnrollmentData] = useState<Record<string, EnrollmentRecord[]>>({});
  const [loadingEnrollments, setLoadingEnrollments] = useState<string | null>(null);
  const { user } = useAuth();

  /**
   * Calculate available spots for a course
   * Requirements: 7.1
   */
  const getAvailableSpots = (course: Course): number => {
    const enrolledCount = course.enrolledStudents?.length || 0;
    return Math.max(0, course.maxStudents - enrolledCount);
  };

  /**
   * Check if a course is full
   * Requirements: 7.1
   */
  const isCourseFull = (course: Course): boolean => {
    return getAvailableSpots(course) === 0;
  };

  /**
   * Check if a course has limited availability (< 5 spots)
   * Requirements: 7.2
   */
  const hasLimitedAvailability = (course: Course): boolean => {
    const spots = getAvailableSpots(course);
    return spots > 0 && spots < 5;
  };

  /**
   * Get enrollment percentage for progress bar
   * Requirements: 7.1
   */
  const getEnrollmentPercentage = (course: Course): number => {
    const enrolledCount = course.enrolledStudents?.length || 0;
    return course.maxStudents > 0 ? (enrolledCount / course.maxStudents) * 100 : 0;
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async (): Promise<void> => {
    try {
      setLoading(true);
      const endpoint = user?.role === 'teacher' ? '/api/courses/my-courses' : '/api/courses';
      const response = await axios.get<Course[]>(`http://localhost:5000${endpoint}`);
      setCourses(response.data);
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch enrollments for a specific course (for teacher/admin view)
   * Requirements: 5.1, 5.2, 5.3, 5.4
   */
  const fetchCourseEnrollments = async (courseId: string): Promise<void> => {
    try {
      setLoadingEnrollments(courseId);
      const response = await axios.get<CourseEnrollmentResponse>(
        `http://localhost:5000/api/enrollments/course/${courseId}`
      );
      setEnrollmentData(prev => ({
        ...prev,
        [courseId]: response.data.enrollments
      }));
    } catch (error) {
      console.error('Error fetching course enrollments:', error);
    } finally {
      setLoadingEnrollments(null);
    }
  };

  /**
   * Toggle enrollment roster visibility for a course
   */
  const toggleEnrollmentRoster = async (courseId: string): Promise<void> => {
    if (expandedCourse === courseId) {
      setExpandedCourse(null);
    } else {
      setExpandedCourse(courseId);
      // Fetch enrollments if not already loaded
      if (!enrollmentData[courseId]) {
        await fetchCourseEnrollments(courseId);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    try {
      setLoading(true);
      
      const courseData = {
        ...form,
        credits: parseInt(form.credits),
        maxStudents: parseInt(form.maxStudents) || 30
      };

      if (editing) {
        await axios.put(`http://localhost:5000/api/courses/${editing}`, courseData);
        setEditing(null);
      } else {
        await axios.post('http://localhost:5000/api/courses', courseData);
      }
      
      setForm({
        courseCode: '',
        courseName: '',
        description: '',
        credits: '',
        department: '',
        semester: '',
        maxStudents: ''
      });
      
      fetchCourses();
    } catch (error: any) {
      console.error('Error saving course:', error);
      alert(error.response?.data?.error || 'Error saving course');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (course: Course): void => {
    setForm({
      courseCode: course.courseCode,
      courseName: course.courseName,
      description: course.description,
      credits: course.credits.toString(),
      department: course.department,
      semester: course.semester,
      maxStudents: course.maxStudents.toString()
    });
    setEditing(course._id);
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm('Are you sure you want to delete this course?')) return;
    
    try {
      await axios.delete(`http://localhost:5000/api/courses/${id}`);
      fetchCourses();
    } catch (error: any) {
      console.error('Error deleting course:', error);
      alert(error.response?.data?.error || 'Error deleting course');
    }
  };

  const canModify = user?.role === 'admin' || user?.role === 'teacher';
  const canDelete = user?.role === 'admin';

  if (loading && courses.length === 0) {
    return <div className="loading">Loading courses...</div>;
  }

  return (
    <div className="course-management">
      <h2>Course Management</h2>
      
      {canModify && (
        <form onSubmit={handleSubmit} className="course-form">
          <div className="form-row">
            <input
              type="text"
              placeholder="Course Code (e.g., CS101)"
              value={form.courseCode}
              onChange={(e) => setForm({...form, courseCode: e.target.value})}
              required
            />
            <input
              type="text"
              placeholder="Course Name"
              value={form.courseName}
              onChange={(e) => setForm({...form, courseName: e.target.value})}
              required
            />
          </div>
          
          <textarea
            placeholder="Course Description"
            value={form.description}
            onChange={(e) => setForm({...form, description: e.target.value})}
            required
            rows={3}
          />
          
          <div className="form-row">
            <input
              type="number"
              placeholder="Credits"
              value={form.credits}
              onChange={(e) => setForm({...form, credits: e.target.value})}
              min="1"
              max="6"
              required
            />
            <input
              type="text"
              placeholder="Department"
              value={form.department}
              onChange={(e) => setForm({...form, department: e.target.value})}
              required
            />
          </div>
          
          <div className="form-row">
            <input
              type="text"
              placeholder="Semester (e.g., Fall 2024)"
              value={form.semester}
              onChange={(e) => setForm({...form, semester: e.target.value})}
              required
            />
            <input
              type="number"
              placeholder="Max Students"
              value={form.maxStudents}
              onChange={(e) => setForm({...form, maxStudents: e.target.value})}
              min="1"
            />
          </div>
          
          <div className="form-actions">
            <button type="submit" disabled={loading}>
              {editing ? 'Update Course' : 'Create Course'}
            </button>
            {editing && (
              <button 
                type="button" 
                onClick={() => {
                  setEditing(null);
                  setForm({
                    courseCode: '',
                    courseName: '',
                    description: '',
                    credits: '',
                    department: '',
                    semester: '',
                    maxStudents: ''
                  });
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="courses-grid">
        <h3>
          {user?.role === 'teacher' ? 'My Courses' : 'All Courses'} ({courses.length})
        </h3>
        
        {courses.map(course => {
          const availableSpots = getAvailableSpots(course);
          const isFull = isCourseFull(course);
          const limitedAvailability = hasLimitedAvailability(course);
          const enrolledCount = course.enrolledStudents?.length || 0;
          const enrollmentPercentage = getEnrollmentPercentage(course);

          return (
          <div 
            key={course._id} 
            className={`course-card ${isFull ? 'course-full' : ''} ${limitedAvailability ? 'limited-availability' : ''}`}
          >
            <div className="course-header">
              <h4>{course.courseCode}</h4>
              <span className="credits">{course.credits} Credits</span>
            </div>
            
            <h5>{course.courseName}</h5>
            <p className="description">{course.description}</p>
            
            <div className="course-details">
              <p><strong>Department:</strong> {course.department}</p>
              <p><strong>Semester:</strong> {course.semester}</p>
              <p><strong>Instructor:</strong> {course.instructor?.firstName} {course.instructor?.lastName}</p>
              
              {/* Enrollment count and available spots - Requirements 5.4, 7.1, 7.2 */}
              <div className="enrollment-summary">
                <div className="enrollment-stats">
                  <span className="enrolled-count">
                    {enrolledCount} / {course.maxStudents} enrolled
                  </span>
                  {isFull ? (
                    <span className="full-badge">Course Full</span>
                  ) : limitedAvailability ? (
                    <span className="limited-badge">Only {availableSpots} spots left!</span>
                  ) : (
                    <span className="available-spots">{availableSpots} spots available</span>
                  )}
                </div>
                
                {/* Enrollment progress bar - Requirement 7.1 */}
                <div className="enrollment-bar">
                  <div 
                    className={`enrollment-fill ${isFull ? 'full' : limitedAvailability ? 'limited' : ''}`}
                    style={{ width: `${enrollmentPercentage}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Enrollment roster toggle for teachers/admins - Requirements 5.1, 5.2, 5.3 */}
            {(user?.role === 'teacher' || user?.role === 'admin') && (
              <div className="enrollment-roster-section">
                <button
                  className="roster-toggle-btn"
                  onClick={() => toggleEnrollmentRoster(course._id)}
                >
                  {expandedCourse === course._id ? '▼ Hide' : '▶ Show'} Enrolled Students
                  ({course.enrolledStudents?.length || 0})
                </button>

                {expandedCourse === course._id && (
                  <div className="enrollment-roster">
                    {loadingEnrollments === course._id ? (
                      <p className="loading-text">Loading enrolled students...</p>
                    ) : enrollmentData[course._id]?.length === 0 ? (
                      /* Empty state - Requirement 5.3 */
                      <p className="no-enrollments">No students enrolled in this course yet.</p>
                    ) : (
                      /* Enrolled students list - Requirements 5.1, 5.2 */
                      <table className="enrollment-table">
                        <thead>
                          <tr>
                            <th>Student ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Enrolled Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enrollmentData[course._id]?.map(enrollment => (
                            <tr key={enrollment._id}>
                              <td>{enrollment.student.studentId}</td>
                              <td>
                                {enrollment.student.user?.firstName}{' '}
                                {enrollment.student.user?.lastName}
                              </td>
                              <td>{enrollment.student.user?.email}</td>
                              <td>
                                {new Date(enrollment.enrollmentDate).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {canModify && (
              <div className="course-actions">
                <button onClick={() => handleEdit(course)}>Edit</button>
                {canDelete && (
                  <button 
                    onClick={() => handleDelete(course._id)}
                    className="delete-btn"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
          );
        })}
        
        {courses.length === 0 && (
          <p className="no-courses">
            {user?.role === 'teacher' ? 'You have not created any courses yet.' : 'No courses available.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default CourseManagement;
