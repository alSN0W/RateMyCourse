"use client";

import React, { useEffect, useState } from "react";
import AddReviewButton from "../AddReviewButton";
import { VoteButton, VoteType } from "@/components/common/VoteButton";
import { Pagination } from "@/components/common/Pagination";
import { usePaginatedReviews } from "@/hooks/usePaginatedReviews";

interface CoursePageReviewsProps {
  id: string; // Course ID
  reviewCount: number;
}

/* Single Review Card (vertical format) */
const CourseReviewItem = ({ review, userVote }: { review: any; userVote?: VoteType }) => {
  const formattedDate = new Date(review.created_at).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Generate a consistent anonymous name based on anonymous_id
  const getAnonymousName = (anonymousId: string) => {
    if (!anonymousId) return "Anonymous Student";
    // Use the first 6 characters of the UUID to create a unique student number
    const studentNum = parseInt(anonymousId.substring(0, 6), 16) % 10000;
    return `Student ${studentNum.toString().padStart(4, '0')}`;
  };

  return (
    <div className="p-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow h-full">
      <div className="flex justify-between items-start gap-3">
        {/* Left side - Review content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col mb-2">
            <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">
              {getAnonymousName(review.anonymous_id)}
            </h4>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formattedDate}
            </span>
          </div>
          
          <p className="text-xs text-gray-700 dark:text-gray-300">
            {review.comment || "No comment provided."}
          </p>
        </div>

        {/* Right side - Vote Button */}
        <div className="flex-shrink-0">
          <VoteButton
            key={`${review.id}-${userVote || 'no-vote'}`}
            reviewId={review.id}
            initialVoteType={userVote}
            initialVoteCount={review.votes || 0}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
};

/* Main Reviews Component */
const CoursePageReviews = ({ id, reviewCount }: CoursePageReviewsProps) => {
  const [userVotes, setUserVotes] = useState<Record<string, string>>({});

  // Use pagination hook (always call hooks at top level)
  const {
    reviews,
    currentPage,
    totalPages,
    totalItems,
    isLoading,
    error,
    hasNextPage,
    hasPreviousPage,
    goToPage,
  } = usePaginatedReviews({
    targetId: id,
    targetType: 'course',
    initialPage: 1,
    limit: 10,
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  // Fetch user votes whenever reviews change
  useEffect(() => {
    const fetchUserVotes = async () => {
      if (reviews.length === 0) return;

      const reviewIds = reviews.map(r => r.id).join(',');
      
      try {
        const response = await fetch(`/api/ratings/vote?review_ids=${reviewIds}`);
        const votesData = await response.json();
        
        if (votesData.success) {
          setUserVotes(votesData.votes || {});
        }
      } catch (error) {
        console.error("Error fetching user votes:", error);
      }
    };

    fetchUserVotes();
  }, [reviews]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-muted dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-muted dark:border-gray-700 flex justify-between items-center">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">
          Student Reviews {totalItems > 0 && `(${totalItems})`}
        </h2>
        <AddReviewButton courseId={id} />
      </div>

      {/* Reviews list */}
      <div className="p-3 space-y-3">
        {isLoading && currentPage === 1 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading reviews...
          </p>
        ) : error ? (
          <p className="text-sm text-red-500 dark:text-red-400">
            Error: {error}
          </p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No reviews yet for this course.
          </p>
        ) : (
          <>
            {reviews.map((review) => (
              <CourseReviewItem 
                key={review.id} 
                review={review} 
                userVote={userVotes[review.id] as VoteType | undefined}
              />
            ))}
          </>
        )}
      </div>

      {/* Pagination - only show if more than 1 page */}
      {totalPages > 1 && (
        <div className="border-t border-muted dark:border-gray-700">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            isLoading={isLoading}
          />
        </div>
      )}
    </div>
  );
};

export default CoursePageReviews;