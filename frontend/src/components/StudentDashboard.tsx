import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Enrollment, Course, User } from '../types';

interface EnrolledCourse extends Course {
  instructor: User;
}

interface EnrollmentWithCourse extends Omit<Enrollment, 'course'> {
  course: EnrolledCourse;
}

interface EnrollmentResponse {
  enrollments: EnrollmentWithCourse[];
  totalCredits: number;
  maxCredits: number;
}

const StudentDashboard: React.FC = () => {
  const [enrollments, setEnrollments] = useState<EnrollmentWithCourse[]>([]);
  const [totalCredits, setTotalCredits] = useState<number>(0);
  const [maxCredits, setMaxCredits] = useState<number>(18);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dropConfirm, setDropConfirm] = useState<string | null>(null);
  const [dropping, setDropping] = useState<boolean>(false);
  const { user } = useAuth();

  useEffect(() => {
    fetchEnrollments();
  }, []);

  const fetchEnrollments = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get<EnrollmentResponse>(
        'http://localhost:5000/api/enrollments/my-courses'
      );
      setEnrollments(response.data.enrollments);
      setTotalCredits(response.data.totalCredits);
      setMaxCredits(response.data.maxCredits);
    } catch (err: any) {
      console.error('Error fetching enrollments:', err);
      setError(err.response?.data?.error || 'Failed to load enrolled courses');
    } finally {
      setLoading(false);
    }
  };

  const handleDropCourse = async (courseId: string): Promise<void> => {
    try {
      setDropping(true);
      await axios.delete(`http://localhost:5000/api/enrollments/${courseId}`);
      setDropConfirm(null);
      // Refresh enrollments after dropping
      await fetchEnrollments();
    } catch (err: any) {
      console.error('Error dropping course:', err);
      setError(err.response?.data?.error || 'Failed to drop course');
    } finally {
      setDropping(false);
    }
  };


  /**
   * Calculate total credits from enrollments
   * This is used for display and validation purposes
   * Requirements: 3.4, 4.5
   */
  const calculateTotalCredits = (enrollmentList: EnrollmentWithCourse[]): number => {
    return enrollmentList.reduce((sum, enrollment) => sum + enrollment.credits, 0);
  };

  if (loading) {
    return <div className="loading">Loading your enrolled courses...</div>;
  }

  return (
    <div className="student-dashboard">
      <div className="dashboard-header">
        <h2>My Enrolled Courses</h2>
        <div className="credit-summary">
          <span className="credit-label">Total Credits:</span>
          <span className="credit-value">
            {totalCredits} / {maxCredits}
          </span>
          <div className="credit-bar">
            <div 
              className="credit-fill" 
              style={{ width: `${Math.min((totalCredits / maxCredits) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
        </div>
      )}

      {/* Empty state message - Requirement 3.3 */}
      {enrollments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h3>No Enrolled Courses</h3>
          <p>You haven't enrolled in any courses yet. Browse the course catalog to find courses that interest you!</p>
        </div>
      ) : (
        <div className="enrolled-courses-grid">
          {enrollments.map((enrollment) => (
            <div key={enrollment._id} className="enrolled-course-card">
              <div className="course-header">
                <h4>{enrollment.course.courseCode}</h4>
                <span className="credits">{enrollment.course.credits} Credits</span>
              </div>
              
              <h5>{enrollment.course.courseName}</h5>
              <p className="description">{enrollment.course.description}</p>
              
              <div className="course-details">
                <p>
                  <strong>Instructor:</strong>{' '}
                  {enrollment.course.instructor?.firstName} {enrollment.course.instructor?.lastName}
                </p>
                <p><strong>Department:</strong> {enrollment.course.department}</p>
                <p><strong>Semester:</strong> {enrollment.course.semester}</p>
                <p>
                  <strong>Enrolled:</strong>{' '}
                  {new Date(enrollment.enrollmentDate).toLocaleDateString()}
                </p>
              </div>

              {/* Drop course with confirmation - Requirements 4.1, 4.3 */}
              <div className="course-actions">
                {dropConfirm === enrollment.course._id ? (
                  <div className="confirm-drop">
                    <span>Are you sure you want to drop this course?</span>
                    <div className="confirm-buttons">
                      <button
                        onClick={() => handleDropCourse(enrollment.course._id)}
                        className="confirm-yes"
                        disabled={dropping}
                      >
                        {dropping ? 'Dropping...' : 'Yes, Drop'}
                      </button>
                      <button
                        onClick={() => setDropConfirm(null)}
                        className="confirm-no"
                        disabled={dropping}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setDropConfirm(enrollment.course._id)}
                    className="drop-btn"
                  >
                    Drop Course
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;

// Export utility function for testing
export { };
export type { EnrollmentWithCourse, EnrollmentResponse };
