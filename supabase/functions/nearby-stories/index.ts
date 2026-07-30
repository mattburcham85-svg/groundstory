import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function numberParam(url: URL, name: string, fallback?: number): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return json({ error: 'method_not_allowed', message: 'Use GET.' }, 405);

  const url = new URL(request.url);
  const lat = numberParam(url, 'lat');
  const lon = numberParam(url, 'lon');
  const radiusMiles = numberParam(url, 'radius_miles', 10)!;
  const limit = numberParam(url, 'limit', 10)!;
  const category = url.searchParams.get('category') || null;

  if (lat === undefined || Number.isNaN(lat) || lat < -90 || lat > 90) {
    return json({ error: 'invalid_request', message: 'lat must be between -90 and 90.' }, 400);
  }
  if (lon === undefined || Number.isNaN(lon) || lon < -180 || lon > 180) {
    return json({ error: 'invalid_request', message: 'lon must be between -180 and 180.' }, 400);
  }
  if (Number.isNaN(radiusMiles) || radiusMiles < 0.1 || radiusMiles > 100) {
    return json({ error: 'invalid_request', message: 'radius_miles must be between 0.1 and 100.' }, 400);
  }
  if (Number.isNaN(limit) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    return json({ error: 'invalid_request', message: 'limit must be an integer between 1 and 50.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase environment variables.');
    return json({ error: 'server_configuration', message: 'History service is not configured.' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('nearby_stories', {
    query_lat: lat,
    query_lon: lon,
    radius_m: Math.round(radiusMiles * 1609.344),
    result_limit: limit,
    category_filter: category,
  });

  if (error) {
    console.error('nearby_stories RPC failed', error);
    return json({ error: 'history_query_failed', message: 'Nearby history could not be loaded.' }, 500);
  }

  const stories = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    story_type: row.story_type,
    category: row.category,
    distance_m: row.distance_m,
    rank_score: row.rank_score,
    score_components: {
      significance: row.significance_component,
      proximity: row.proximity_component,
      source_quality: row.source_quality_component,
      editorial_quality: row.editorial_quality_component,
      visual: row.visual_component,
      novelty: row.novelty_component,
    },
    location: { lat: row.latitude, lon: row.longitude },
    location_confidence: row.location_confidence,
    date_display: row.date_display,
    image_url: row.image_url,
    sources: row.sources ?? [],
  }));

  return json({
    query: { lat, lon, radius_miles: radiusMiles, limit, category },
    stories,
    generated_at: new Date().toISOString(),
  });
});
