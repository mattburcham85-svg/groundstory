-- GroundStory History Engine schema v0.1
-- Run in a Supabase SQL editor.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.story_status as enum ('draft', 'review', 'published', 'rejected', 'archived');
create type public.location_confidence as enum ('exact', 'near', 'area', 'unknown');
create type public.source_role as enum ('primary', 'secondary', 'tertiary', 'community');

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null,
  summary text not null,
  long_story text,
  story_type text not null default 'event',
  category text not null default 'local-history',
  subcategory text,
  location extensions.geography(Point, 4326),
  location_name text,
  location_precision_m integer check (location_precision_m is null or location_precision_m >= 0),
  location_confidence public.location_confidence not null default 'near',
  start_date date,
  end_date date,
  date_display text,
  significance_score smallint not null default 50 check (significance_score between 0 and 100),
  source_quality_score smallint not null default 50 check (source_quality_score between 0 and 100),
  editorial_quality_score smallint not null default 50 check (editorial_quality_score between 0 and 100),
  novelty_score smallint not null default 50 check (novelty_score between 0 and 100),
  image_url text,
  image_credit text,
  image_license text,
  external_ids jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  status public.story_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_date_range check (end_date is null or start_date is null or end_date >= start_date),
  constraint mappable_published_story check (
    status <> 'published' or (location is not null and location_confidence <> 'unknown')
  )
);

create index stories_location_gix on public.stories using gist (location);
create index stories_status_category_idx on public.stories (status, category);
create index stories_tags_gin on public.stories using gin (tags);
create index stories_external_ids_gin on public.stories using gin (external_ids);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  publisher text,
  author text,
  published_date date,
  accessed_at timestamptz,
  source_kind text,
  external_id text,
  license text,
  quality_score smallint not null default 50 check (quality_score between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (url)
);

create table public.story_sources (
  story_id uuid not null references public.stories(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  source_role public.source_role not null default 'secondary',
  supports_summary boolean not null default true,
  notes text,
  primary key (story_id, source_id)
);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  canonical_name text not null,
  aliases text[] not null default '{}',
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index entities_name_idx on public.entities (lower(canonical_name));
create index entities_external_ids_gin on public.entities using gin (external_ids);

create table public.story_entities (
  story_id uuid not null references public.stories(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  relationship text not null,
  primary key (story_id, entity_id, relationship)
);

create table public.story_feedback (
  id bigint generated always as identity primary key,
  story_id uuid not null references public.stories(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('interesting', 'not_interesting', 'incorrect', 'wrong_location', 'duplicate')),
  coarse_user_tile text,
  note text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stories_set_updated_at
before update on public.stories
for each row execute function public.set_updated_at();

-- Returns published stories within a radius and exposes score components.
create or replace function public.nearby_stories(
  query_lat double precision,
  query_lon double precision,
  radius_m integer default 25000,
  result_limit integer default 10,
  category_filter text default null
)
returns table (
  id uuid,
  title text,
  summary text,
  story_type text,
  category text,
  distance_m double precision,
  rank_score double precision,
  significance_component double precision,
  proximity_component double precision,
  source_quality_component double precision,
  editorial_quality_component double precision,
  visual_component double precision,
  novelty_component double precision,
  latitude double precision,
  longitude double precision,
  location_confidence public.location_confidence,
  date_display text,
  image_url text,
  sources jsonb
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with candidates as (
    select
      s.*,
      st_distance(
        s.location,
        st_setsrid(st_makepoint(query_lon, query_lat), 4326)::geography
      ) as computed_distance_m
    from public.stories s
    where s.status = 'published'
      and s.location is not null
      and s.location_confidence <> 'unknown'
      and (category_filter is null or s.category = category_filter)
      and st_dwithin(
        s.location,
        st_setsrid(st_makepoint(query_lon, query_lat), 4326)::geography,
        radius_m
      )
  ), scored as (
    select
      c.*,
      greatest(0, 100 * (1 - (computed_distance_m / greatest(radius_m, 1)))) as proximity_score,
      case when c.image_url is null then 0 else 100 end as visual_score
    from candidates c
  )
  select
    sc.id,
    sc.title,
    sc.summary,
    sc.story_type,
    sc.category,
    round(sc.computed_distance_m::numeric, 1)::double precision,
    round((
      0.35 * sc.significance_score
      + 0.20 * sc.proximity_score
      + 0.20 * sc.source_quality_score
      + 0.10 * sc.editorial_quality_score
      + 0.08 * sc.visual_score
      + 0.07 * sc.novelty_score
    )::numeric, 2)::double precision as rank_score,
    sc.significance_score::double precision,
    round(sc.proximity_score::numeric, 2)::double precision,
    sc.source_quality_score::double precision,
    sc.editorial_quality_score::double precision,
    sc.visual_score::double precision,
    sc.novelty_score::double precision,
    st_y(sc.location::geometry),
    st_x(sc.location::geometry),
    sc.location_confidence,
    coalesce(sc.date_display,
      case
        when sc.start_date is not null and sc.end_date is not null then extract(year from sc.start_date)::int || '–' || extract(year from sc.end_date)::int
        when sc.start_date is not null then extract(year from sc.start_date)::int::text
        else null
      end
    ),
    sc.image_url,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', so.title,
        'url', so.url,
        'publisher', so.publisher,
        'source_role', ss.source_role
      ) order by so.quality_score desc)
      from public.story_sources ss
      join public.sources so on so.id = ss.source_id
      where ss.story_id = sc.id
    ), '[]'::jsonb)
  from scored sc
  order by rank_score desc, sc.computed_distance_m asc
  limit least(greatest(result_limit, 1), 50);
$$;

-- Public read access is limited to published content and the RPC.
alter table public.stories enable row level security;
alter table public.sources enable row level security;
alter table public.story_sources enable row level security;
alter table public.entities enable row level security;
alter table public.story_entities enable row level security;
alter table public.story_feedback enable row level security;

create policy "published stories are readable"
on public.stories for select
to anon, authenticated
using (status = 'published');

create policy "sources attached to published stories are readable"
on public.sources for select
to anon, authenticated
using (exists (
  select 1
  from public.story_sources ss
  join public.stories s on s.id = ss.story_id
  where ss.source_id = sources.id and s.status = 'published'
));

create policy "published story source links are readable"
on public.story_sources for select
to anon, authenticated
using (exists (
  select 1 from public.stories s
  where s.id = story_sources.story_id and s.status = 'published'
));

grant execute on function public.nearby_stories(double precision, double precision, integer, integer, text) to anon, authenticated;
