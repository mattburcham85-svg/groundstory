# GroundStory API v0.1

## Nearby stories

```http
GET /nearby-stories
```

### Query parameters

| Parameter | Required | Rules |
|---|---:|---|
| `lat` | yes | -90 to 90 |
| `lon` | yes | -180 to 180 |
| `radius_miles` | no | 0.1 to 100; default 25 |
| `limit` | no | 1 to 50; default 10 |
| `category` | no | exact category slug |

### Example response

```json
{
  "query": {
    "lat": 35.14,
    "lon": -93.92,
    "radius_miles": 25,
    "limit": 5
  },
  "stories": [
    {
      "id": "uuid",
      "title": "Example story",
      "summary": "A sourced description.",
      "category": "transportation",
      "story_type": "event",
      "distance_m": 842.1,
      "rank_score": 81.4,
      "score_components": {
        "significance": 75,
        "proximity": 93,
        "source_quality": 90,
        "editorial_quality": 70,
        "visual": 0,
        "novelty": 50
      },
      "location": { "lat": 35.142, "lon": -93.914 },
      "location_confidence": "exact",
      "date_display": "1910–1957",
      "image_url": null,
      "sources": [
        {
          "title": "Institutional source",
          "url": "https://example.org/record",
          "publisher": "Example Archive",
          "source_role": "secondary"
        }
      ]
    }
  ]
}
```

### Error format

```json
{
  "error": "invalid_request",
  "message": "lat must be between -90 and 90"
}
```
