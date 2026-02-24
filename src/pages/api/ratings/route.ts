import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createFuzzyTimestamp, sanitizeContent } from '@/lib/anonymization';
import { RatingInsert } from '@/types/supabase';

// POST /api/ratings - Create a new rating
export async function POST(request: Request) {
  try {
    // Get session to verify authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Get JSON data from request
    const json = await request.json();
    const { 
      targetId,
      targetType,
      ratingMetrics,
      comment,
      semester,
      year
    } = json;
    
    // Validate required fields
    if (!targetId || !targetType || !ratingMetrics || !semester || !year) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Validate target type
    if (targetType !== 'course' && targetType !== 'professor') {
      return NextResponse.json(
        { error: 'Invalid target type' },
        { status: 400 }
      );
    }
    
    // Get the anonymous ID for the authenticated user
    const { data: anonymousData, error: anonymousError } = await supabase
      .from('users')
      .select('anonymous_id')
      .eq('auth_id', session.user.id)
      .single();
    
    if (anonymousError || !anonymousData?.anonymous_id) {
      console.error('Error fetching anonymous ID:', anonymousError);
      return NextResponse.json(
        { error: 'Failed to verify anonymous identity' },
        { status: 500 }
      );
    }
    
    // Process the rating data
    const sanitizedComment = comment ? sanitizeContent(comment) : null;
    const displayDate = createFuzzyTimestamp();
    
    // Check if user has already rated this target
    const { data: existingRating, error: checkError } = await supabase
      .from('ratings')
      .select('id')
      .eq('anonymous_id', anonymousData.anonymous_id)
      .eq('target_id', targetId)
      .eq('target_type', targetType)
      .single();
    
    // If user has already rated, return error
    if (existingRating) {
      return NextResponse.json(
        { error: 'You have already rated this item. Please edit your existing rating instead.' },
        { status: 409 }
      );
    }
    
    // Create the rating
    const ratingData: RatingInsert = {
      anonymous_id: anonymousData.anonymous_id,
      target_id: targetId,
      target_type: targetType,
      rating_metrics: ratingMetrics,
      comment: sanitizedComment,
      semester,
      year,
      display_date: displayDate,
      helpfulness_score: 0,
      is_flagged: false
    };
    
    // Use admin client to create rating (to bypass RLS if needed)
    const { data, error } = await supabaseAdmin
      .from('ratings')
      .insert(ratingData)
      .select('id')
      .single();
    
    if (error) {
      console.error('Error creating rating:', error);
      return NextResponse.json(
        { error: 'Failed to submit rating' },
        { status: 500 }
      );
    }
    
    // Update the rating statistics view or trigger
    // This would typically be handled by a database trigger
    
    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        displayDate
      }
    });
    
  } catch (error) {
    console.error('Unexpected error in ratings API:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

// GET /api/ratings - Get ratings with filters
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('targetId');
    const targetType = searchParams.get('targetType');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    
    // Validate required params
    if (!targetId || !targetType) {
      return NextResponse.json(
        { error: 'Missing required parameters: targetId and targetType' },
        { status: 400 }
      );
    }
    
    // Validate target type
    if (targetType !== 'course' && targetType !== 'professor') {
      return NextResponse.json(
        { error: 'Invalid target type' },
        { status: 400 }
      );
    }
    
    // Calculate pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    // Query ratings
    let query = supabase
      .from('ratings')
      .select('id, rating_metrics, comment, semester, year, display_date, created_at, helpfulness_score')
      .eq('target_id', targetId)
      .eq('target_type', targetType)
      .eq('is_flagged', false)
      .range(from, to);
    
    // Apply sorting
    if (sortBy === 'helpfulness') {
      query = query.order('helpfulness_score', { ascending: sortOrder === 'asc' });
    } else if (sortBy === 'date') {
      query = query.order('created_at', { ascending: sortOrder === 'asc' });
    } else if (sortBy === 'rating') {
      // For rating, we need to sort by the overall metric within the rating_metrics JSONB field
      // This might need a different approach depending on your database
      query = query.order('rating_metrics->overall', { ascending: sortOrder === 'asc' });
    }

    const { data: ratings, error, count } = await query;
    
    if (error) {
      console.error('Error fetching ratings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch ratings' },
        { status: 500 }
      );
    }
    
    // Get total count for pagination
    const { count: totalCount, error: countError } = await supabase
      .from('ratings')
      .select('*', { count: 'exact', head: true })
      .eq('target_id', targetId)
      .eq('target_type', targetType)
      .eq('is_flagged', false);
    
    if (countError) {
      console.error('Error counting ratings:', countError);
    }
    
    return NextResponse.json({
      data: ratings,
      meta: {
        page,
        pageSize,
        totalCount: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / pageSize)
      }
    });
    
  } catch (error) {
    console.error('Unexpected error in ratings API:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}