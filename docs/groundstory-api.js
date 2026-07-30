/**
 * GroundStory client adapter.
 * Set apiUrl to the deployed Supabase function URL. When omitted, the adapter
 * can optionally fall back to Wikimedia for early UI development.
 */
export class GroundStoryApi {
  constructor({ apiUrl = '', anonKey = '', allowWikimediaFallback = true } = {}) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.anonKey = anonKey;
    this.allowWikimediaFallback = allowWikimediaFallback;
  }

  async nearby({ lat, lon, radiusKm = 25, limit = 10, category = '' }) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new TypeError('Valid latitude and longitude are required.');
    }

    if (this.apiUrl) {
      try {
        const url = new URL(this.apiUrl);
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lon', String(lon));
        url.searchParams.set('radius_km', String(radiusKm));
        url.searchParams.set('limit', String(limit));
        if (category) url.searchParams.set('category', category);

        const headers = { Accept: 'application/json' };
        if (this.anonKey) {
          headers.apikey = this.anonKey;
          headers.Authorization = `Bearer ${this.anonKey}`;
        }

        const response = await fetch(url, { headers });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || 'GroundStory API request failed.');
        return body;
      } catch (error) {
        if (!this.allowWikimediaFallback) throw error;
        console.warn('GroundStory API unavailable; using Wikimedia fallback.', error);
      }
    }

    if (!this.allowWikimediaFallback) {
      throw new Error('GroundStory API URL is not configured.');
    }
    return this.nearbyFromWikimedia({ lat, lon, radiusKm, limit });
  }

  async nearbyFromWikimedia({ lat, lon, radiusKm, limit }) {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'geosearch',
      ggsprimary: 'all',
      ggsnamespace: '0',
      ggsradius: String(Math.min(radiusKm * 1000, 10000)),
      ggslimit: String(Math.min(Math.max(limit, 1), 50)),
      ggscoord: `${lat}|${lon}`,
      prop: 'coordinates|pageimages|extracts|info',
      exintro: '1',
      explaintext: '1',
      exsentences: '4',
      piprop: 'thumbnail',
      pithumbsize: '700',
      inprop: 'url',
    });

    const response = await fetch(url);
    if (!response.ok) throw new Error('Wikimedia fallback failed.');
    const data = await response.json();
    const stories = Object.values(data.query?.pages ?? {}).map((page) => {
      const coord = page.coordinates?.[0] ?? {};
      return {
        id: `wikipedia:${page.pageid}`,
        title: page.title,
        summary: page.extract || 'A nearby place with a documented story.',
        story_type: 'reference-page',
        category: 'local-history',
        distance_m: coord.dist ?? null,
        rank_score: null,
        score_components: null,
        location: { lat: coord.lat, lon: coord.lon },
        location_confidence: 'area',
        date_display: null,
        image_url: page.thumbnail?.source ?? null,
        sources: [{
          title: page.title,
          url: page.fullurl || `https://en.wikipedia.org/?curid=${page.pageid}`,
          publisher: 'Wikipedia',
          source_role: 'tertiary',
        }],
      };
    });

    return {
      query: { lat, lon, radius_km: radiusKm, limit },
      stories,
      fallback: 'wikimedia',
      generated_at: new Date().toISOString(),
    };
  }
}
