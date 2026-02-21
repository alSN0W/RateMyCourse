import { withPagination, getParam } from '@/lib/withPagination';

export default withPagination({
  defaultLimit: 10,
  maxLimit: 50,
  buildQuery: async (supabase, req) => {
    const target_id   = getParam(req.query.target_id);
    const target_type = getParam(req.query.target_type);
    const sort_by     = getParam(req.query.sort_by) ?? 'created_at';
    const sort_order  = getParam(req.query.sort_order) ?? 'desc';

    // Validate required params
    if (!target_id || !target_type) {
      return { query: null, error: 'target_id and target_type are required' };
    }
    if (!['course', 'professor'].includes(target_type)) {
      return { query: null, error: 'target_type must be "course" or "professor"' };
    }

    
    // USE THIS WHEN YOU PASS UUIDS AS TARGET IDS
    // In your page component, fetch the course/professor first:
    //
    // const { data: course } = await supabase
    //   .from('courses')
    //   .select('id, code, title, ...')
    //   .eq('code', params.code)
    //   .single();
    //
    // Then pass the UUID:
    // <CoursePageReviews id={course.id} />

    let actualTargetId = target_id;

    // Check if target_id is a code (not a UUID)
    // UUIDs have format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (contains dashes)
    // Codes are simpler: mal100, cs101, etc. (no dashes)
    const isUUID = target_id.includes('-');

    if (!isUUID) {
      // It's a code, need to look up the UUID
      if (target_type === 'course') {
        const { data: course, error: lookupError } = await supabase
          .from('courses')
          .select('id')
          .eq('code', target_id.toUpperCase()) // Case-insensitive lookup
          .single();

        if (lookupError || !course) {
          return { query: null, error: `Course with code "${target_id}" not found` };
        }

        actualTargetId = course.id;
      } else if (target_type === 'professor') {
        // For professors, you might use email or name as the code
        // Adjust this based on how you identify professors
        const { data: professor, error: lookupError } = await supabase
          .from('professors')
          .select('id')
          .eq('email', target_id.toLowerCase())
          .single();

        if (lookupError || !professor) {
          return { query: null, error: `Professor with identifier "${target_id}" not found` };
        }

        actualTargetId = professor.id;
      }
    }

    // Validate sort column
    const validSortColumns = ['created_at', 'votes', 'rating_value'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';

    // Build query with the actual UUID
    const query = supabase
      .from('reviews')
      .select(`
        id, anonymous_id, rating_value, comment, votes,
        is_flagged, difficulty_rating, workload_rating,
        knowledge_rating, teaching_rating, approachability_rating,
        created_at, updated_at
      `, { count: 'exact' })
      .eq('target_id', actualTargetId)  // ← Use resolved UUID
      .eq('target_type', target_type)
      .order(sortColumn, { ascending: sort_order === 'asc' });

    return { query };
  },
});