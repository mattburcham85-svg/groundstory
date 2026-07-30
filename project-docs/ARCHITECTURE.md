# GroundStory Architecture v0.1

## Product contract

Given a latitude, longitude, and radius, GroundStory returns a small ranked set of sourced stories that help the user understand the place around them.

The system should optimize for **interesting, trustworthy, nearby, and readable**—in that order after minimum source quality is met.

## Components

### 1. Thin client

The mobile/web client handles GPS permission, place search, filters, favorites, map display, and a short-lived response cache. It never carries the full corpus.

### 2. Public History API

The first endpoint is:

```http
GET /nearby-stories?lat=35.1400&lon=-93.9200&radius_km=25&limit=5
```

It validates input, calls the database function, and returns stable JSON. Later endpoints can add story detail, routes, search, feedback, and saved collections.

### 3. Postgres + PostGIS

PostGIS stores each story's representative point as `geography(Point, 4326)`. A GiST index supports radius filtering and distance ordering.

The relational model remains the source of truth. A graph layer may eventually be added through relationship tables without requiring a separate graph database.

### 4. Ingestion workers

Workers run outside the request path. They retrieve records from licensed or public sources, normalize fields, geocode cautiously, identify duplicates, and place uncertain records into review queues.

A request must not trigger expensive broad internet research. At most it may enqueue a location for later enrichment.

### 5. Summarization

Initially, summaries are imported or human-written. AI summarization comes later and must obey these rules:

1. Every factual sentence must be supported by attached source passages.
2. The model may simplify and combine; it may not fill gaps.
3. Conflicting dates or claims must remain visibly unresolved.
4. Exact quotations are stored separately with licensing metadata.
5. Generated text is versioned and can be regenerated when sources change.

## Core data model

### stories

A story is the user-facing historical unit. It may describe an event, place, person-place connection, building, route, disaster, legend, or cultural artifact.

Important fields include:

- `story_type`
- `category`
- `location`
- `location_precision_m`
- `location_confidence`
- `start_date`, `end_date`, and display text for uncertain dates
- `significance_score`
- `editorial_quality_score`
- `source_quality_score`
- `status`

### sources

A source is a citable publication, dataset record, archival object, marker page, newspaper item, or institutional page.

### story_sources

The join table records which source supports a story and whether it is primary, secondary, or tertiary.

### entities and story_entities

These allow connected exploration: people, organizations, buildings, settlements, battles, roads, and other named subjects can link across stories.

## Ranking v0.1

Candidates must first pass publication and location-confidence rules. Then:

```text
rank =
  0.35 × significance
+ 0.20 × proximity
+ 0.20 × source quality
+ 0.10 × editorial quality
+ 0.08 × visual completeness
+ 0.07 × recency of discovery / novelty
```

`proximity` uses a smooth decay rather than a hard distance-only sort. A nationally important story can outrank a trivial nearby record, but extremely distant results receive little proximity credit.

The API returns score components so we can tune ranking based on user feedback rather than guessing blindly.

## Duplicate strategy

Potential duplicates are detected with a combination of:

- external source IDs
- normalized title similarity
- date overlap
- geographic distance
- shared entities

Duplicates are merged into one story while retaining all source records. Conflicting claims live in structured notes, not silently overwritten.

## Trust model

Each story shows its sources. Source quality is stored separately from historical significance. A sensational story with a weak source should not outrank a mundane but well-documented record merely because it is dramatic.

Location confidence is essential:

- `exact`: documented parcel, building, marker, grave, or coordinate
- `near`: known site but approximate point
- `area`: town, battlefield, neighborhood, or broad feature
- `unknown`: not eligible for map-radius results

## Privacy

Precise user coordinates should be processed transiently. Ordinary search requests do not need to be tied to an account. Analytics should round or tile locations and avoid retaining raw trails by default.

## Roadmap

### Milestone 1 — Query engine

PostGIS schema, seed records, nearby endpoint, score components, and source display.

### Milestone 2 — First ingestion

Wikimedia/Wikidata importer, duplicate detection, review workflow, and scheduled refresh.

### Milestone 3 — Arkansas pilot

Deep coverage for Logan and Sebastian Counties, including state and local sources.

### Milestone 4 — Product learning

Favorites, “worth the stop” feedback, incorrect-location reports, and ranking experiments.

### Milestone 5 — National expansion

National Register and NPS ingestion, route discovery, audio, and offline region packs.
