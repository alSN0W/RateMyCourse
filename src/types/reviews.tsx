export interface Review {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string;
  semester: string;
  overallRating: number;
  workloadRating: number;
  contentRating: number;
  teachingRating: number;
  supportRating: number;
  comment: string;
  date: string;
  user: {
    id: string;
    name: string;
    avatar: string;
  };
}