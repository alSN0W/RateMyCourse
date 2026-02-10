// QUICK INLINE TEST - Copy this anywhere in your app

'use client';

import { useVotes } from '@/hooks/useVote';

export function QuickVoteTest() {
  const testReviewId = 'test-123';
  
  const { votes, voteCounts, castVote, toggleVote, removeVote } = useVotes({
    reviewIds: [testReviewId],
    initialCounts: {
      [testReviewId]: { upvotes: 10, downvotes: 3 }
    }
  });

  const currentVote = votes[testReviewId];
  const counts = voteCounts[testReviewId] || { upvotes: 0, downvotes: 0 };

  return (
    <div className="p-4 border rounded">
      <h3 className="font-bold mb-2">Vote Test</h3>
      
      <p className="text-sm mb-2">
        Current: <strong>{currentVote || 'none'}</strong> | 
        👍 {counts.upvotes} | 
        👎 {counts.downvotes}
      </p>

      <div className="flex gap-2">
        <button 
          onClick={() => castVote(testReviewId, 'upvote')}
          className="px-3 py-1 bg-green-500 text-white rounded"
        >
          Upvote
        </button>
        
        <button 
          onClick={() => castVote(testReviewId, 'downvote')}
          className="px-3 py-1 bg-red-500 text-white rounded"
        >
          Downvote
        </button>

        <button 
          onClick={() => toggleVote(testReviewId, 'upvote')}
          className="px-3 py-1 bg-blue-500 text-white rounded"
        >
          Toggle ↑
        </button>

        <button 
          onClick={() => removeVote(testReviewId)}
          className="px-3 py-1 bg-gray-500 text-white rounded"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// Usage: Add to any page
