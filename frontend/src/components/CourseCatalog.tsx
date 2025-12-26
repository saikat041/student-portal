import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Course, User } from '../types';

interface CourseWithInstructor extends Omit<Course, 'instructor'> {
  instructor: User;
}

interface CourseFilters {
  department: string;
  semester: string;
  searchQuery: string;
}

const CourseCatalog: React.FC = () => {
  const [courses, setCourses] = useState<CourseWithInstructor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<CourseFilters>({
    department: '',
    semester: '',
    searchQuery: ''
  });
  const { user } = useAuth();

  // Extract unique departments and semesters for filter dropdowns
  const departments = useMemo((): string[] => {
    const depts: string[] = Array.from(new Set(courses.map((c: CourseWithInstructor) => c.department)));
    return depts.sort();
  }, [courses]);

  const semesters = useMemo((): string[] => {
    const sems: string[] = Array.from(new Set(courses.map((c: CourseWithInstructor) => c.semester)));
    return sems.sort();
  }, [courses]);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get<CourseWithInstructor[]>(
        'http://localhost:5000/api/courses'
      );
      setCourses(response.data);
    } catch (err: any) {
      console.error('Error fetching courses:', err);
      setError(err.response?.data?.error || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Filter courses based on department, semester, and search query
   * Requirements: 1.4, 1.5
   */
  const filteredCourses = useMemo((): CourseWithInstructor[] => {
    return courses.filter((course: CourseWithInstructor) => {
      // Filter by department (Requirement 1.4)
      if (filters.department && course.department !== filters.department) {
        return false;
      }

      // Filter by semester (Requirement 1.4)
      if (filters.semester && course.semester !== filters.semester) {
        return false;
      }

      // Search by course code, name, or description (Requirement 1.5)
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesCode = course.courseCode.toLowerCase().includes(query);
        const matchesName = course.courseName.toLowerCase().includes(query);
        const matchesDescription = course.description.toLowerCase().includes(query);
        
        if (!matchesCode && !matchesName && !matchesDescription) {
          return false;
        }
      }

      return true;
    });
  }, [courses, filters]);

  /**
   * Calculate available spots for a course
   */
  const getAvailableSpots = (course: CourseWithInstructor): number => {
    const enrolledCount = course.enrolledStudents?.length || 0;
    return Math.max(0, course.maxStudents - enrolledCount);
  };

  /**
   * Check if a course is full (Requirement 1.3)
   */
  const isCourseFull = (course: CourseWithInstructor): boolean => {
    return getAvailableSpots(course) === 0;
  };

  /**
   * Check if a course has limited availability (< 5 spots)
   */
  const hasLimitedAvailability = (course: CourseWithInstructor): boolean => {
    const spots = getAvailableSpots(course);
    return spots > 0 && spots < 5;
  };

  /**
   * Handle course enrollment (Requirement 2.1)
   */
  const handleEnroll = async (courseId: string): Promise<void> => {
    try {
      setEnrolling(courseId);
      setError(null);
      setSuccessMessage(null);

      // Get current semester and academic year
      const now = new Date();
      const month = now.getMonth();
      const year = now.getFullYear();
      const semester = month >= 8 ? 'Fall' : month >= 5 ? 'Summer' : 'Spring';
      const academicYear = month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

      await axios.post('http://localhost:5000/api/enrollments', {
        courseId,
        semester: `${semester} ${year}`,
        academicYear
      });

      setSuccessMessage('Successfully enrolled in course!');
      // Refresh courses to update enrollment counts
      await fetchCourses();
    } catch (err: any) {
      console.error('Error enrolling in course:', err);
      setError(err.response?.data?.error || 'Failed to enroll in course');
    } finally {
      setEnrolling(null);
    }
  };

  const handleFilterChange = (field: keyof CourseFilters, value: string): void => {
    setFilters((prev: CourseFilters) => ({ ...prev, [field]: value }));
  };

  const clearFilters = (): void => {
    setFilters({ department: '', semester: '', searchQuery: '' });
  };

  if (loading) {
    return <div className="loading">Loading course catalog...</div>;
  }

  return (
    <div className="course-catalog">
      <div className="catalog-header">
        <h2>Course Catalog</h2>
        <span className="course-count">{filteredCourses.length} courses available</span>
      </div>

      {/* Success message - Requirement 2.5 */}
      {successMessage && (
        <div className="success-message">
          {successMessage}
          <button onClick={() => setSuccessMessage(null)} className="dismiss-btn">×</button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
        </div>
      )}

      {/* Filters - Requirements 1.4, 1.5 */}
      <div className="catalog-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by course code, name, or description..."
            value={filters.searchQuery}
            onChange={(e) => handleFilterChange('searchQuery', e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-row">
          <select
            value={filters.department}
            onChange={(e) => handleFilterChange('department', e.target.value)}
            className="filter-select"
          >
            <option value="">All Departments</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>

          <select
            value={filters.semester}
            onChange={(e) => handleFilterChange('semester', e.target.value)}
            className="filter-select"
          >
            <option value="">All Semesters</option>
            {semesters.map(sem => (
              <option key={sem} value={sem}>{sem}</option>
            ))}
          </select>

          {(filters.department || filters.semester || filters.searchQuery) && (
            <button onClick={clearFilters} className="clear-filters-btn">
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Course grid - Requirements 1.1, 1.2, 1.3 */}
      {filteredCourses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h3>No Courses Found</h3>
          <p>
            {courses.length === 0 
              ? 'No courses are currently available.'
              : 'No courses match your search criteria. Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <div className="catalog-grid">
          {filteredCourses.map((course) => {
            const availableSpots = getAvailableSpots(course);
            const isFull = isCourseFull(course);
            const limitedAvailability = hasLimitedAvailability(course);
            const enrolledCount = course.enrolledStudents?.length || 0;

            return (
              <div 
                key={course._id} 
                className={`catalog-course-card ${isFull ? 'course-full' : ''} ${limitedAvailability ? 'limited-availability' : ''}`}
              >
                <div className="course-header">
                  <h4>{course.courseCode}</h4>
                  <span className="credits">{course.credits} Credits</span>
                </div>

                <h5>{course.courseName}</h5>
                <p className="description">{course.description}</p>

                <div className="course-details">
                  <p>
                    <strong>Instructor:</strong>{' '}
                    {course.instructor?.firstName} {course.instructor?.lastName}
                  </p>
                  <p><strong>Department:</strong> {course.department}</p>
                  <p><strong>Semester:</strong> {course.semester}</p>
                </div>

                {/* Enrollment info - Requirements 1.2, 1.3 */}
                <div className="enrollment-info">
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
                  
                  {/* Enrollment progress bar */}
                  <div className="enrollment-bar">
                    <div 
                      className={`enrollment-fill ${isFull ? 'full' : limitedAvailability ? 'limited' : ''}`}
                      style={{ width: `${(enrolledCount / course.maxStudents) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Enroll button - only for students */}
                {user?.role === 'student' && (
                  <div className="course-actions">
                    <button
                      onClick={() => handleEnroll(course._id)}
                      disabled={isFull || enrolling === course._id}
                      className={`enroll-btn ${isFull ? 'disabled' : ''}`}
                    >
                      {enrolling === course._id 
                        ? 'Enrolling...' 
                        : isFull 
                          ? 'Course Full' 
                          : 'Enroll'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CourseCatalog;

// Export filter function for testing
export const filterCourses = (
  courses: CourseWithInstructor[],
  filters: CourseFilters
): CourseWithInstructor[] => {
  return courses.filter(course => {
    // Filter by department
    if (filters.department && course.department !== filters.department) {
      return false;
    }

    // Filter by semester
    if (filters.semester && course.semester !== filters.semester) {
      return false;
    }

    // Search by course code, name, or description
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const matchesCode = course.courseCode.toLowerCase().includes(query);
      const matchesName = course.courseName.toLowerCase().includes(query);
      const matchesDescription = course.description.toLowerCase().includes(query);
      
      if (!matchesCode && !matchesName && !matchesDescription) {
        return false;
      }
    }

    return true;
  });
};

export type { CourseWithInstructor, CourseFilters };
