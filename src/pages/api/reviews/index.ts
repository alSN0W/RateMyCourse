import { withPagination, getParam } from '@/lib/withPagination';

export default withPagination({
  defaultLimit: 10,
  maxLimit: 50,
  buildQuery: async (supabase, req) => {
    const target_id   = getParam(req.query.target_id);
    const target_type = getParam(req.query.target_type);
    const sort_by     = getParam(req.query.sort_by) ?? 'created_at';
    const sort_order  = getParam(req.query.sort_order) ?? 'desc';

    // Validate
    if (!target_id || !target_type) {
      return { query: null, error: 'target_id and target_type are required' };
    }
    if (!['course', 'professor'].includes(target_type)) {
      return { query: null, error: 'target_type must be "course" or "professor"' };
    }

    const validSortColumns = ['created_at', 'votes', 'rating_value'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';

    const query = supabase
      .from('reviews')
      .select(`
        id, anonymous_id, rating_value, comment, votes,
        is_flagged, difficulty_rating, workload_rating,
        knowledge_rating, teaching_rating, approachability_rating,
        created_at, updated_at
      `, { count: 'exact' })
      .eq('target_id', target_id)
      .eq('target_type', target_type)
      .order(sortColumn, { ascending: sort_order === 'asc' });

    return { query };
  },
});

