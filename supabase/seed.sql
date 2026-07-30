-- Demonstration seed data. Replace or expand these through an ingestion pipeline.
-- Coordinates are representative points and should be reviewed before production use.

with inserted_story as (
  insert into public.stories (
    slug, title, summary, story_type, category, location, location_name,
    location_precision_m, location_confidence, date_display,
    significance_score, source_quality_score, editorial_quality_score,
    novelty_score, external_ids, tags, status, published_at
  ) values (
    'fort-smith-national-historic-site',
    'Fort Smith National Historic Site',
    'This site preserves parts of two frontier forts and the federal court associated with Judge Isaac C. Parker, whose jurisdiction extended across Indian Territory.',
    'historic-place',
    'law-and-crime',
    extensions.st_setsrid(extensions.st_makepoint(-94.4319, 35.3886), 4326)::extensions.geography,
    'Fort Smith, Arkansas',
    100,
    'exact',
    '1817–1896',
    92, 95, 82, 65,
    '{"nps":"fosi"}'::jsonb,
    array['frontier','federal court','fort','Isaac Parker'],
    'published',
    now()
  ) returning id
), inserted_source as (
  insert into public.sources (title, url, publisher, source_kind, external_id, quality_score, accessed_at)
  values (
    'Fort Smith National Historic Site',
    'https://www.nps.gov/fosi/index.htm',
    'National Park Service',
    'government-site',
    'nps:fosi',
    95,
    now()
  )
  on conflict (url) do update set accessed_at = excluded.accessed_at
  returning id
)
insert into public.story_sources (story_id, source_id, source_role)
select inserted_story.id, inserted_source.id, 'secondary'
from inserted_story, inserted_source;
