"use client";
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCourses } from "@/hooks/useCourses";
import CoursePageHeader from "@/components/courses/course_page/CoursePageHeader";
import CoursePageStats from "@/components/courses/course_page/CoursePageStats";
import CoursePageReviews from "@/components/courses/course_page/CoursePageReviews";
import RateThisCourse from "@/components/courses/course_page/RateThisCourse";
import Example from "@/components/courses/course_page/CoursePageLoader";
import { use } from 'react';
import { QuickVoteTest } from '@/components/QuickVoteTest';
// 


export default function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { courses, isLoading } = useCourses();
  const [averageRating, setAverageRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [courseUUID, setCourseUUID] = useState<string | null>(null);

  const course = courses.find((course) => course.id === courseId);

  /* ---------- Fetch Course UUID from Supabase ---------- */
  useEffect(() => {
    if (!course?.code) return;

    const fetchCourseUUID = async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id')
        .eq('code', course.code.toUpperCase())
        .single();

      if (data && !error) {
        setCourseUUID(data.id);
      } else {
        console.error('Error fetching course UUID:', error);
      }
    };

    fetchCourseUUID();
  }, [course?.code]);

  /* ---------- Fetch Ratings to Compute Avg + Count ---------- */
  useEffect(() => {
    if (!courseUUID) return;

    const fetchRatings = async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("rating_value")
        .eq("target_id", courseUUID)
        .eq("target_type", "course");

      if (error) {
        console.error("Error fetching ratings:", error.message);
        return;
      }

      if (data && data.length > 0) {
        const total = data.reduce((sum, r) => sum + (r.rating_value || 0), 0);
        const avg = total / data.length;
        setAverageRating(parseFloat(avg.toFixed(1)));
        setReviewCount(data.length);
      } else {
        setAverageRating(0);
        setReviewCount(0);
      }
    };

    fetchRatings();
  }, [courseUUID]);

  if (isLoading) {
    return <Example />;
  }

  if (!course) {
    notFound();
  }

  return (
    <div className="container px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 min-h-[calc(100vh-6rem)] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-10">
        {/* Left Section */}
        <div className="lg:col-span-8 space-y-6 sm:space-y-8">
          {/* Course Header with modern styling */}
          <div className="bg-gradient-to-br dark:from-blue-600/20 dark:to-purple-700/20 border border-blue-500/30 rounded-2xl p-8 backdrop-blur-md shadow-2xl  shadow-blue-500/10 hover:shadow-blue-500/20 transition-all duration-300 ">
            <CoursePageHeader
              course={course}
              averageRating={averageRating}
              reviewCount={reviewCount}
            />
          </div>

          {/* Stats Grid - 2x2 Layout */}
          <div className=" rounded-2xl p-6 backdrop-blur-md shadow-xl transition-all duration-300 border border-border bg-gradient-to-b from-background to-muted/40 hover:shadow-primary/20">
            <CoursePageStats reviewCount={reviewCount} />
          </div>

          {/* Reviews Section with modern container */}
          <div className="rounded-2xl p-6 backdrop-blur-md shadow-xl transition-all duration-300 border border-border bg-gradient-to-b from-background to-muted/40 hover:shadow-primary/20">
            <CoursePageReviews id={courseUUID || course.id} reviewCount={reviewCount} />
          </div>
          <QuickVoteTest />
        </div>

        {/* Right Section - Sticky Sidebar */}
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-8 space-y-6">
            <div className="rounded-2xl p-6 backdrop-blur-md shadow-xl transition-all duration-300 border border-border bg-gradient-to-b from-background to-muted/40 hover:shadow-primary/20">
              {courseUUID && <RateThisCourse courseId={courseUUID} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
